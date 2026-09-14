import type { AddressInfo } from 'node:net'

import {
  RecommendationDismissalsResponseSchema,
  RecommendationFeedResponseSchema,
  RecommendationFeedbackResponseSchema,
  RecommendationRestorationResponseSchema,
  type ExternalProblemSummary,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import { AiRecommendationClientError } from './integrations/ai/ai-recommendation-client.js'
import type {
  AiRecommendationClient,
  AiRankingRequest,
  AiRankingResponse,
} from './integrations/ai/ai-recommendation-client.js'
import type { ProblemProvider } from './integrations/providers/problem-provider.js'
import { InMemoryProblemActionRepository } from './repositories/problem-action-repository.js'
import { InMemoryProgressRepository } from './repositories/progress-repository.js'
import { InMemoryRecommendationRepository } from './repositories/recommendation-repository.js'
import {
  AI_FALLBACK_RANKING_VERSION,
  AI_RANKING_VERSION,
} from './services/recommendation-service.js'

const userA = '00000000-0000-4000-8000-000000000001'
const userB = '00000000-0000-4000-8000-000000000002'

const problems: ExternalProblemSummary[] = Array.from(
  { length: 50 },
  (_, index) => {
    const externalId = `${800 + index}A`
    const rating = 800 + (index % 5) * 100

    return {
      provider: 'codeforces',
      externalId,
      title: `Starter problem ${externalId}`,
      canonicalUrl: `https://codeforces.com/problemset/problem/${800 + index}/A`,
      providerDifficulty: rating,
      normalizedDifficulty:
        rating <= 1000 ? 'easy' : rating <= 1500 ? 'medium' : 'hard',
      providerTags: index % 2 === 0 ? ['implementation'] : ['math'],
      topics: index % 2 === 0 ? ['implementation'] : ['math'],
      solvedCount: 10_000 - index,
      fetchedAt: '2026-09-10T00:00:00.000Z',
    }
  },
)

const freshness = {
  provider: 'codeforces' as const,
  availability: 'available' as const,
  stale: false,
  fetchedAt: '2026-09-10T00:00:00.000Z',
}

const authorization = (token: string) => ({
  authorization: `Bearer ${token}`,
})

const verifier: SupabaseJwtVerifier = async (token) => {
  if (token === 'user-a') {
    return { subject: userA, claims: { role: 'authenticated' } }
  }

  if (token === 'user-b') {
    return { subject: userB, claims: { role: 'authenticated' } }
  }

  throw new Error('Invalid test token.')
}

const servers: ReturnType<ReturnType<typeof createApp>['listen']>[] = []

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

const learnerProfile = {
  experience: 'beginner' as const,
  difficultyComfort: 'introductory' as const,
  goal: 'improve_problem_solving' as const,
  topicPreference: {
    mode: 'selected' as const,
    topics: ['implementation' as const],
  },
  preferredTopics: ['graphs' as const],
  platformPreferences: {
    platforms: ['codeforces' as const],
    standings: [],
  },
  learningPreferences: ['solve_problems_directly' as const],
  additionalConsiderations: 'General account note that must not reach AI.',
  recommendationPreference: 'Prefer short graph revision problems.',
}

const deferred = () => {
  let resolver: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolver = resolve
  })

  return {
    promise,
    resolve: () => {
      if (resolver === undefined) {
        throw new Error('Deferred resolver was not initialized.')
      }
      resolver()
    },
  }
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) =>
            error === undefined ? resolve() : reject(error),
          )
        }),
    ),
  )
})

const startApp = (
  options: {
    aiRecommendationClient?: AiRecommendationClient
    problemActionRepository?: InMemoryProblemActionRepository
    progressRepository?: InMemoryProgressRepository
    recommendationRepository?: InMemoryRecommendationRepository
  } = {},
) => {
  const provider: ProblemProvider = {
    key: 'codeforces',
    search: vi.fn(async () => ({
      problems,
      freshness,
      warnings: [],
    })),
    getHealth: () => freshness,
  }
  const server = createApp({
    jwtVerifier: verifier,
    ...(options.aiRecommendationClient === undefined
      ? {}
      : { aiRecommendationClient: options.aiRecommendationClient }),
    logger,
    problemActionRepository:
      options.problemActionRepository ?? new InMemoryProblemActionRepository(),
    progressRepository:
      options.progressRepository ?? new InMemoryProgressRepository(),
    problemProvider: provider,
    recommendationRepository:
      options.recommendationRepository ??
      new InMemoryRecommendationRepository(),
  }).listen(0)
  servers.push(server)
  const address = server.address() as AddressInfo

  return `http://127.0.0.1:${address.port}`
}

