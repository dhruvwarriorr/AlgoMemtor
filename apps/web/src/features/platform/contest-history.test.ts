import { describe, expect, it } from 'vitest'

import { mergeContestHistory } from './contest-history'

function provenance(provider: 'codeforces' | 'codechef' | 'leetcode') {
  return {
    provider,
    providerId: 'dhruvwarrior',
    canonicalUrl: `https://${provider}.com/users/dhruvwarrior`,
    sourceUrl: `https://${provider}.com/users/dhruvwarrior`,
    extractionStrategy: 'official_json' as const,
    schemaVersion: 'test-v1',
    completeness: 'complete' as const,
    fetchedAt: '2026-09-21T09:00:00.000Z',
    stale: false,
  }
}

describe('mergeContestHistory', () => {
  it('attaches the signed rating delta to its matching contest', () => {
    const [entry] = mergeContestHistory(
      [
        {
          provider: 'codeforces',
          contestId: '1900',
          contestName: 'Round 1900',
          rank: 120,
          attendedAt: '2026-09-20T18:00:00.000Z',
          provenance: provenance('codeforces'),
        },
      ],
      [
        {
          provider: 'codeforces',
          eventId: 'rating-1900',
          contestId: '1900',
          contestName: 'Round 1900',
          occurredAt: '2026-09-20T18:00:00.000Z',
          oldRating: 1700,
          newRating: 1746,
          delta: 46,
          provenance: provenance('codeforces'),
        },
      ],
    )

    expect(entry.participation?.rank).toBe(120)
    expect(entry.ratingChange?.delta).toBe(46)
  })

  it('keeps unrated participation without inventing a delta', () => {
    const [entry] = mergeContestHistory(
      [
        {
          provider: 'leetcode',
          contestId: 'weekly-1',
          contestName: 'Weekly Contest 1',
          rank: 500,
          provenance: provenance('leetcode'),
        },
      ],
      [],
    )

    expect(entry.participation?.rank).toBe(500)
    expect(entry.ratingChange).toBeUndefined()
  })

  it('retains rating events when participation is not available', () => {
    const [entry] = mergeContestHistory(
      [],
      [
        {
          provider: 'codechef',
          eventId: 'rating-42',
          contestName: 'Starters 42',
          occurredAt: '2026-09-19T18:00:00.000Z',
          oldRating: 1500,
          newRating: 1482,
          delta: -18,
          provenance: provenance('codechef'),
        },
      ],
    )

    expect(entry.participation).toBeUndefined()
    expect(entry.ratingChange?.delta).toBe(-18)
  })
})
