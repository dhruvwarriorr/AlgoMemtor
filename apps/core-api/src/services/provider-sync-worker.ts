import { randomUUID } from 'node:crypto'

import {
  LinkableProviderSchema,
  ProviderSyncStateSchema,
  type ProviderKey,
} from '@algomemtor/shared-contracts'

import {
  ProviderAccountChangedError,
  ProviderAccountNotLinkedError,
  ProviderAccountStatsService,
} from './provider-account-stats-service.js'
import type { ProviderProfileService } from './provider-profile-service.js'
import type { ProviderAccountRepository } from '../repositories/provider-account-repository.js'
import type {
  ProviderDataRepository,
  SolvedProblemTags,
} from '../repositories/provider-data-repository.js'
import type { ProviderActivityDataFetcher } from '../integrations/provider-accounts/provider-public-stats.js'
import { ProviderPublicStatsError } from '../integrations/provider-accounts/provider-public-stats.js'
import type {
  ProviderSyncJobRecord,
  ProviderSyncRepository,
} from '../repositories/provider-sync-repository.js'
import {
  structuredLogger,
  type StructuredLogger,
} from '../utils/structured-logger.js'

const DEFAULT_SYNC_INTERVAL_MS = 1 * 60 * 60 * 1000
const DEFAULT_JITTER_MS = 5 * 60 * 1000
// A first sync pages through a learner's whole public history at about one
// request per second, so a lease must outlast several minutes of work.
const DEFAULT_LEASE_MS = 10 * 60 * 1000
const RETRY_DELAYS_MS = [60_000, 300_000] as const
// Stored solves whose tags are looked up per sync; the rest wait for later
// syncs so one run stays bounded.
const DEFAULT_TAG_BATCH_SIZE = 40
// A follow-up job that only advances a history backfill that a provider's
// rate limit or per-run budget cut short.
export const BACKFILL_CONTINUATION_JOB = 'backfill_continuation'

export class ProviderSyncConsentRequiredError extends Error {
  readonly code = 'PUBLIC_STATS_CONSENT_REQUIRED'

  constructor() {
    super('Public synchronization consent is not enabled for this account.')
    this.name = 'ProviderSyncConsentRequiredError'
  }
}

export type ProviderSyncWorkerOptions = {
  repository: ProviderSyncRepository
  providerAccountRepository: ProviderAccountRepository
  statsService: ProviderAccountStatsService
  profileService?: ProviderProfileService
  dataRepository?: ProviderDataRepository
  activityFetchers?: readonly ProviderActivityDataFetcher[]
  logger?: Pick<StructuredLogger, 'warn' | 'info'>
  now?: () => Date
  random?: () => number
  syncIntervalMs?: number
  jitterMs?: number
  leaseMs?: number
  maxAttempts?: number
  tagBatchSize?: number
  // Recomputes the learner's activity summary after new data is stored.
  activityService?: { refresh(authUserId: string): Promise<unknown> }
}

export class ProviderSyncWorker {
  private readonly logger
  private readonly now
  private readonly random
  private readonly syncIntervalMs
  private readonly jitterMs
  private readonly leaseMs
  private readonly maxAttempts
  private readonly tagBatchSize
  private processing = false
  private activeRun: Promise<boolean> | undefined

  constructor(private readonly options: ProviderSyncWorkerOptions) {
    this.logger = options.logger ?? structuredLogger
    this.now = options.now ?? (() => new Date())
    this.random = options.random ?? Math.random
    this.syncIntervalMs = options.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS
    this.jitterMs = options.jitterMs ?? DEFAULT_JITTER_MS
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
    this.maxAttempts = options.maxAttempts ?? 3
    this.tagBatchSize = options.tagBatchSize ?? DEFAULT_TAG_BATCH_SIZE
    if (
      this.syncIntervalMs <= 0 ||
      this.jitterMs < 0 ||
      this.leaseMs <= 0 ||
      this.maxAttempts < 1 ||
      !Number.isInteger(this.tagBatchSize) ||
      this.tagBatchSize < 0
    ) {
      throw new Error(
        'The provider synchronization worker configuration is invalid.',
      )
    }
  }

  async processOnce() {
    if (this.processing) return false
    this.processing = true
    const run = this.processOne()
    this.activeRun = run
    try {
      return await run
    } finally {
      this.processing = false
      if (this.activeRun === run) this.activeRun = undefined
    }
  }

  async waitForIdle() {
    await this.activeRun
  }

