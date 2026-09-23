import { describe, expect, it } from 'vitest'

import type {
  ExternalProblemSummary,
  ProviderSubmission,
} from '@algomemtor/shared-contracts'

import { buildAnalyticsInsights } from './analytics-insights.js'

const problem = (
  externalId: string,
  rating: number,
  topics: string[],
): ExternalProblemSummary => ({
  provider: 'codeforces',
  externalId,
  title: `Problem ${externalId}`,
  canonicalUrl: 'https://codeforces.com/',
  providerDifficulty: rating,
  providerTags: topics,
  topics,
  fetchedAt: '2026-09-01T00:00:00.000Z',
})

const submission = (
  externalId: string,
  occurredAt: string,
  isAccepted: boolean,
  verdict = isAccepted ? 'OK' : 'WRONG_ANSWER',
) =>
  ({
    provider: 'codeforces',
    externalId,
    eventId: `${externalId}-${occurredAt}`,
    canonicalUrl: 'https://codeforces.com/',
    verdict,
    occurredAt,
    isAccepted,
    completeness: 'complete',
    provenance: {} as never,
  }) satisfies ProviderSubmission

describe('buildAnalyticsInsights', () => {
  it('builds all-time bands, punch card, months, topic strength and hardest solves', () => {
    const insights = buildAnalyticsInsights({
      timezone: 'UTC',
      now: new Date('2026-09-23T12:00:00.000Z'),
      profiles: [],
      submissions: [
        // Monday 2026-09-21 at 09:00 and 21:00 UTC.
        submission('1A', '2026-09-21T09:10:00.000Z', false),
        submission('1A', '2026-09-21T21:30:00.000Z', true),
        submission(
          '2B',
          '2025-12-01T10:00:00.000Z',
          false,
          'TIME_LIMIT_EXCEEDED',
        ),
      ],
      solved: [
        {
          provider: 'codeforces',
          externalId: '1A',
          solvedAt: '2026-09-21T21:30:00.000Z',
        },
        {
          provider: 'codeforces',
          externalId: '3C',
          solvedAt: '2026-08-02T10:00:00.000Z',
        },
      ],
      ratingChanges: [],
      participations: [],
      metadata: new Map([
        ['codeforces:1A', problem('1A', 1450, ['dp'])],
        ['codeforces:2B', problem('2B', 1900, ['graphs'])],
        ['codeforces:3C', problem('3C', 1720, ['dp', 'greedy'])],
      ]),
      normalizeTopic: (topic) => topic,
    })

    expect(insights.verdicts).toMatchObject({
      accepted: 1,
      wrongAnswer: 1,
      timeLimit: 1,
    })
    expect(insights.punchCard[0]?.[9]).toBe(1)
    expect(insights.punchCard[0]?.[21]).toBe(1)
    expect(insights.ratingBands).toEqual([
      {
        min: 1400,
        max: 1599,
        codeforces: 1,
        codechef: 0,
        leetcode: 0,
        cses: 0,
      },
      {
        min: 1600,
        max: 1799,
        codeforces: 1,
        codechef: 0,
        leetcode: 0,
        cses: 0,
      },
    ])
    expect(insights.monthly).toHaveLength(24)
    expect(insights.monthly.at(-1)).toEqual({
      month: '2026-09',
      solved: 1,
      submissions: 2,
      accepted: 1,
    })
    expect(insights.topicStrength.find((item) => item.topic === 'dp')).toEqual({
      topic: 'dp',
      solved: 2,
      failedSubmissions: 1,
      averageRating: 1585,
    })
    expect(
      insights.topicStrength.find((item) => item.topic === 'graphs'),
    ).toMatchObject({
      solved: 0,
      failedSubmissions: 1,
    })
    expect(insights.hardestSolved.map((item) => item.externalId)).toEqual([
      '3C',
      '1A',
    ])
    expect(insights.firstActivityAt).toBe('2025-12-01T10:00:00.000Z')
  })
  it('lists linked accounts without a profile, such as CSES', () => {
    const insights = buildAnalyticsInsights({
      timezone: 'UTC',
      now: new Date('2026-09-23T12:00:00.000Z'),
      profiles: [],
      otherAccounts: [{ provider: 'cses', handle: '356257', solvedCount: 83 }],
      submissions: [],
      solved: [],
      ratingChanges: [],
      participations: [],
      metadata: new Map(),
      normalizeTopic: (topic) => topic,
    })
    expect(insights.accounts).toEqual([
      { provider: 'cses', handle: '356257', solvedCount: 83, contests: 0 },
    ])
  })
})
