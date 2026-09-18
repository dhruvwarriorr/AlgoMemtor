import { createHash, randomUUID } from 'node:crypto'

import {
  RecommendationDismissalResponseSchema,
  RecommendationDismissalsResponseSchema,
  RecommendationFeedResponseSchema,
  RecommendationFeedbackResponseSchema,
  type ExternalProblemSummary,
  type LearnerProfile,
  type RecommendationBatch,
  type RecommendationDismissal,
  type RecommendationFeedResponse,
  type ProviderFreshness,
  type ProviderKey,
  type ProviderWarning,
} from '@algomemtor/shared-contracts'

import {
  AiRecommendationClientError,
  type AiRecommendationClient,
  type AiRankingRequest,
  type AiRankingResponse,
} from '../integrations/ai/ai-recommendation-client.js'
import type { ProblemProvider } from '../integrations/providers/problem-provider.js'
import { ProviderError } from '../errors/provider-error.js'
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
import type { ProgressRepository } from '../repositories/progress-repository.js'
import type { StructuredLogger } from '../utils/structured-logger.js'
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
  providers?: readonly ProblemProvider[]
  learnerProfileRepository: LearnerProfileRepository
  recommendationRepository: RecommendationRepository
  problemActionRepository: ProblemActionRepository
  aiRecommendationClient: AiRecommendationClient
  logger: StructuredLogger
  progressRepository?: ProgressRepository
  memoryGenerationEnabled?: boolean
}

type ProviderSnapshot = {
  problems: ExternalProblemSummary[]
  warnings: ProviderWarning[]
  freshness: ProviderFreshness[]
}

const identity = (provider: string, externalId: string) =>
  `${provider}:${externalId}`

export const AI_RANKING_VERSION = 'ai-gemini-rag-v1'
export const AI_FALLBACK_RANKING_VERSION = 'ai-rag-v1-fallback-deterministic-v2'
export const AI_CANDIDATE_LIMIT = 40
const AI_POLICY_VERSION = 'personalized-coaching-rag-v2'
const reusableRankingVersions = new Set([
  AI_RANKING_VERSION,
  AI_FALLBACK_RANKING_VERSION,
])

