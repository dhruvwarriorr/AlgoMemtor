import type {
  ProviderSolvedProblem,
  ProviderSubmission,
} from '@algomemtor/shared-contracts'
import { describe, expect, it } from 'vitest'

import {
  computeLearnerActivityDigest,
  describeActivityChange,
  digestSourceHash,
  type DigestInput,
} from './learner-activity-digest.js'

const now = new Date('2026-09-23T12:00:00.000Z')
const provenance = {
  provider: 'codeforces' as const,
  providerId: 'x',
  canonicalUrl: 'https://codeforces.com/problemset/problem/1/A',
  sourceUrl: 'https://codeforces.com/api/user.status',
  extractionStrategy: 'official_json' as const,
  schemaVersion: 'test',
  completeness: 'complete' as const,
  fetchedAt: '2026-09-23T00:00:00.000Z',
  stale: false,
}

let nextId = 1
const submission = (
  externalId: string,
  verdict: string,
  daysAgo: number,
): ProviderSubmission => ({
  provider: 'codeforces',
  externalId,
  eventId: String(nextId++),
  canonicalUrl: provenance.canonicalUrl,
  verdict,
  language: 'C++17',
  occurredAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
  isAccepted: verdict === 'OK',
  completeness: 'complete',
  provenance,
})

const solved = (
  externalId: string,
  topics: string[],
): ProviderSolvedProblem => ({
  provider: 'codeforces',
  externalId,
  canonicalUrl: provenance.canonicalUrl,
  occurredAt: null,
  firstObservedAt: provenance.fetchedAt,
  lastObservedAt: provenance.fetchedAt,
  topics,
  completeness: 'complete',
  provenance,
})

const input = (overrides: Partial<DigestInput> = {}): DigestInput => ({
  now,
  accounts: [
    {
      provider: 'codeforces',
      handle: 'learner',
      verified: true,
      historyComplete: true,
      rating: 1500,
      maxRating: 1600,
    },
  ],
  // Four DP problems with repeated wrong answers, three greedy first tries,
  // and one open DP attempt that timed out.
  submissions: [
    submission('1A', 'OK', 1),
    submission('2A', 'OK', 2),
    submission('3A', 'OK', 3),
    submission('4A', 'WRONG_ANSWER', 10),
    submission('4A', 'WRONG_ANSWER', 10),
    submission('4A', 'OK', 9),
    submission('5A', 'WRONG_ANSWER', 20),
    submission('5A', 'OK', 20),
    submission('6A', 'TIME_LIMIT_EXCEEDED', 5),
    submission('6A', 'TIME_LIMIT_EXCEEDED', 4),
  ],
  solved: [
    solved('1A', ['greedy']),
    solved('2A', ['greedy']),
    solved('3A', ['greedy']),
    solved('4A', ['dp']),
    solved('5A', ['dp']),
    solved('7A', ['dp']),
  ],
  contests: [],
  catalog: new Map([
    [
      'codeforces:1A',
      { title: 'Theatre Square', rating: 1000, topics: ['math'] },
    ],
    ['codeforces:6A', { title: 'Hard DP', rating: 2000, topics: ['dp'] }],
  ]),
  ...overrides,
})

describe('learner activity digest', () => {
  it('summarizes solves, attempts, verdicts, and topics', () => {
    const digest = computeLearnerActivityDigest(input())

    expect(digest.totals).toEqual({
      solved: 6,
      attemptedUnsolved: 1,
      submissions: 10,
      acceptedSubmissions: 5,
      acceptanceRate: 50,
      firstTryRate: 60,
      submissionsPerSolve: 1.6,
    })
    expect(digest.verdicts).toEqual({
      accepted: 5,
      wrong_answer: 3,
      time_limit: 2,
    })
    expect(digest.failurePatterns[0]).toMatchObject({
      verdict: 'wrong_answer',
      count: 3,
      shareOfFailures: 60,
      topics: ['dp'],
    })
    expect(digest.topics.strengths.map((item) => item.topic)).toEqual([
      'greedy',
      'dp',
    ])
    expect(digest.topics.weaknesses[0]).toMatchObject({
      topic: 'dp',
      attemptedUnsolved: 1,
      failedSubmissions: 5,
    })
    expect(digest.openAttempts).toEqual([
      expect.objectContaining({
        externalId: '6A',
        title: 'Hard DP',
        failedSubmissions: 2,
        lastVerdict: 'time_limit',
      }),
    ])
    expect(digest.activity).toMatchObject({
      solvedLast7Days: 3,
      solvedLast30Days: 5,
      currentStreakDays: 5,
    })
    expect(digest.providers[0]).toMatchObject({
      provider: 'codeforces',
      solved: 6,
      attemptedUnsolved: 1,
      viaConnector: false,
      rating: 1500,
    })
  })

  it('writes a baseline note, then only notes real changes', () => {
    const first = computeLearnerActivityDigest(input())
    const baseline = describeActivityChange(null, first)
    expect(baseline).toContain('6 problems solved, 1 attempted but unsolved')
    expect(baseline).toContain('Most common failure: wrong answer')
    expect(baseline).not.toMatch(/learner|https?:/)

    // Same data a day later: time windows move, content does not.
    const later = computeLearnerActivityDigest(
      input({ now: new Date(now.getTime() + 86_400_000) }),
    )
    expect(digestSourceHash(later)).toBe(digestSourceHash(first))
    expect(describeActivityChange(first, later)).toBeNull()

    const more = computeLearnerActivityDigest(
      input({
        submissions: [
          ...input().submissions,
          submission('6A', 'OK', 0),
          submission('8A', 'WRONG_ANSWER', 0),
          submission('8A', 'WRONG_ANSWER', 0),
          submission('8A', 'RUNTIME_ERROR', 0),
        ],
      }),
    )
    const note = describeActivityChange(first, more)
    expect(note).toContain('Solved 1 new problem: Hard DP (rated 2000) [dp]')
    expect(note).toContain('Made 3 unsuccessful submissions')
  })
})
