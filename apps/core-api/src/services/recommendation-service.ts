import { createHash } from 'node:crypto'

import {
  RecommendationDismissalResponseSchema,
  RecommendationDismissalsResponseSchema,
  RecommendationFeedResponseSchema,
  RecommendationFeedbackResponseSchema,
  type ExternalProblemSummary,
  type RecommendationBatch,
  type RecommendationDismissal,
  type RecommendationFeedResponse,
} from '@algomemtor/shared-contracts'

import type { ProblemProvider } from '../integrations/providers/problem-provider.js'
import type {
  ProblemActionRecord,
  ProblemActionRepository,
} from '../repositories/problem-action-repository.js'
import {
  type RecommendationBatchRecord,
  type RecommendationFeedbackRecord,
  type RecommendationRepository,
} from '../repositories/recommendation-repository.js'
import type { LearnerProfileRepository } from '../repositories/learner-profile-repository.js'
import {
  DETERMINISTIC_RANKING_VERSION,
  deriveRankingProfile,
  deriveRecommendationHistory,
  latestRelevantActionAt,
  rankRecommendations,
  RECOMMENDATION_BATCH_SIZE,
} from './recommendation-ranking.js'

type RecommendationServiceOptions = {
  provider: ProblemProvider
  learnerProfileRepository: LearnerProfileRepository
  recommendationRepository: RecommendationRepository
  problemActionRepository: ProblemActionRepository
}

type ProviderSnapshot = Awaited<ReturnType<ProblemProvider['search']>>

const identity = (provider: string, externalId: string) =>
  `${provider}:${externalId}`

const profileSignature = (profile: ReturnType<typeof deriveRankingProfile>) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        focusTopics: profile.focusTopics,
        preferredTopics: profile.preferredTopics,
        ratingBand: profile.ratingBand,
        providerPreferred: profile.providerPreferred,
      }),
    )
    .digest('hex')

const serializeFeedback = (feedback: RecommendationFeedbackRecord) => ({
  id: feedback.id,
  recommendationItemId: feedback.recommendationItemId,
  ...(feedback.usefulness === undefined
    ? {}
    : { usefulness: feedback.usefulness }),
  ...(feedback.perceivedDifficulty === undefined
    ? {}
    : { perceivedDifficulty: feedback.perceivedDifficulty }),
  ...(feedback.notes === undefined ? {} : { notes: feedback.notes }),
  createdAt: feedback.createdAt.toISOString(),
  updatedAt: feedback.updatedAt.toISOString(),
})

const latestStatusByIdentity = (actions: readonly ProblemActionRecord[]) => {
  const latest = new Map<string, ProblemActionRecord>()

  for (const action of actions
    .filter((item) => item.actionType === 'status_changed')
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )) {
    latest.set(identity(action.provider, action.externalId), action)
  }

  return latest
}

const currentDismissals = (actions: readonly ProblemActionRecord[]) => {
  const latest = new Map<string, ProblemActionRecord>()

  for (const action of actions
    .filter(
      (item) =>
        item.actionType === 'dismissed' ||
        item.actionType === 'dismissal_restored',
    )
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )) {
    latest.set(identity(action.provider, action.externalId), action)
  }

  return [...latest.values()]
    .filter((action) => action.actionType === 'dismissed')
    .map((action) => ({
      provider: action.provider,
      externalId: action.externalId,
      dismissedAt: action.occurredAt,
    }))
    .sort(
      (left, right) =>
        right.dismissedAt.getTime() - left.dismissedAt.getTime() ||
        identity(left.provider, left.externalId).localeCompare(
          identity(right.provider, right.externalId),
        ),
    )
}

const recommendationProblem = (
  problem: ExternalProblemSummary,
  statusByIdentity: ReadonlyMap<string, ProblemActionRecord>,
  reason: string,
) => {
  const status = statusByIdentity.get(
    identity(problem.provider, problem.externalId),
  )?.learnerStatus

  return {
    ...problem,
    ...(status === undefined ? {} : { learnerStatus: status }),
    recommendationReason: reason,
  }
}