  private async processOne() {
    const leaseOwner = randomUUID()
    const job = await this.options.repository.claimNext(
      leaseOwner,
      this.now(),
      this.leaseMs,
    )
    if (job === null) return false
    const startedAt = this.now()
    // The activity cursor lives on the sync state; carry it through every
    // state write so a failed run does not force a full history refetch.
    // Without an account ID the stored state could belong to an earlier
    // handle, so such a job starts from a full fetch.
    const previousCursor =
      job.cursor ??
      (job.providerAccountId === undefined
        ? undefined
        : (
            await this.options.repository.getState(
              job.userId,
              job.provider,
              job.providerAccountId,
            )
          ).cursor)
    let cursor = previousCursor
    await this.options.repository.saveState(
      job.userId,
      job.provider,
      {
        capability: job.capability,
        status: 'running',
        attempts: job.attempts,
        ...(cursor === undefined ? {} : { cursor }),
        lastStartedAt: startedAt.toISOString(),
        ...(job.runAfter === undefined ? {} : { nextRunAt: job.runAfter }),
        completeness: 'unknown',
        stale: false,
      },
      job.providerAccountId,
    )
    try {
      const result = await this.processJob(job, previousCursor)
      cursor = result.cursor
      await this.options.repository.complete(job.id, leaseOwner)
      const completedAt = this.now()
      const account =
        await this.options.providerAccountRepository.findByAuthUserIdAndProvider(
          job.userId,
          LinkableProviderSchema.parse(job.provider),
        )
      const nextRunAt = await this.scheduleNextRun(job)
      await this.options.repository.saveState(
        job.userId,
        job.provider,
        {
          capability: job.capability,
          status:
            account?.statsComplete === true && !result.partial
              ? 'complete'
              : 'partial',
          attempts: job.attempts,
          ...(cursor === undefined ? {} : { cursor }),
          lastStartedAt: startedAt.toISOString(),
          lastSucceededAt: completedAt.toISOString(),
          ...(nextRunAt === undefined
            ? {}
            : { nextRunAt: nextRunAt.toISOString() }),
          completeness:
            account?.statsComplete === true && !result.partial
              ? 'complete'
              : 'partial',
          ...(result.activityErrorCode === undefined
            ? {}
            : { lastErrorCode: result.activityErrorCode }),
          stale:
            account?.statsErrorCode !== null &&
            account?.statsErrorCode !== undefined,
        },
        job.providerAccountId,
      )
      this.logger.info('provider_sync_job_completed', {
        provider: job.provider,
        capability: job.capability,
        attempts: job.attempts,
      })
      await this.refreshActivity(job)
    } catch (error) {
      const errorCode = this.safeErrorCode(error)
      const canRetryProviderError =
        !(error instanceof ProviderPublicStatsError) || error.retryable
      const terminalWithoutReschedule =
        error instanceof ProviderAccountNotLinkedError ||
        error instanceof ProviderSyncConsentRequiredError
      const retryable =
        !terminalWithoutReschedule &&
        canRetryProviderError &&
        job.attempts < this.maxAttempts
      if (retryable) {
        const delay =
          RETRY_DELAYS_MS[job.attempts - 1] ?? RETRY_DELAYS_MS.at(-1) ?? 300_000
        const retryAt = new Date(this.now().getTime() + delay)
        await this.options.repository.fail(
          job.id,
          leaseOwner,
          errorCode,
          retryAt,
        )
        await this.options.repository.saveState(
          job.userId,
          job.provider,
          {
            capability: job.capability,
            status: 'stale',
            attempts: job.attempts,
            ...(cursor === undefined ? {} : { cursor }),
            lastStartedAt: startedAt.toISOString(),
            nextRunAt: retryAt.toISOString(),
            lastErrorCode: errorCode,
            completeness: 'partial',
            stale: true,
          },
          job.providerAccountId,
        )
      } else {
        await this.options.repository.markFailed(job.id, leaseOwner, errorCode)
        const nextRunAt = terminalWithoutReschedule
          ? undefined
          : await this.scheduleNextRun(job)
        await this.options.repository.saveState(
          job.userId,
          job.provider,
          {
            capability: job.capability,
            status: terminalWithoutReschedule ? 'disabled' : 'error',
            attempts: job.attempts,
            ...(cursor === undefined ? {} : { cursor }),
            lastStartedAt: startedAt.toISOString(),
            ...(nextRunAt === undefined
              ? {}
              : { nextRunAt: nextRunAt.toISOString() }),
            lastErrorCode: errorCode,
            completeness: 'unknown',
            stale: true,
          },
          job.providerAccountId,
        )
      }
      this.logger.warn('provider_sync_job_failed', {
        provider: job.provider,
        capability: job.capability,
        attempts: job.attempts,
        errorCode,
        retryable,
      })
    }
    return true
  }

