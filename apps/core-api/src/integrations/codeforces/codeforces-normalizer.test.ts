import { describe, expect, it } from 'vitest'

import {
  normalizeCodeforcesDifficulty,
  normalizeCodeforcesProblems,
} from './codeforces-normalizer.js'
import { CodeforcesProblemsetResultSchema } from './codeforces-schemas.js'

describe('normalizeCodeforcesProblems', () => {
  it('normalizes IDs, tags, rating, topics, and matching statistics', () => {
    const result = CodeforcesProblemsetResultSchema.parse({
      problems: [
        {
          contestId: 1000,
          index: ' a ',
          name: '  Codehorses T-shirts  ',
          type: 'PROGRAMMING',
          rating: 1300,
          tags: [' Two Pointers ', 'two pointers', 'Strings'],
        },
      ],
      problemStatistics: [{ contestId: 1000, index: 'A', solvedCount: 42_000 }],
    })

    expect(normalizeCodeforcesProblems(result)).toEqual([
      {
        provider: 'codeforces',
        externalId: '1000A',
        contestId: 1000,
        index: 'A',
        title: 'Codehorses T-shirts',
        providerDifficulty: 1300,
        providerTags: ['two pointers', 'strings'],
        topics: ['two-pointers', 'strings'],
        solvedCount: 42_000,
      },
    ])
  })

  it('keeps optional rating and unmatched statistics absent', () => {
    const result = CodeforcesProblemsetResultSchema.parse({
      problems: [
        {
          contestId: 2000,
          index: 'B',
          name: 'No rating yet',
          type: 'PROGRAMMING',
          tags: ['implementation'],
        },
      ],
      problemStatistics: [],
    })

    expect(normalizeCodeforcesProblems(result)).toEqual([
      {
        provider: 'codeforces',
        externalId: '2000B',
        contestId: 2000,
        index: 'B',
        title: 'No rating yet',
        providerTags: ['implementation'],
        topics: ['implementation'],
      },
    ])
  })

  it('maps Codeforces aliases to the onboarding topic vocabulary', () => {
    const result = CodeforcesProblemsetResultSchema.parse({
      problems: [
        {
          contestId: 3000,
          index: 'C',
          name: 'Alias topics',
          type: 'PROGRAMMING',
          tags: ['dp', 'bitmasks', 'dfs and similar', 'shortest paths'],
        },
      ],
      problemStatistics: [],
    })

    expect(normalizeCodeforcesProblems(result)[0]?.topics).toEqual([
      'dynamic-programming',
      'bit-manipulation',
      'graphs',
      'bfs-and-dfs',
      'shortest-paths',
    ])
  })

  it('normalizes custom problemset IDs and joins index-only statistics', () => {
    const result = CodeforcesProblemsetResultSchema.parse({
      problems: [
        {
          problemsetName: ' ACMSGURU ',
          index: ' 100 ',
          name: 'A+B',
          type: 'PROGRAMMING',
          tags: ['Math'],
        },
      ],
      problemStatistics: [{ index: '100', solvedCount: 12_345 }],
    })

    expect(normalizeCodeforcesProblems(result)).toEqual([
      {
        provider: 'codeforces',
        externalId: 'acmsguru:100',
        problemsetName: 'acmsguru',
        index: '100',
        title: 'A+B',
        providerTags: ['math'],
        topics: ['math'],
        solvedCount: 12_345,
      },
    ])
  })

  it('skips question records and records without a stable ID scope', () => {
    const result = CodeforcesProblemsetResultSchema.parse({
      problems: [
        {
          contestId: 1,
          index: 'A',
          name: 'Question record',
          type: 'QUESTION',
          tags: [],
        },
        {
          index: 'B',
          name: 'Missing contest and problemset',
          type: 'PROGRAMMING',
          tags: ['graphs'],
        },
      ],
      problemStatistics: [],
    })

    expect(normalizeCodeforcesProblems(result)).toEqual([])
  })
})

describe('normalizeCodeforcesDifficulty', () => {
  it.each([
    [undefined, undefined],
    [800, 'easy'],
    [1000, 'easy'],
    [1001, 'medium'],
    [1200, 'medium'],
    [1500, 'medium'],
    [1501, 'hard'],
  ] as const)('maps %s to %s', (rating, expected) => {
    expect(normalizeCodeforcesDifficulty(rating)).toBe(expected)
  })
})