const criteriaFor = (profile: ReturnType<typeof deriveRankingProfile>) => ({
  provider: 'codeforces' as const,
  topics: profile.focusTopics,
  minRating: profile.ratingBand.min,
  maxRating: profile.ratingBand.max,
  pageSize: RECOMMENDATION_BATCH_SIZE,
  profileSignature: profileSignature(profile),
})

const metaFor = (snapshot: ProviderSnapshot) => ({
  partial: snapshot.warnings.some((warning) => warning.code !== 'STALE_DATA'),
  stale: snapshot.freshness.stale,
  warnings: snapshot.warnings,
  providers: [snapshot.freshness],
})

export class RecommendationNotFoundError extends Error {
  constructor(message = 'The recommendation could not be found.') {
    super(message)
    this.name = 'RecommendationNotFoundError'
  }
}

export class RecommendationService {
  private readonly inFlight = new Map<
    string,
    Promise<RecommendationFeedResponse>
  >()

  constructor(private readonly options: RecommendationServiceOptions) {}

  private async loadSnapshot() {
    return this.options.provider.search({})
  }

  private toBatchView(
    batch: RecommendationBatchRecord,
    snapshot: ProviderSnapshot,
    actions: readonly ProblemActionRecord[],
    feedback: readonly RecommendationFeedbackRecord[],
  ): RecommendationBatch | null {
    const candidatesByIdentity = new Map(
      snapshot.problems.map((problem) => [
        identity(problem.provider, problem.externalId),
        problem,
      ]),
    )
    const statusByIdentity = latestStatusByIdentity(actions)
    const feedbackByItem = new Map(
      feedback.map((item) => [item.recommendationItemId, item]),
    )
    const items = batch.items.flatMap((item) => {
      const problem = candidatesByIdentity.get(
        identity(item.provider, item.externalId),
      )

      if (problem === undefined) {
        return []
      }

      const parsedProblem = recommendationProblem(
        problem,
        statusByIdentity,
        item.reason,
      )
      const existingFeedback = feedbackByItem.get(item.id)

      return [
        {
          id: item.id,
          provider: item.provider,
          externalId: item.externalId,
          position: item.position,
          score: item.score ?? 0,
          reason: item.reason,
          problem: parsedProblem,
          ...(existingFeedback === undefined
            ? {}
            : { feedback: serializeFeedback(existingFeedback) }),
        },
      ]
    })

    if (items.length === 0) {
      return null
    }

    return {
      id: batch.id,
      generatedAt: batch.createdAt.toISOString(),
      rankingMode: 'deterministic',
      rankingVersion: batch.rankingVersion ?? DETERMINISTIC_RANKING_VERSION,
      items,
    }
  }

  private async generate(
    authUserId: string,
    forceRefresh: boolean,
  ): Promise<RecommendationFeedResponse> {
    const [profile, actions, batches, feedback, snapshot] = await Promise.all([
      this.options.learnerProfileRepository.findByAuthUserId(authUserId),
      this.options.problemActionRepository.listByAuthUserId(authUserId),
      this.options.recommendationRepository.listBatchesByAuthUserId(authUserId),
      this.options.recommendationRepository.listFeedbackByAuthUserId(
        authUserId,
      ),
      this.loadSnapshot(),
    ])
    const rankingProfile = deriveRankingProfile(profile)
    const criteria = criteriaFor(rankingProfile)
    const latestBatch = batches[0]
    const latestAction = latestRelevantActionAt(actions)
    const availableProblemIds = new Set(
      snapshot.problems.map((problem) =>
        identity(problem.provider, problem.externalId),
      ),
    )
    const latestBatchProblemsAvailable =
      latestBatch?.items.every((item) =>
        availableProblemIds.has(identity(item.provider, item.externalId)),
      ) ?? false
    const reusable =
      !forceRefresh &&
      latestBatch !== undefined &&
      latestBatch.rankingVersion === DETERMINISTIC_RANKING_VERSION &&
      latestBatch.requestCriteria.profileSignature ===
        criteria.profileSignature &&
      latestBatchProblemsAvailable &&
      (latestAction === undefined || latestAction < latestBatch.createdAt)

    if (reusable) {
      const view = this.toBatchView(latestBatch, snapshot, actions, feedback)

      if (view !== null) {
        return RecommendationFeedResponseSchema.parse({
          data: view,
          meta: metaFor(snapshot),
        })
      }
    }

    const history = deriveRecommendationHistory(
      actions,
      batches,
      snapshot.problems,
    )
    const ranked = rankRecommendations({
      candidates: snapshot.problems,
      history,
      profile: rankingProfile,
      preferNewItems: forceRefresh,
    })

    if (ranked.length === 0) {
      return RecommendationFeedResponseSchema.parse({
        data: null,
        meta: metaFor(snapshot),
      })
    }

    const savedBatch =
      await this.options.recommendationRepository.saveBatchByAuthUserId(
        authUserId,
        {
          requestCriteria: criteria,
          rankingMode: 'deterministic',
          rankingVersion: DETERMINISTIC_RANKING_VERSION,
          items: ranked.map((item, index) => ({
            provider: item.problem.provider,
            externalId: item.problem.externalId,
            position: index + 1,
            score: item.score,
            reason: item.reason,
          })),
        },
      )
    const view = this.toBatchView(savedBatch, snapshot, actions, feedback)

    return RecommendationFeedResponseSchema.parse({
      data: view,
      meta: metaFor(snapshot),
    })
  }