  private async scheduleNextRun(job: ProviderSyncJobRecord) {
    const account =
      await this.options.providerAccountRepository.findByAuthUserIdAndProvider(
        job.userId,
        LinkableProviderSchema.parse(job.provider),
      )
    if (account === null || !account.syncEnabled) return undefined
    const latestScheduled = await this.options.repository.findLatest(
      job.userId,
      job.provider,
      account.id,
      'linked_user_sync',
    )
    if (
      latestScheduled?.status === 'queued' &&
      new Date(latestScheduled.runAfter) > this.now()
    ) {
      return new Date(latestScheduled.runAfter)
    }
    const nextRunAt = new Date(
      this.now().getTime() +
        this.syncIntervalMs +
        Math.floor(this.random() * Math.max(1, this.jitterMs)),
    )
    try {
      await this.options.repository.enqueue({
        userId: job.userId,
        providerAccountId: account.id,
        provider: job.provider,
        capability: job.capability,
        jobType: 'linked_user_sync',
        idempotencyKey: `provider-sync:scheduled:${job.userId}:${job.provider}:${nextRunAt.toISOString()}`,
        runAfter: nextRunAt,
      })
    } catch (error) {
      this.logger.warn('provider_sync_schedule_failed', {
        provider: job.provider,
        capability: job.capability,
        errorCode: this.safeErrorCode(error),
      })
      return undefined
    }
    return nextRunAt
  }

  private async processJob(
    job: ProviderSyncJobRecord,
    previousCursor: string | undefined,
  ) {
    if (job.capability !== 'linked_user_sync') {
      throw new Error(
        `Unsupported provider synchronization capability: ${job.capability}`,
      )
    }
    const account =
      await this.options.providerAccountRepository.findByAuthUserIdAndProvider(
        job.userId,
        LinkableProviderSchema.parse(job.provider),
      )
    if (
      account === null ||
      (job.providerAccountId !== undefined &&
        job.providerAccountId !== account.id)
    ) {
      throw new ProviderAccountNotLinkedError()
    }
    if (account.publicStatsConsentAt === null) {
      throw new ProviderSyncConsentRequiredError()
    }
    const continuation = job.jobType === BACKFILL_CONTINUATION_JOB
    let partial = false
    let cursor = previousCursor
    // Kept on the sync state so a swallowed activity failure stays visible.
    let activityErrorCode: string | undefined
    try {
      if (!continuation) {
        await this.options.statsService.refresh(
          job.userId,
          LinkableProviderSchema.parse(job.provider),
        )
      }
    } catch (error) {
      if (
        error instanceof ProviderAccountChangedError ||
        error instanceof ProviderAccountNotLinkedError ||
        !(error instanceof ProviderPublicStatsError)
      ) {
        throw error
      }
      partial = true
      this.options.logger?.warn('provider_stats_sync_failed', {
        provider: job.provider,
        errorCode: this.safeErrorCode(error),
      })
    }
    if (this.options.profileService !== undefined && !continuation) {
      try {
        await this.options.profileService.refresh(
          job.userId,
          LinkableProviderSchema.parse(job.provider),
        )
      } catch (error) {
        partial = true
        this.options.logger?.warn('provider_profile_sync_failed', {
          provider: job.provider,
          errorCode:
            error instanceof Error &&
            'code' in error &&
            typeof error.code === 'string'
              ? error.code
              : 'PROVIDER_PROFILE_SYNC_FAILED',
        })
      }
    }
    const activityFetcher = this.options.activityFetchers?.find(
      (fetcher) => fetcher.provider === job.provider,
    )
    if (
      activityFetcher !== undefined &&
      this.options.dataRepository !== undefined
    ) {
      try {
        const activity = await activityFetcher.fetchActivityData(
          account.externalHandle,
          undefined,
          {
            ...(previousCursor === undefined ? {} : { cursor: previousCursor }),
            ...(continuation ? { backfillOnly: true } : {}),
          },
        )
        await this.options.dataRepository.saveSubmissions(
          job.userId,
          account.id,
          activity.submissions,
        )
        await this.options.dataRepository.saveSolvedProblems(
          job.userId,
          account.id,
          activity.solvedProblems,
        )
        await this.options.dataRepository.saveRatingChanges(
          job.userId,
          account.id,
          activity.ratingChanges,
        )
        await this.options.dataRepository.saveContestParticipations(
          job.userId,
          account.id,
          activity.contestParticipations,
        )
        partial ||= !activity.complete
        // A fetch that saw the whole history hands back a new resume point.
        // Otherwise keep the old one: this run only stored rows newer than
        // it, so the next fetch still stops at the same place without gaps.
        if (activity.cursor !== undefined) cursor = activity.cursor
        // Keep going in short steps while history remains, but stop the
        // chain when a continuation made no progress (for example, a
        // provider that keeps refusing); the hourly sync then takes over.
        const progressed = !continuation || cursor !== previousCursor
        if (activity.continueAfterMs !== undefined && progressed) {
          await this.enqueueContinuation(
            job,
            account.id,
            activity.continueAfterMs,
          )
        }
      } catch (error) {
        partial = true
        activityErrorCode = this.safeErrorCode(error)
        this.options.logger?.warn('provider_activity_sync_failed', {
          provider: job.provider,
          errorCode: this.safeErrorCode(error),
        })
      }
      await this.enrichSolvedTags(job, account.id, activityFetcher)
    }
    return {
      partial,
      cursor,
      ...(activityErrorCode === undefined ? {} : { activityErrorCode }),
    }
  }

