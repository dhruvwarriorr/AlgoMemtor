import { ExternalProblemSummarySchema } from '@algomemtor/shared-contracts'
import { describe, expect, it } from 'vitest'

import { filterProblems } from './problem-filters.js'

const fetchedAt = '2026-08-09T00:00:00.000Z'

const problems = ExternalProblemSummarySchema.array().parse([
  {
    provider: 'codeforces',
    externalId: '1A',
    title: 'Graph Search',
    canonicalUrl: 'https://codeforces.com/problemset/problem/1/A',
    providerDifficulty: 1200,
    normalizedDifficulty: 'easy',
    providerTags: ['dfs and similar'],
    topics: ['graphs'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '2B',
    title: 'Binary Search',
    canonicalUrl: 'https://codeforces.com/problemset/problem/2/B',
    providerDifficulty: 1600,
    normalizedDifficulty: 'medium',
    providerTags: ['binary search'],
    topics: ['binary-search'],
    learnerStatus: 'attempted',
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '3C',
    title: 'Unrated Strings',
    canonicalUrl: 'https://codeforces.com/problemset/problem/3/C',
    providerTags: ['strings'],
    topics: ['strings'],
    fetchedAt,
  },
])

describe('filterProblems', () => {
  it('combines normalized search, topic, difficulty, and rating filters', () => {
    expect(
      filterProblems(problems, {
        search: 'BINARY',
        topic: 'binary-search',
        difficulty: 'medium',
        minRating: 1300,
        maxRating: 1700,
      }).map((problem) => problem.externalId),
    ).toEqual(['2B'])
  })

  it('excludes unrated problems only while a rating bound is active', () => {
    expect(
      filterProblems(problems, {}).map((problem) => problem.externalId),
    ).toContain('3C')
    expect(
      filterProblems(problems, { minRating: 0 }).map(
        (problem) => problem.externalId,
      ),
    ).not.toContain('3C')
  })

  it('keeps learner status separate from provider metadata', () => {
    expect(
      filterProblems(problems, { status: 'attempted' }).map(
        (problem) => problem.externalId,
      ),
    ).toEqual(['2B'])
  })
})
