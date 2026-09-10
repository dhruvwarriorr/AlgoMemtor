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
import type { ProblemProvider } from './integrations/providers/problem-provider.js'
import { InMemoryProblemActionRepository } from './repositories/problem-action-repository.js'
import { InMemoryRecommendationRepository } from './repositories/recommendation-repository.js'

const userA = '00000000-0000-4000-8000-000000000001'
const userB = '00000000-0000-4000-8000-000000000002'

const problems: ExternalProblemSummary[] = Array.from(
  { length: 14 },
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

const startApp = () => {
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
    problemActionRepository: new InMemoryProblemActionRepository(),
    problemProvider: provider,
    recommendationRepository: new InMemoryRecommendationRepository(),
  }).listen(0)
  servers.push(server)
  const address = server.address() as AddressInfo

  return `http://127.0.0.1:${address.port}`
}

describe('recommendation API', () => {
  it('generates, reuses, feedback-merges, dismisses, and restores a batch', async () => {
    const baseUrl = startApp()
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
})