  private async refreshActivity(job: ProviderSyncJobRecord) {
    if (this.options.activityService === undefined) return
    try {
      await this.options.activityService.refresh(job.userId)
    } catch (error) {
      // The sync itself succeeded; the summary catches up on the next run.
      this.logger.warn('learner_activity_refresh_failed', {
        provider: job.provider,
        errorCode: this.safeErrorCode(error),
      })
    }
  }

  private async enqueueContinuation(
    job: ProviderSyncJobRecord,
    providerAccountId: string,
    delayMs: number,
  ) {
    const runAfter = new Date(this.now().getTime() + Math.max(30_000, delayMs))
    try {
      await this.options.repository.enqueue({
        userId: job.userId,
        providerAccountId,
        provider: job.provider,
        capability: job.capability,
        jobType: BACKFILL_CONTINUATION_JOB,
        idempotencyKey: `provider-sync:continue:${job.userId}:${job.provider}:${runAfter.toISOString()}`,
        runAfter,
      })
      this.logger.info('provider_backfill_continuation_queued', {
        provider: job.provider,
        delayMs,
      })
    } catch (error) {
      this.logger.warn('provider_backfill_continuation_failed', {
        provider: job.provider,
        errorCode: this.safeErrorCode(error),
      })
    }
  }

  private async enrichSolvedTags(
    job: ProviderSyncJobRecord,
    providerAccountId: string,
    fetcher: ProviderActivityDataFetcher,
  ) {
    const dataRepository = this.options.dataRepository
    if (
      fetcher.fetchProblemTags === undefined ||
      dataRepository === undefined ||
      this.tagBatchSize === 0
    ) {
      return
    }
    try {
      const pending = await dataRepository.listUntaggedSolvedIds(
        job.userId,
        providerAccountId,
        this.tagBatchSize,
        this.now(),
      )
      if (pending.length === 0) return
      const found = await fetcher.fetchProblemTags(pending)
      const tags = new Map<string, SolvedProblemTags>()
      for (const [externalId, value] of found) {
        if (value !== null) tags.set(externalId, value)
      }
      await dataRepository.saveSolvedTags(
        job.userId,
        providerAccountId,
        pending.filter((externalId) => found.has(externalId)),
        tags,
        this.now(),
      )
      this.logger.info('provider_tag_enrichment_completed', {
        provider: job.provider,
        requested: pending.length,
        checked: found.size,
        tagged: tags.size,
      })
    } catch (error) {
      // Tags improve topic evidence but are not required for a sync to
      // succeed; the untagged backlog is retried on the next run.
      this.logger.warn('provider_tag_enrichment_failed', {
        provider: job.provider,
        errorCode: this.safeErrorCode(error),
      })
    }
  }

  private safeErrorCode(error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      return error.code
    }
    return 'PROVIDER_SYNC_FAILED'
  }
}

export const providerSyncIntervalMs = DEFAULT_SYNC_INTERVAL_MS
