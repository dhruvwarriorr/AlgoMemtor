import { describe, expect, it } from 'vitest'

import type {
  ExternalProblemSummary,
  ProviderSolvedProblem,
} from '@algomemtor/shared-contracts'

import { withObservedDifficulty } from './observed-difficulty.js'

const fetchedAt = '2026-09-27T00:00:00.000Z'

const catalog = (
  externalId: string,
  rating: number,
): ExternalProblemSummary => ({
  provider: 'codechef',
  externalId,
  title: `Problem ${externalId}`,
  canonicalUrl: `https://www.codechef.com/problems/${externalId}`,
  providerDifficulty: rating,
  normalizedDifficulty: 'medium',
  providerTags: [],
  topics: ['codechef'],
  fetchedAt,
})

const solve = (
  externalId: string,
  extra: Partial<ProviderSolvedProblem> = {},
): ProviderSolvedProblem => ({
  provider: 'codechef',
  externalId,
  canonicalUrl: `https://www.codechef.com/problems/${externalId}`,
  occurredAt: null,
  firstObservedAt: fetchedAt,
  lastObservedAt: fetchedAt,
  completeness: 'complete',
  provenance: {} as never,
  ...extra,
})

describe('withObservedDifficulty', () => {
  it('rates contest solves by their CodeChef rating', () => {
    const result = withObservedDifficulty(
      new Map(),
      [solve('START1', { solveContext: 'contest', difficultyRating: 1712 })],
      fetchedAt,
    )
    expect(result.get('codechef:START1')).toMatchObject({
      providerDifficulty: 1712,
      normalizedDifficulty: 'hard',
      title: 'START1',
    })
  })

  it('keeps practice solves unrated even when the catalog rates them', () => {
    const result = withObservedDifficulty(
      new Map([['codechef:FLOW001', catalog('FLOW001', 900)]]),
      [solve('FLOW001', { solveContext: 'practice' })],
      fetchedAt,
    )
    const problem = result.get('codechef:FLOW001')
    expect(problem?.title).toBe('Problem FLOW001')
    expect(problem?.providerDifficulty).toBeUndefined()
    expect(problem?.normalizedDifficulty).toBeUndefined()
  })

  it('leaves solves without a context to the catalog', () => {
    const known = catalog('ABC', 1300)
    const result = withObservedDifficulty(
      new Map([['codechef:ABC', known]]),
      [solve('ABC')],
      fetchedAt,
    )
    expect(result.get('codechef:ABC')).toBe(known)
  })
})