const profileSignature = (
  profile: ReturnType<typeof deriveRankingProfile>,
  source: LearnerProfile | null,
) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        policyVersion: AI_POLICY_VERSION,
        focusTopics: profile.focusTopics,
        preferredTopics: profile.preferredTopics,
        ratingBand: profile.ratingBand,
        preferredProviders: profile.preferredProviders,
        targetDifficulty: profile.targetDifficulty ?? null,
        providerPreferred: profile.providerPreferred,
        goal: source?.goal ?? null,
        experience: source?.experience ?? null,
        learningPreferences: source?.learningPreferences ?? [],
        recommendationPreference: profile.recommendationPreference ?? null,
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
  const grouped = new Map<string, ProblemActionRecord[]>()

  for (const action of actions
    .filter((item) => item.actionType === 'status_changed')
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )) {
    const key = identity(action.provider, action.externalId)
    const values = grouped.get(key) ?? []
    values.push(action)
    grouped.set(key, values)
  }

  const latest = new Map<string, ProblemActionRecord>()
  for (const [key, values] of grouped) {
    const manual = values.filter((value) => value.evidenceSource === 'manual')
    const current = manual.at(-1) ?? values.at(-1)
    if (current !== undefined) latest.set(key, current)
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

const criteriaFor = (
  profile: ReturnType<typeof deriveRankingProfile>,
  source: LearnerProfile | null,
  provider?: ProviderKey,
) => ({
  ...(provider === undefined ? {} : { provider }),
  topics: profile.focusTopics,
  minRating: profile.ratingBand.min,
  maxRating: profile.ratingBand.max,
  pageSize: RECOMMENDATION_BATCH_SIZE,
  profileSignature: profileSignature(profile, source),
})

const unsafeReasonPatterns = [
  /\b(?:https?:\/\/|www\.)/i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /@[A-Z0-9_]{2,}/i,
  /(?:\+?\d[\d\s().-]{7,}\d)/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
]

export const isSafeRecommendationReason = (reason: string) =>
  !unsafeReasonPatterns.some((pattern) => pattern.test(reason))

export const repeatsRecommendationPreferenceText = (
  recommendationPreference: string | undefined,
  reason: string,
) => {
  if (recommendationPreference === undefined) {
    return false
  }

  const preferenceWords = recommendationPreference
    .toLowerCase()
    .match(/[a-z0-9]+/g)
  if (preferenceWords === null || preferenceWords.length < 4) {
    return false
  }
  const normalizedReason = (
    reason.toLowerCase().match(/[a-z0-9]+/g) ?? []
  ).join(' ')

  return preferenceWords.some((_, index) => {
    if (index > preferenceWords.length - 4) {
      return false
    }
    return normalizedReason.includes(
      preferenceWords.slice(index, index + 4).join(' '),
    )
  })
}

const metaFor = (snapshot: ProviderSnapshot) => ({
  partial: snapshot.warnings.some((warning) => warning.code !== 'STALE_DATA'),
  stale: snapshot.freshness.some((item) => item.stale),
  warnings: snapshot.warnings,
  providers: snapshot.freshness,
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
  private readonly memoryInvalidations = new Map<string, Date>()

  private readonly providers: readonly ProblemProvider[]

  constructor(private readonly options: RecommendationServiceOptions) {
    this.providers = options.providers ?? [options.provider]
    if (this.providers.length === 0) {
      throw new Error('At least one recommendation provider is required.')
    }
  }

  invalidateForLearner(authUserId: string) {
    this.memoryInvalidations.set(authUserId, new Date())
  }

  private async loadSnapshot() {
    const settled = await Promise.allSettled(
      this.providers.map((provider) => provider.search({})),
    )
    const problems: ExternalProblemSummary[] = []
    const warnings: ProviderWarning[] = []
    const freshness: ProviderFreshness[] = []
    let successful = 0
    for (const [index, result] of settled.entries()) {
      const provider = this.providers[index]
      if (provider === undefined) continue
      if (result.status === 'fulfilled') {
        successful += 1
        problems.push(...result.value.problems)
        warnings.push(...result.value.warnings)
        freshness.push(result.value.freshness)
        continue
      }
      const error =
        result.reason instanceof ProviderError ? result.reason : null
      freshness.push({
        provider: provider.key,
        availability: 'unavailable',
        stale: false,
        ...(error === null ? {} : { lastErrorCode: error.code }),
      })
      warnings.push({
        provider: provider.key,
        code: error?.code ?? 'PROVIDER_UNAVAILABLE',
        message: `${provider.key} recommendation candidates are temporarily unavailable.`,
      })
    }
    if (successful === 0) {
      const failure = settled.find((result) => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    }
    return { problems, warnings, freshness }
  }

  private buildAiRequest(
    authUserId: string,
    requestId: string,
    profile: LearnerProfile | null,
    rankingProfile: ReturnType<typeof deriveRankingProfile>,
    shortlist: readonly { problem: ExternalProblemSummary }[],
  ): AiRankingRequest {
    return {
      requestId,
      learnerId: authUserId,
      expectedCount: Math.min(RECOMMENDATION_BATCH_SIZE, shortlist.length),
      learner: {
        goal: profile?.goal ?? 'start_competitive_programming',
        experience: profile?.experience ?? 'complete_beginner',
        focusTopics: rankingProfile.focusTopics,
        preferredTopics: rankingProfile.preferredTopics,
        preferredDifficulty: rankingProfile.ratingBand,
        learningPreferences: profile?.learningPreferences ?? [
          'solve_problems_directly',
        ],
        ...(rankingProfile.recommendationPreference === undefined
          ? {}
          : {
              recommendationPreference: rankingProfile.recommendationPreference,
            }),
      },
      candidates: shortlist.map(({ problem }) => ({
        provider: problem.provider,
        externalId: problem.externalId,
        title: problem.title,
        ...(typeof problem.providerDifficulty === 'number'
          ? { rating: problem.providerDifficulty }
          : {}),
        ...(problem.normalizedDifficulty === undefined
          ? {}
          : { normalizedDifficulty: problem.normalizedDifficulty }),
        topics: problem.topics,
        ...(problem.solvedCount === undefined
          ? {}
          : { solvedCount: problem.solvedCount }),
      })),
    }
  }

  private validateAiResponse(
    response: AiRankingResponse,
    shortlist: readonly { problem: ExternalProblemSummary }[],
    expectedCount: number,
    recommendationPreference: string | undefined,
  ) {
    if (response.fallback || response.items.length !== expectedCount) {
      return null
    }

    const candidatesByIdentity = new Map(
      shortlist.map(({ problem }) => [
        identity(problem.provider, problem.externalId),
        problem,
      ]),
    )
    const returnedIdentities = new Set<string>()
    const ranked = response.items.flatMap((item) => {
      const itemIdentity = identity(item.provider, item.externalId)
      const problem = candidatesByIdentity.get(itemIdentity)

      if (
        problem === undefined ||
        returnedIdentities.has(itemIdentity) ||
        !isSafeRecommendationReason(item.reason) ||
        repeatsRecommendationPreferenceText(
          recommendationPreference,
          item.reason,
        )
      ) {
        return []
      }

      returnedIdentities.add(itemIdentity)
      return [{ problem, score: item.score, reason: item.reason }]
    })

    return ranked.length === expectedCount ? ranked : null
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
      rankingMode: batch.rankingMode,
      rankingVersion: batch.rankingVersion ?? DETERMINISTIC_RANKING_VERSION,
      items,
    }
  }

  private async generate(
    authUserId: string,
    forceRefresh: boolean,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<RecommendationFeedResponse> {
    const [profile, actions, batches, feedback, snapshot, progressChange] =
      await Promise.all([
        this.options.learnerProfileRepository.findByAuthUserId(authUserId),
        this.options.problemActionRepository.listByAuthUserId(authUserId),
        this.options.recommendationRepository.listBatchesByAuthUserId(
          authUserId,
        ),
        this.options.recommendationRepository.listFeedbackByAuthUserId(
          authUserId,
        ),
        this.loadSnapshot(),
        this.options.progressRepository?.latestRelevantChangeAt(authUserId),
      ])
    const rankingProfile = deriveRankingProfile(profile)
    const criteria = criteriaFor(
      rankingProfile,
      profile,
      this.providers.length === 1 ? this.providers[0]?.key : undefined,
    )
    const latestBatch = batches[0]
    const latestFeedback = feedback.reduce<Date | undefined>(
      (latest, item) =>
        latest === undefined || item.updatedAt > latest
          ? item.updatedAt
          : latest,
      undefined,
    )
    const latestAction = [
      latestRelevantActionAt(actions),
      progressChange,
      latestFeedback,
      this.memoryInvalidations.get(authUserId),
    ].reduce<Date | undefined>(
      (latest, current) =>
        current !== undefined && (latest === undefined || current > latest)
          ? current
          : latest,
      undefined,
    )
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
      latestBatch.rankingVersion !== undefined &&
      reusableRankingVersions.has(latestBatch.rankingVersion) &&
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
    const shortlist = rankRecommendations({
      candidates: snapshot.problems,
      history,
      profile: rankingProfile,
      preferNewItems: forceRefresh,
      limit: AI_CANDIDATE_LIMIT,
    })

    if (shortlist.length === 0) {
      return RecommendationFeedResponseSchema.parse({
        data: null,
        meta: metaFor(snapshot),
      })
    }

    const aiRequest = this.buildAiRequest(
      authUserId,
      requestId,
      profile,
      rankingProfile,
      shortlist,
    )
    const candidateIds = aiRequest.candidates.map((candidate) =>
      identity(candidate.provider, candidate.externalId),
    )
    let ranked = shortlist.slice(0, RECOMMENDATION_BATCH_SIZE)
    let rankingMode: 'deterministic' | 'ai' = 'deterministic'
    let rankingVersion = AI_FALLBACK_RANKING_VERSION

    try {
      const response = await this.options.aiRecommendationClient.rank(
        aiRequest,
        signal,
      )
      const aiRanked = this.validateAiResponse(
        response,
        shortlist,
        aiRequest.expectedCount,
        rankingProfile.recommendationPreference,
      )
      const fallback = aiRanked === null
      const fallbackReason = response.fallbackReason ?? 'invalid_output'

      if (aiRanked !== null) {
        ranked = aiRanked
        rankingMode = 'ai'
        rankingVersion = AI_RANKING_VERSION
      }

      this.options.logger.info(
        fallback ? 'ai_ranking_fallback' : 'ai_ranking_completed',
        {
          requestId,
          service: 'core-api',
          route: '/api/recommendations',
          model: response.model,
          fallback,
          ...(fallback ? { fallbackReason } : {}),
          candidateIds,
          returnedIds: response.items.map((item) =>
            identity(item.provider, item.externalId),
          ),
          candidateCount: candidateIds.length,
          selectedCount: response.items.length,
          latencyMs: response.latencyMs,
          ...(response.inputTokens === undefined
            ? {}
            : { inputTokens: response.inputTokens }),
          ...(response.outputTokens === undefined
            ? {}
            : { outputTokens: response.outputTokens }),
          ...(response.estimatedCostUsd === undefined
            ? {}
            : { estimatedCostUsd: response.estimatedCostUsd }),
        },
      )
    } catch (error) {
      if (
        error instanceof AiRecommendationClientError &&
        error.code === 'AI_CANCELLED'
      ) {
        throw error
      }
      const fallbackReason =
        error instanceof AiRecommendationClientError &&
        error.code === 'AI_TIMEOUT'
          ? 'timeout'
          : 'service_unavailable'

      this.options.logger.warn('ai_ranking_fallback', {
        requestId,
        service: 'core-api',
        route: '/api/recommendations',
        model: 'unavailable',
        fallback: true,
        fallbackReason,
        candidateIds,
        returnedIds: [],
        candidateCount: candidateIds.length,
        selectedCount: 0,
      })
    }

    const savedBatch =
      await this.options.recommendationRepository.saveBatchByAuthUserId(
        authUserId,
        {
          requestCriteria: criteria,
          rankingMode,
          rankingVersion,
          items: ranked.map((item, index) => ({
            provider: item.problem.provider,
            externalId: item.problem.externalId,
            position: index + 1,
            score: item.score,
            reason: item.reason,
          })),
        },
      )
    const invalidatedAt = this.memoryInvalidations.get(authUserId)
    if (
      invalidatedAt !== undefined &&
      invalidatedAt.getTime() <= savedBatch.createdAt.getTime()
    ) {
      this.memoryInvalidations.delete(authUserId)
    }
    const view = this.toBatchView(savedBatch, snapshot, actions, feedback)

    return RecommendationFeedResponseSchema.parse({
      data: view,
      meta: metaFor(snapshot),
    })
  }

  async getFeed(
    authUserId: string,
    forceRefresh = false,
    requestId: string = randomUUID(),
    signal?: AbortSignal,
  ) {
    if (signal !== undefined) {
      return this.generate(authUserId, forceRefresh, requestId, signal)
    }

    const key = `${authUserId}:${forceRefresh ? 'refresh' : 'current'}`
    const existing = this.inFlight.get(key)

    if (existing !== undefined) {
      return existing
    }

    const pending = this.generate(authUserId, forceRefresh, requestId).finally(
      () => {
        this.inFlight.delete(key)
      },
    )
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

    if (
      this.options.memoryGenerationEnabled !== false &&
      this.options.progressRepository !== undefined
    ) {
      try {
        await this.options.progressRepository.enqueueJob({
          authUserId,
          jobType: 'memory_generation',
          evidenceType: 'recommendation_feedback',
          evidenceId: feedback.id,
          idempotencyKey: `memory:recommendation_feedback:${feedback.id}:${feedback.updatedAt.toISOString()}`,
        })
      } catch (error) {
        this.options.logger.warn('memory_outbox_enqueue_failed', {
          evidenceType: 'recommendation_feedback',
          errorCode: 'OUTBOX_UNAVAILABLE',
        })
        void error
      }
    }
    this.invalidateForLearner(authUserId)

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

  async restore(authUserId: string, provider: ProviderKey, externalId: string) {
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
