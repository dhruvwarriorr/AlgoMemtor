import { z } from 'zod'

import { ProviderKeySchema } from '@algomemtor/shared-contracts'

const safeRequestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)
const topicSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const aiRankingCandidateSchema = z
  .object({
    provider: ProviderKeySchema,
    externalId: z.string().trim().min(1).max(128).regex(/^\S+$/),
    title: z.string().trim().min(1).max(512),
    rating: z.number().finite().nonnegative().optional(),
    normalizedDifficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    topics: z.array(topicSchema).min(1).max(25),
    solvedCount: z.number().int().nonnegative().optional(),
  })
  .strict()

export const AiRankingRequestSchema = z
  .object({
    requestId: safeRequestIdSchema,
    learnerId: z.uuid(),
    expectedCount: z.number().int().min(1).max(10),
    learner: z
      .object({
        goal: z.string().trim().min(1).max(64),
        experience: z.string().trim().min(1).max(64),
        focusTopics: z.array(topicSchema).max(25),
        preferredTopics: z.array(topicSchema).max(25),
        preferredDifficulty: z
          .object({
            min: z.number().finite().nonnegative(),
            max: z.number().finite().nonnegative(),
          })
          .strict(),
        learningPreferences: z.array(z.string().trim().min(1).max(64)).max(16),
        recommendationPreference: z.string().trim().min(1).max(500).optional(),
        topicEvidence: z
          .array(
            z
              .object({
                topic: topicSchema,
                observedAttemptedProblems: z.number().int().nonnegative(),
                observedSolvedProblems: z.number().int().nonnegative(),
              })
              .strict(),
          )
          .max(25)
          .optional(),
        // Deterministic learner signals, sent only under AI consent.
        roadmapFocusTopics: z.array(topicSchema).max(8).optional(),
        weakTopics: z.array(topicSchema).max(8).optional(),
        underPracticedTopics: z.array(topicSchema).max(8).optional(),
        contestSummary: z
          .object({
            contestsLast90Days: z.number().int().min(0).max(1_000),
            currentRating: z.number().finite().min(0).max(5_000).optional(),
            ratingChange90Days: z
              .number()
              .finite()
              .min(-5_000)
              .max(5_000)
              .optional(),
            trend: z.enum(['rising', 'steady', 'falling']).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    candidates: z.array(aiRankingCandidateSchema).min(1).max(40),
  })
  .strict()
  .superRefine(({ candidates, expectedCount, learner }, context) => {
    if (expectedCount !== Math.min(10, candidates.length)) {
      context.addIssue({
        code: 'custom',
        message:
          'Expected count must equal ten or the candidate count when smaller.',
        path: ['expectedCount'],
      })
    }

    if (learner.preferredDifficulty.min > learner.preferredDifficulty.max) {
      context.addIssue({
        code: 'custom',
        message: 'Minimum difficulty cannot exceed maximum difficulty.',
        path: ['learner', 'preferredDifficulty'],
      })
    }

    const evidenceTopics = new Set<string>()
    learner.topicEvidence?.forEach(({ topic }, index) => {
      if (evidenceTopics.has(topic)) {
        context.addIssue({
          code: 'custom',
          message: 'Topic evidence must be unique.',
          path: ['learner', 'topicEvidence', index, 'topic'],
        })
      }
      evidenceTopics.add(topic)
    })

    const identities = new Set<string>()
    candidates.forEach((candidate, index) => {
      const identity = `${candidate.provider}:${candidate.externalId}`
      if (identities.has(identity)) {
        context.addIssue({
          code: 'custom',
          message: 'Candidates must be unique.',
          path: ['candidates', index, 'externalId'],
        })
      }
      identities.add(identity)
    })
  })

export type AiRankingRequest = z.infer<typeof AiRankingRequestSchema>

export const AiRankingFallbackReasonSchema = z.enum([
  'not_configured',
  'timeout',
  'provider_error',
  'invalid_output',
  'audit_unavailable',
  'service_unavailable',
])

export const AiRankingResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            provider: ProviderKeySchema,
            externalId: z.string().trim().min(1).max(128).regex(/^\S+$/),
            score: z.number().finite().min(0).max(1),
            reason: z.string().trim().min(1).max(240),
          })
          .strict(),
      )
      .max(10),
    model: z.string().trim().min(1).max(128),
    fallback: z.boolean(),
    fallbackReason: AiRankingFallbackReasonSchema.optional(),
    latencyMs: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    estimatedCostUsd: z.number().finite().nonnegative().optional(),
    auditId: z.uuid().optional(),
  })
  .strict()
  .superRefine(({ fallback, fallbackReason, items }, context) => {
    if (fallback && fallbackReason === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Fallback responses require a stable reason.',
        path: ['fallbackReason'],
      })
    }

    if (fallback && items.length > 0) {
      context.addIssue({
        code: 'custom',
        message: 'Fallback responses cannot contain ranked items.',
        path: ['items'],
      })
    }

    if (!fallback && fallbackReason !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Successful responses cannot include a fallback reason.',
        path: ['fallbackReason'],
      })
    }
  })