describe('recommendation API', () => {
  it('generates, reuses, feedback-merges, dismisses, and restores a batch', async () => {
    const progressRepository = new InMemoryProgressRepository()
    const baseUrl = startApp({ progressRepository })
    const headers = authorization('user-a')
    const firstResponse = await fetch(`${baseUrl}/api/recommendations`, {
      headers,
    })
    const first = RecommendationFeedResponseSchema.parse(
      await firstResponse.json(),
    )
    const firstBatchId = first.data?.id
    const firstItem = first.data?.items[0]

    expect(firstResponse.status).toBe(200)
    expect(first.data?.items).toHaveLength(10)
    expect(first.data?.rankingMode).toBe('deterministic')
    expect(first.data?.rankingVersion).toBe(AI_FALLBACK_RANKING_VERSION)
    expect(firstItem).toBeDefined()

    const second = RecommendationFeedResponseSchema.parse(
      await (await fetch(`${baseUrl}/api/recommendations`, { headers })).json(),
    )
    expect(second.data?.id).toBe(firstBatchId)

    const usefulResponse = await fetch(
      `${baseUrl}/api/recommendation-items/${firstItem?.id}/feedback`,
      {
        method: 'PATCH',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ usefulness: 'useful' }),
      },
    )
    const useful = RecommendationFeedbackResponseSchema.parse(
      await usefulResponse.json(),
    )
    expect(useful.data.usefulness).toBe('useful')

    const feedbackJob = await progressRepository.claimNextJob()
    expect(feedbackJob).toMatchObject({
      jobType: 'memory_generation',
      evidenceType: 'recommendation_feedback',
      evidenceId: useful.data.id,
      status: 'processing',
    })

    const difficultyResponse = await fetch(
      `${baseUrl}/api/recommendation-items/${firstItem?.id}/feedback`,
      {
        method: 'PATCH',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ perceivedDifficulty: 'about_right' }),
      },
    )
    const difficulty = RecommendationFeedbackResponseSchema.parse(
      await difficultyResponse.json(),
    )
    expect(difficulty.data).toMatchObject({
      usefulness: 'useful',
      perceivedDifficulty: 'about_right',
    })
    const updatedFeedbackJob = await progressRepository.claimNextJob()
    expect(updatedFeedbackJob).toMatchObject({
      jobType: 'memory_generation',
      evidenceType: 'recommendation_feedback',
      evidenceId: useful.data.id,
      status: 'processing',
    })

    const dismissResponse = await fetch(
      `${baseUrl}/api/recommendation-items/${firstItem?.id}/dismiss`,
      {
        method: 'POST',
        headers,
      },
    )
    expect(dismissResponse.status).toBe(200)

    const dismissals = RecommendationDismissalsResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/recommendation-dismissals`, { headers })
      ).json(),
    )
    expect(dismissals.data.map((item) => item.externalId)).toContain(
      firstItem?.externalId,
    )

    const restoreResponse = await fetch(
      `${baseUrl}/api/recommendation-dismissals/codeforces/${firstItem?.externalId}`,
      { method: 'DELETE', headers },
    )
    const restored = RecommendationRestorationResponseSchema.parse(
      await restoreResponse.json(),
    )
    expect(restored.data).toMatchObject({
      externalId: firstItem?.externalId,
      restored: true,
    })

    const restoredDismissals = RecommendationDismissalsResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/recommendation-dismissals`, { headers })
      ).json(),
    )
    expect(restoredDismissals.data).toHaveLength(0)
  })

  it('rejects a different learner from using another learner’s recommendation item', async () => {
    const baseUrl = startApp()
    const first = RecommendationFeedResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/recommendations`, {
          headers: authorization('user-a'),
        })
      ).json(),
    )
    const itemId = first.data?.items[0]?.id
    const response = await fetch(
      `${baseUrl}/api/recommendation-items/${itemId}/dismiss`,
      {
        method: 'POST',
        headers: authorization('user-b'),
      },
    )

    expect(response.status).toBe(404)

    const feedbackResponse = await fetch(
      `${baseUrl}/api/recommendation-items/${itemId}/feedback`,
      {
        method: 'PATCH',
        headers: {
          ...authorization('user-b'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ usefulness: 'useful' }),
      },
    )

    expect(feedbackResponse.status).toBe(404)
  })

  it('sends forty safe candidates and attaches trusted URLs to AI-ranked IDs', async () => {
    let capturedRequest: AiRankingRequest | undefined
    const rank = vi.fn<AiRecommendationClient['rank']>(async (request) => {
      capturedRequest = request
      return {
        items: request.candidates
          .slice(0, request.expectedCount)
          .reverse()
          .map((candidate, index) => ({
            provider: candidate.provider,
            externalId: candidate.externalId,
            score: 1 - index / 20,
            reason: `AI-ranked candidate ${index + 1}.`,
          })),
        model: 'gemini-3.5-flash',
        fallback: false,
        latencyMs: 150,
        inputTokens: 900,
        outputTokens: 180,
        estimatedCostUsd: 0.00297,
      }
    })
    const baseUrl = startApp({ aiRecommendationClient: { rank } })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }

    const profileResponse = await fetch(`${baseUrl}/api/learner-profile`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(learnerProfile),
    })
    expect(profileResponse.status).toBe(200)

    const response = await fetch(`${baseUrl}/api/recommendations`, { headers })
    const feed = RecommendationFeedResponseSchema.parse(await response.json())

    expect(feed.data?.rankingMode).toBe('ai')
    expect(feed.data?.rankingVersion).toBe(AI_RANKING_VERSION)
    expect(capturedRequest?.candidates).toHaveLength(40)
    expect(capturedRequest?.learner.recommendationPreference).toBe(
      learnerProfile.recommendationPreference,
    )
    expect(JSON.stringify(capturedRequest)).not.toContain(
      learnerProfile.additionalConsiderations,
    )
    expect(JSON.stringify(capturedRequest)).not.toContain('canonicalUrl')
    expect(feed.data?.items.map((item) => item.externalId)).toEqual(
      capturedRequest?.candidates
        .slice(0, 10)
        .reverse()
        .map((candidate) => candidate.externalId),
    )
    feed.data?.items.forEach((item) => {
      expect(item.problem.canonicalUrl).toBe(
        problems.find((problem) => problem.externalId === item.externalId)
          ?.canonicalUrl,
      )
    })
  })

  it.each([
    {
      name: 'unknown ID',
      mutate: (response: AiRankingResponse) => ({
        ...response,
        items: response.items.map((item, index) =>
          index === 0 ? { ...item, externalId: 'unknown' } : item,
        ),
      }),
    },
    {
      name: 'duplicate ID',
      mutate: (response: AiRankingResponse) => ({
        ...response,
        items: response.items.map((item, index) =>
          index === 1
            ? { ...item, externalId: response.items[0]!.externalId }
            : item,
        ),
      }),
    },
    {
      name: 'incorrect count',
      mutate: (response: AiRankingResponse) => ({
        ...response,
        items: response.items.slice(0, -1),
      }),
    },
    {
      name: 'unsafe reason',
      mutate: (response: AiRankingResponse) => ({
        ...response,
        items: response.items.map((item, index) =>
          index === 0
            ? { ...item, reason: 'Read https://attacker.example now.' }
            : item,
        ),
      }),
    },
  ])(
    'falls back for a complete invalid AI result: $name',
    async ({ mutate }) => {
      const rank = vi.fn<AiRecommendationClient['rank']>(async (request) => {
        const valid: AiRankingResponse = {
          items: request.candidates
            .slice(0, request.expectedCount)
            .map((candidate) => ({
              provider: candidate.provider,
              externalId: candidate.externalId,
              score: 0.8,
              reason: 'Matches the deterministic shortlist.',
            })),
          model: 'gemini-3.5-flash',
          fallback: false,
          latencyMs: 100,
        }
        return mutate(valid)
      })
      const baseUrl = startApp({ aiRecommendationClient: { rank } })
      const headers = authorization('user-a')

      const first = RecommendationFeedResponseSchema.parse(
        await (
          await fetch(`${baseUrl}/api/recommendations`, { headers })
        ).json(),
      )
      const reused = RecommendationFeedResponseSchema.parse(
        await (
          await fetch(`${baseUrl}/api/recommendations`, { headers })
        ).json(),
      )
      const refreshed = RecommendationFeedResponseSchema.parse(
        await (
          await fetch(`${baseUrl}/api/recommendations/refresh`, {
            method: 'POST',
            headers,
          })
        ).json(),
      )

      expect(first.data?.rankingMode).toBe('deterministic')
      expect(first.data?.rankingVersion).toBe(AI_FALLBACK_RANKING_VERSION)
      expect(first.data?.items).toHaveLength(10)
      expect(reused.data?.id).toBe(first.data?.id)
      expect(refreshed.data?.id).not.toBe(first.data?.id)
      expect(rank).toHaveBeenCalledTimes(2)
    },
  )

  it('regenerates and retries AI after a profile preference change', async () => {
    const rank = vi.fn<AiRecommendationClient['rank']>(async () => ({
      items: [],
      model: 'gemini-3.5-flash',
      fallback: true,
      fallbackReason: 'provider_error',
      latencyMs: 10,
    }))
    const baseUrl = startApp({ aiRecommendationClient: { rank } })
    const headers = authorization('user-a')
    const first = RecommendationFeedResponseSchema.parse(
      await (await fetch(`${baseUrl}/api/recommendations`, { headers })).json(),
    )

    const saveResponse = await fetch(`${baseUrl}/api/learner-profile`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(learnerProfile),
    })
    expect(saveResponse.status).toBe(200)
    const afterProfileChange = RecommendationFeedResponseSchema.parse(
      await (await fetch(`${baseUrl}/api/recommendations`, { headers })).json(),
    )

    expect(afterProfileChange.data?.id).not.toBe(first.data?.id)
    expect(rank).toHaveBeenCalledTimes(2)
  })

  it('rejects an explanation that repeats the learner recommendation note', async () => {
    const rank = vi.fn<AiRecommendationClient['rank']>(async (request) => ({
      items: request.candidates
        .slice(0, request.expectedCount)
        .map((candidate, index) => ({
          provider: candidate.provider,
          externalId: candidate.externalId,
          score: 0.8,
          reason:
            index === 0
              ? 'Prefer short graph revision problems for this batch.'
              : 'Matches the bounded candidate set.',
        })),
      model: 'gemini-3.5-flash',
      fallback: false,
      latencyMs: 20,
    }))
    const baseUrl = startApp({ aiRecommendationClient: { rank } })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    await fetch(`${baseUrl}/api/learner-profile`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(learnerProfile),
    })

    const feed = RecommendationFeedResponseSchema.parse(
      await (await fetch(`${baseUrl}/api/recommendations`, { headers })).json(),
    )

    expect(feed.data?.rankingMode).toBe('deterministic')
    expect(feed.data?.rankingVersion).toBe(AI_FALLBACK_RANKING_VERSION)
  })

  it.each([
    new AiRecommendationClientError('AI_TIMEOUT', 'Timed out.'),
    new AiRecommendationClientError('AI_UNAVAILABLE', 'Unavailable.'),
    new AiRecommendationClientError('AI_INVALID_RESPONSE', 'Malformed.'),
  ])(
    'falls back and reuses the batch after transport failure: $code',
    async (failure) => {
      const rank = vi.fn<AiRecommendationClient['rank']>(async () => {
        throw failure
      })
      const baseUrl = startApp({ aiRecommendationClient: { rank } })
      const headers = authorization('user-a')

      const first = RecommendationFeedResponseSchema.parse(
        await (
          await fetch(`${baseUrl}/api/recommendations`, { headers })
        ).json(),
      )
      const reused = RecommendationFeedResponseSchema.parse(
        await (
          await fetch(`${baseUrl}/api/recommendations`, { headers })
        ).json(),
      )

      expect(first.data?.rankingMode).toBe('deterministic')
      expect(first.data?.rankingVersion).toBe(AI_FALLBACK_RANKING_VERSION)
      expect(reused.data?.id).toBe(first.data?.id)
      expect(rank).toHaveBeenCalledOnce()
    },
  )

  it('cancels AI work and does not save a batch after client disconnect', async () => {
    const aiStarted = deferred()
    const aiCancelled = deferred()
    const recommendationRepository = new InMemoryRecommendationRepository()
    const rank = vi.fn<AiRecommendationClient['rank']>(
      async (_request, signal) =>
        new Promise<AiRankingResponse>((_resolve, reject) => {
          aiStarted.resolve()
          signal?.addEventListener(
            'abort',
            () => {
              aiCancelled.resolve()
              reject(
                new AiRecommendationClientError(
                  'AI_CANCELLED',
                  'The request was cancelled.',
                ),
              )
            },
            { once: true },
          )
        }),
    )
    const baseUrl = startApp({
      aiRecommendationClient: { rank },
      recommendationRepository,
    })
    const controller = new AbortController()
    const request = fetch(`${baseUrl}/api/recommendations`, {
      headers: authorization('user-a'),
      signal: controller.signal,
    })

    await aiStarted.promise
    controller.abort()
    await expect(request).rejects.toThrow()
    await aiCancelled.promise

    await expect(
      recommendationRepository.listBatchesByAuthUserId(userA),
    ).resolves.toEqual([])
  })
})
