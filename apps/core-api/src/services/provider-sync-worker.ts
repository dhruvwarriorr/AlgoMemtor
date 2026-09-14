import { randomUUID } from 'node:crypto'

import {
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
import type { ProviderDataRepository } from '../repositories/provider-data-repository.js'
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

const DEFAULT_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000
const DEFAULT_JITTER_MS = 30 * 60 * 1000
const DEFAULT_LEASE_MS = 60 * 1000
const RETRY_DELAYS_MS = [60_000, 300_000] as const

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
}

export class ProviderSyncWorker {
  private readonly logger
  private readonly now
  private readonly random
  private readonly syncIntervalMs
  private readonly jitterMs
  private readonly leaseMs
  private readonly maxAttempts
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
    if (
      this.syncIntervalMs <= 0 ||
      this.jitterMs < 0 ||
      this.leaseMs <= 0 ||
      this.maxAttempts < 1
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
    await this.options.repository.saveState(
      job.userId,
      job.provider,
      {
        capability: job.capability,
        status: 'running',
        attempts: job.attempts,
        ...(job.cursor === undefined ? {} : { cursor: job.cursor }),
        lastStartedAt: startedAt.toISOString(),
        ...(job.runAfter === undefined ? {} : { nextRunAt: job.runAfter }),
        completeness: 'unknown',
        stale: false,
      },
      job.providerAccountId,
    )
    try {
      const result = await this.processJob(job)
      await this.options.repository.complete(job.id, leaseOwner)
      const completedAt = this.now()
      const nextRunAt = new Date(
        completedAt.getTime() +
          this.syncIntervalMs +
          Math.floor(this.random() * Math.max(1, this.jitterMs)),
      )
      const account =
        await this.options.providerAccountRepository.findByAuthUserIdAndProvider(
          job.userId,
          job.provider,
        )
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
          ...(job.cursor === undefined ? {} : { cursor: job.cursor }),
          lastStartedAt: startedAt.toISOString(),
          lastSucceededAt: completedAt.toISOString(),
          nextRunAt: nextRunAt.toISOString(),
          completeness:
            account?.statsComplete === true && !result.partial
              ? 'complete'
              : 'partial',
          stale:
            account?.statsErrorCode !== null &&
            account?.statsErrorCode !== undefined,
        },
        job.providerAccountId,
      )
      if (account !== null && account.syncEnabled) {
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
        }
      }
      this.logger.info('provider_sync_job_completed', {
        provider: job.provider,
        capability: job.capability,
        attempts: job.attempts,
      })
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
            ...(job.cursor === undefined ? {} : { cursor: job.cursor }),
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
            ...(job.cursor === undefined ? {} : { cursor: job.cursor }),
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
        job.provider,
      )
    if (account === null || !account.syncEnabled) return undefined
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

  private async processJob(job: ProviderSyncJobRecord) {
    if (job.capability !== 'linked_user_sync') {
      throw new Error(
        `Unsupported provider synchronization capability: ${job.capability}`,
      )
    }
    const account =
      await this.options.providerAccountRepository.findByAuthUserIdAndProvider(
        job.userId,
        job.provider,
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
    let partial = false
    try {
      await this.options.statsService.refresh(job.userId, job.provider)
    } catch (error) {
      if (
        error instanceof ProviderAccountChangedError ||
        error instanceof ProviderAccountNotLinkedError
      ) {
        throw error
      }
      partial = true
      this.options.logger?.warn('provider_stats_sync_failed', {
        provider: job.provider,
        errorCode: this.safeErrorCode(error),
      })
    }
    if (this.options.profileService !== undefined) {
      try {
        await this.options.profileService.refresh(job.userId, job.provider)
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
      } catch (error) {
        partial = true
        this.options.logger?.warn('provider_activity_sync_failed', {
          provider: job.provider,
          errorCode: this.safeErrorCode(error),
        })
      }
    }
    return { partial }
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
