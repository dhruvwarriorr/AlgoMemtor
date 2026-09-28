import type {
  ExternalProblemSummary,
  LearnerActivityDigest,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import type { ProblemMetadataCache } from '../integrations/providers/problem-metadata-cache'
import type { LearnerActivityRepository } from '../repositories/learner-activity-repository'
import type { ProgressRepository } from '../repositories/progress-repository'
import type { ProviderAccountRepository } from '../repositories/provider-account-repository'
import type { ProviderDataRepository } from '../repositories/provider-data-repository'
import type { ProviderProfileRepository } from '../repositories/provider-profile-repository'
import type { ProviderSyncRepository } from '../repositories/provider-sync-repository'
import type { StructuredLogger } from '../utils/structured-logger'
import {
  computeLearnerActivityDigest,
  describeActivityChange,
  digestSourceHash,
  type DigestAccount,
  type DigestCatalogEntry,
} from './learner-activity-digest'

export type LearnerActivityServiceOptions = {
  repository: LearnerActivityRepository
  accountRepository: ProviderAccountRepository
  dataRepository: ProviderDataRepository
  profileRepository?: ProviderProfileRepository
  syncRepository?: ProviderSyncRepository
  problemMetadataCache?: ProblemMetadataCache
  // Queues memory evidence; the memory worker checks AI consent before
  // anything leaves AlgoMemtor.
  progressRepository?: Pick<ProgressRepository, 'enqueueJob'>
  logger: Pick<StructuredLogger, 'info' | 'warn'>
  now?: () => Date
}

const CATALOG_LOOKUP_CHUNK = 500

// Keeps the learner's synced-activity summary current and turns meaningful
// changes into memory evidence.
export class LearnerActivityService {
  private readonly now: () => Date

  constructor(private readonly options: LearnerActivityServiceOptions) {
    this.now = options.now ?? (() => new Date())
  }

  async get(authUserId: string) {
    const stored = await this.options.repository.getDigest(authUserId)
    return stored?.digest ?? (await this.refresh(authUserId)).digest
  }

  async refresh(
    authUserId: string,
  ): Promise<{ digest: LearnerActivityDigest; changed: boolean }> {
    const data = this.options.dataRepository
    const [accounts, submissions, solved, contests, ratings, profiles] =
      await Promise.all([
        this.options.accountRepository.findAllByAuthUserId(authUserId),
        data.listSubmissions(authUserId),
        data.listSolvedProblems(authUserId),
        data.listContestParticipations(authUserId),
        data.listRatingChanges(authUserId),
        this.options.profileRepository?.findLatestByAuthUserId(authUserId) ??
          Promise.resolve([]),
      ])

    const digestAccounts: DigestAccount[] = await Promise.all(
      accounts.map(async (account) => {
        const connectorRows = submissions
          .filter(
            (row) =>
              row.provider === account.provider &&
              row.provenance.extractionStrategy === 'authenticated_connector',
          )
          .sort((left, right) =>
            right.provenance.fetchedAt.localeCompare(left.provenance.fetchedAt),
          )
        const state =
          connectorRows.length > 0
            ? undefined
            : await this.options.syncRepository?.getState(
                authUserId,
                account.provider,
                account.id,
              )
        const providerRatings = ratings
          .filter((change) => change.provider === account.provider)
          .sort((left, right) =>
            left.occurredAt.localeCompare(right.occurredAt),
          )
        const profile = profiles.find(
          (item) => item.provider === account.provider,
        )
        const rating = providerRatings.at(-1)?.newRating ?? profile?.rating
        return {
          provider: account.provider,
          handle: account.externalHandle,
          verified: account.verificationStatus === 'verified',
          historyComplete:
            connectorRows.length > 0
              ? connectorRows[0]?.completeness === 'complete'
              : state?.completeness === 'complete',
          ...(account.solvedCount === null
            ? {}
            : { platformSolvedCount: account.solvedCount }),
          ...(rating === undefined ? {} : { rating }),
          ...(providerRatings.length === 0
            ? {}
            : {
                maxRating: Math.max(
                  ...providerRatings.map((change) => change.newRating),
                ),
              }),
        }
      }),
    )

    const digest = computeLearnerActivityDigest({
      now: this.now(),
      accounts: digestAccounts,
      submissions,
      solved,
      contests,
      catalog: await this.catalog([
        ...submissions.map((row) => ({
          provider: row.provider,
          externalId: row.externalId,
        })),
        ...solved.map((row) => ({
          provider: row.provider,
          externalId: row.externalId,
        })),
      ]),
    })

    const previous = await this.options.repository.getDigest(authUserId)
    const sourceHash = digestSourceHash(digest)
    if (previous?.sourceHash === sourceHash) {
      return { digest: previous.digest, changed: false }
    }
    await this.options.repository.saveDigest(authUserId, digest, sourceHash)
    await this.recordChange(authUserId, previous?.digest ?? null, digest)
    return { digest, changed: true }
  }

  private async recordChange(
    authUserId: string,
    previous: LearnerActivityDigest | null,
    next: LearnerActivityDigest,
  ) {
    const note = describeActivityChange(previous, next)
    const enqueue = this.options.progressRepository?.enqueueJob
    if (note === null || enqueue === undefined) return
    try {
      const changeId = await this.options.repository.addChange(authUserId, note)
      if (changeId === null) return
      await enqueue.call(this.options.progressRepository, {
        authUserId,
        jobType: 'memory_generation',
        evidenceType: 'provider_activity',
        evidenceId: changeId,
        idempotencyKey: `provider-activity:${changeId}`,
      })
      this.options.logger.info('learner_activity_change_recorded', {
        noteLength: note.length,
      })
    } catch (error) {
      // The digest is saved; memory evidence is a best-effort follow-up.
      this.options.logger.warn('learner_activity_change_failed', {
        errorCode:
          error instanceof Error &&
          'code' in error &&
          typeof error.code === 'string'
            ? error.code
            : 'LEARNER_ACTIVITY_CHANGE_FAILED',
      })
    }
  }

  private async catalog(
    references: readonly { provider: ProviderKey; externalId: string }[],
  ) {
    const entries = new Map<string, DigestCatalogEntry>()
    const lookup = this.options.problemMetadataCache?.findByReferences
    if (lookup === undefined) return entries
    const unique = [
      ...new Map(
        references.map((item) => [`${item.provider}:${item.externalId}`, item]),
      ).values(),
    ]
    for (let index = 0; index < unique.length; index += CATALOG_LOOKUP_CHUNK) {
      let problems: ExternalProblemSummary[]
      try {
        problems = await lookup.call(
          this.options.problemMetadataCache,
          unique.slice(index, index + CATALOG_LOOKUP_CHUNK),
        )
      } catch {
        // Titles and ratings are optional enrichment.
        continue
      }
      for (const problem of problems) {
        const rating =
          typeof problem.providerDifficulty === 'number' &&
          Number.isFinite(problem.providerDifficulty) &&
          problem.providerDifficulty > 0
            ? Math.round(problem.providerDifficulty)
            : undefined
        entries.set(`${problem.provider}:${problem.externalId}`, {
          title: problem.title,
          ...(rating === undefined ? {} : { rating }),
          topics: problem.topics,
        })
      }
    }
    return entries
  }
}
