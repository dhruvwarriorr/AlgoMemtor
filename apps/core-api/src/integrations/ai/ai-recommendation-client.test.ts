import { describe, expect, it, vi } from 'vitest'

import {
  AiRecommendationClientError,
  AiRankingRequestSchema,
  HttpAiRecommendationClient,
} from './ai-recommendation-client.js'

const request = AiRankingRequestSchema.parse({
  requestId: 'request_test',
  learnerId: '00000000-0000-4000-8000-000000000001',
  expectedCount: 1,
  learner: {
    goal: 'improve_problem_solving',
    experience: 'beginner',
    focusTopics: ['graphs'],
    preferredTopics: [],
    preferredDifficulty: { min: 800, max: 1000 },
    learningPreferences: ['solve_problems_directly'],
    recommendationPreference: 'Prefer short revision problems.',
  },
  candidates: [
    {
      provider: 'codeforces',
      externalId: '900A',
      title: 'Candidate',
      rating: 900,
      normalizedDifficulty: 'easy',
      topics: ['graphs'],
      solvedCount: 100,
    },
  ],
})

const successPayload = {
  items: [
    {
      provider: 'codeforces',
      externalId: '900A',
      score: 0.9,
      reason: 'Matches the current graph focus.',
    },
  ],
  model: 'gemini-3.5-flash',
  fallback: false,
  latencyMs: 120,
  inputTokens: 100,
  outputTokens: 20,
  estimatedCostUsd: 0.00033,
  auditId: '00000000-0000-4000-8000-000000000099',
}

describe('HTTP AI recommendation client', () => {
  it('sends the strict internal request and accepts a valid response', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Response.json(successPayload),
    )
    const client = new HttpAiRecommendationClient({
      baseUrl: 'https://ai.example.com/base',
      internalServiceToken: 'shared-secret',
      fetchImplementation,
    })

    await expect(client.rank(request)).resolves.toEqual(successPayload)
    expect(fetchImplementation).toHaveBeenCalledOnce()
    const [url, init] = fetchImplementation.mock.calls[0] ?? []
    expect(String(url)).toBe(
      'https://ai.example.com/internal/recommendations/rank',
    )
    expect(init).toMatchObject({ method: 'POST' })
    expect(new Headers(init?.headers).get('x-internal-service-token')).toBe(
      'shared-secret',
    )
    expect(JSON.parse(String(init?.body))).toEqual(request)
  })

  it.each([
    { ...successPayload, fallback: true },
    {
      ...successPayload,
      fallback: true,
      fallbackReason: 'provider_error',
    },
    { ...successPayload, extra: 'not allowed' },
    { ...successPayload, items: [{ ...successPayload.items[0], score: 2 }] },
  ])('rejects a malformed response as a whole', async (payload) => {
    const client = new HttpAiRecommendationClient({
      baseUrl: 'https://ai.example.com',
      internalServiceToken: 'shared-secret',
      fetchImplementation: vi.fn<typeof fetch>(async () =>
        Response.json(payload),
      ),
    })

    await expect(client.rank(request)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    })
  })

  it('rejects candidates without normalized topics', () => {
    expect(() =>
      AiRankingRequestSchema.parse({
        ...request,
        candidates: [{ ...request.candidates[0], topics: [] }],
      }),
    ).toThrow()
  })

  it('rejects duplicated or invalid topic evidence', () => {
    const valid = {
      topic: 'graphs',
      observedAttemptedProblems: 2,
      observedSolvedProblems: 3,
    }
    expect(() =>
      AiRankingRequestSchema.parse({
        ...request,
        learner: { ...request.learner, topicEvidence: [valid, valid] },
      }),
    ).toThrow()
    expect(() =>
      AiRankingRequestSchema.parse({
        ...request,
        learner: {
          ...request.learner,
          topicEvidence: [{ ...valid, observedSolvedProblems: -1 }],
        },
      }),
    ).toThrow()
  })

  it('does not retry unavailable responses', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Response.json({ error: 'unavailable' }, { status: 503 }),
    )
    const client = new HttpAiRecommendationClient({
      baseUrl: 'https://ai.example.com',
      internalServiceToken: 'shared-secret',
      fetchImplementation,
    })

    await expect(client.rank(request)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    })
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it.each([
    ['timeout', 'AI_TIMEOUT'],
    ['caller cancellation', 'AI_CANCELLED'],
  ] as const)('%s aborts the request', async (kind, expectedCode) => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
          if (init?.signal?.aborted) {
            reject(init.signal.reason)
          }
        }),
    )
    const client = new HttpAiRecommendationClient({
      baseUrl: 'https://ai.example.com',
      internalServiceToken: 'shared-secret',
      timeoutMs: 5,
      fetchImplementation,
    })
    const controller = new AbortController()
    if (kind === 'caller cancellation') {
      controller.abort(new Error('cancelled'))
    }

    await expect(client.rank(request, controller.signal)).rejects.toEqual(
      expect.objectContaining<Partial<AiRecommendationClientError>>({
        code: expectedCode,
      }),
    )
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })
})