export type AiRankingResponse = z.infer<typeof AiRankingResponseSchema>

export interface AiRecommendationClient {
  rank(
    input: AiRankingRequest,
    signal?: AbortSignal,
  ): Promise<AiRankingResponse>
}

export class AiRecommendationClientError extends Error {
  constructor(
    readonly code:
      'AI_TIMEOUT' | 'AI_UNAVAILABLE' | 'AI_INVALID_RESPONSE' | 'AI_CANCELLED',
    message: string,
  ) {
    super(message)
    this.name = 'AiRecommendationClientError'
  }
}

export class UnavailableAiRecommendationClient implements AiRecommendationClient {
  async rank(): Promise<AiRankingResponse> {
    return {
      items: [],
      model: 'unconfigured',
      fallback: true,
      fallbackReason: 'not_configured',
      latencyMs: 0,
    }
  }
}

export class HttpAiRecommendationClient implements AiRecommendationClient {
  constructor(
    private readonly options: {
      baseUrl: string
      internalServiceToken: string
      timeoutMs?: number
      fetchImplementation?: typeof fetch
    },
  ) {}

  async rank(input: AiRankingRequest, signal?: AbortSignal) {
    const validatedInput = AiRankingRequestSchema.parse(input)
    const controller = new AbortController()
    const abortFromCaller = () => controller.abort(signal?.reason)
    if (signal?.aborted) {
      controller.abort(signal.reason)
    } else {
      signal?.addEventListener('abort', abortFromCaller, { once: true })
    }
    const timeout = setTimeout(
      () => controller.abort(new Error('AI ranking timed out.')),
      this.options.timeoutMs ?? 8000,
    )

    try {
      const response = await (this.options.fetchImplementation ?? fetch)(
        new URL('/internal/recommendations/rank', this.options.baseUrl),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-service-token': this.options.internalServiceToken,
          },
          body: JSON.stringify(validatedInput),
          signal: controller.signal,
        },
      )

      if (!response.ok) {
        throw new AiRecommendationClientError(
          'AI_UNAVAILABLE',
          'The AI recommendation service is unavailable.',
        )
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new AiRecommendationClientError(
          'AI_INVALID_RESPONSE',
          'The AI recommendation service returned invalid JSON.',
        )
      }

      const parsed = AiRankingResponseSchema.safeParse(payload)
      if (!parsed.success) {
        throw new AiRecommendationClientError(
          'AI_INVALID_RESPONSE',
          'The AI recommendation service returned an invalid response.',
        )
      }

      return parsed.data
    } catch (error) {
      if (error instanceof AiRecommendationClientError) {
        throw error
      }

      if (controller.signal.aborted) {
        if (signal?.aborted) {
          throw new AiRecommendationClientError(
            'AI_CANCELLED',
            'The AI recommendation request was cancelled.',
          )
        }
        throw new AiRecommendationClientError(
          'AI_TIMEOUT',
          'The AI recommendation request timed out.',
        )
      }

      throw new AiRecommendationClientError(
        'AI_UNAVAILABLE',
        'The AI recommendation service is unavailable.',
      )
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortFromCaller)
    }
  }
}
