import { describe, expect, it } from 'vitest'

import {
  RecommendationFeedbackInputSchema,
  RecommendationFeedResponseSchema,
} from '../src/index.js'

const item = {
  id: '00000000-0000-4000-8000-000000000001',
  provider: 'codeforces',
  externalId: '100A',
  position: 1,
  score: 0.85,
  reason: 'Practises your focus topic: graphs.',
  problem: {
    provider: 'codeforces',
    externalId: '100A',
    title: 'Graph practice',
    canonicalUrl: 'https://codeforces.com/problemset/problem/100/A',
    providerDifficulty: 1200,
    normalizedDifficulty: 'medium',
    providerTags: ['graphs'],
    topics: ['graphs'],
    fetchedAt: '2026-09-10T00:00:00.000Z',
  },
}

describe('recommendation contracts', () => {
  it('accepts a nullable feed and validates provider metadata', () => {
    const result = RecommendationFeedResponseSchema.parse({
      data: {
        id: '00000000-0000-4000-8000-000000000002',
        generatedAt: '2026-09-10T00:00:00.000Z',
        rankingMode: 'deterministic',
        rankingVersion: 'deterministic-v1',
        items: [item],
      },
      meta: {
        partial: false,
        stale: false,
        warnings: [],
        providers: [],
      },
    })

    expect(result.data?.items[0]?.problem.canonicalUrl).toContain(
      'codeforces.com',
    )
    expect(
      RecommendationFeedResponseSchema.parse({
        data: null,
        meta: { partial: false, stale: false, warnings: [], providers: [] },
      }).data,
    ).toBeNull()
  })

  it('requires at least one feedback dimension', () => {
    expect(RecommendationFeedbackInputSchema.safeParse({}).success).toBe(false)
    expect(
      RecommendationFeedbackInputSchema.parse({
        usefulness: 'useful',
      }),
    ).toEqual({ usefulness: 'useful' })
  })
})