  async getFeed(authUserId: string, forceRefresh = false) {
    const key = `${authUserId}:${forceRefresh ? 'refresh' : 'current'}`
    const existing = this.inFlight.get(key)

    if (existing !== undefined) {
      return existing
    }

    const pending = this.generate(authUserId, forceRefresh).finally(() => {
      this.inFlight.delete(key)
    })
    this.inFlight.set(key, pending)

    return pending
  }

  async saveFeedback(
    authUserId: string,
    recommendationItemId: string,
    input: Parameters<RecommendationRepository['saveFeedbackByAuthUserId']>[2],
  ) {
    const feedback =
      await this.options.recommendationRepository.saveFeedbackByAuthUserId(
        authUserId,
        recommendationItemId,
        input,
      )

    return RecommendationFeedbackResponseSchema.parse({
      data: serializeFeedback(feedback),
    })
  }

  async dismiss(authUserId: string, recommendationItemId: string) {
    const item =
      await this.options.recommendationRepository.findItemByAuthUserId(
        authUserId,
        recommendationItemId,
      )

    if (item === null) {
      throw new RecommendationNotFoundError()
    }

    const recorded =
      await this.options.problemActionRepository.appendByAuthUserId(
        authUserId,
        {
          provider: item.provider,
          externalId: item.externalId,
          actionType: 'dismissed',
          recommendationBatchId: item.batchId,
        },
      )

    return RecommendationDismissalResponseSchema.parse({
      data: {
        provider: item.provider,
        externalId: item.externalId,
        dismissedAt: recorded.occurredAt.toISOString(),
      },
    })
  }

  async restore(
    authUserId: string,
    provider: 'codeforces',
    externalId: string,
  ) {
    const actions =
      await this.options.problemActionRepository.listByAuthUserId(authUserId)
    const active = currentDismissals(actions).find(
      (item) => item.provider === provider && item.externalId === externalId,
    )

    if (active === undefined) {
      throw new RecommendationNotFoundError(
        'That problem is not currently dismissed.',
      )
    }

    await this.options.problemActionRepository.appendByAuthUserId(authUserId, {
      provider,
      externalId,
      actionType: 'dismissal_restored',
    })

    return {
      provider,
      externalId,
      restored: true as const,
    }
  }

  async listDismissals(authUserId: string) {
    const [actions, snapshot] = await Promise.all([
      this.options.problemActionRepository.listByAuthUserId(authUserId),
      this.loadSnapshot(),
    ])
    const problemByIdentity = new Map(
      snapshot.problems.map((problem) => [
        identity(problem.provider, problem.externalId),
        problem,
      ]),
    )
    const data: RecommendationDismissal[] = currentDismissals(actions).map(
      (dismissal) => {
        const problem = problemByIdentity.get(
          identity(dismissal.provider, dismissal.externalId),
        )

        return {
          provider: dismissal.provider,
          externalId: dismissal.externalId,
          dismissedAt: dismissal.dismissedAt.toISOString(),
          ...(problem === undefined ? {} : { problem }),
        }
      },
    )

    return RecommendationDismissalsResponseSchema.parse({ data })
  }
}
