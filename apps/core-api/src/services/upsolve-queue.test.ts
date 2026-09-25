import { describe, expect, it } from 'vitest'

import type {
  ActivityParticipation,
  ActivitySubmission,
  CatalogContest,
  LearnerActivity,
  ProblemMeta,
} from '../repositories/mentor-repository.js'
import {
  buildContestMetrics,
  type AnalyzedContest,
} from './contest-analysis.js'
import { buildUpsolve, editorialUrl } from './upsolve-queue.js'

const start = new Date('2026-09-01T14:35:00.000Z')
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000)
const problem = (index: string, rating: number): ProblemMeta => ({
  provider: 'codeforces',
  externalId: `2300${index}`,
  problemKey: `2300${index}`,
  title: `Problem ${index}`,
  canonicalUrl: `https://codeforces.com/problemset/problem/2300/${index}`,
  rating,
  tags: ['greedy'],
  topics: ['greedy'],
})
const submission = (
  index: string,
  minute: number,
  accepted: boolean,
): ActivitySubmission => ({
  provider: 'codeforces',
  problemKey: `2300${index}`,
  externalId: `2300${index}`,
  canonicalUrl: `https://codeforces.com/problemset/problem/2300/${index}`,
  verdict: accepted ? 'OK' : 'WRONG_ANSWER',
  isAccepted: accepted,
  occurredAt: at(minute),
})

const participation: ActivityParticipation = {
  provider: 'codeforces',
  contestId: '2300',
  contestName: 'Round 2300',
  canonicalUrl: 'https://codeforces.com/contest/2300',
  ratingChange: 12,
  attendedAt: at(130),
  completeness: 'complete',
}
const contest: CatalogContest = {
  provider: 'codeforces',
  externalId: '2300',
  name: 'Round 2300',
  canonicalUrl: 'https://codeforces.com/contest/2300',
  startsAt: start,
  durationSeconds: 7_200,
}
const contestProblems = [
  problem('A', 800),
  problem('B', 1200),
  problem('C', 1500),
  problem('D', 1700),
  problem('E', 2600),
]

const analyzed = (submissions: ActivitySubmission[]): AnalyzedContest => {
  const metrics = buildContestMetrics({
    participation,
    contest,
    submissions,
    contestProblems,
    metadata: new Map(),
  })
  return {
    participation,
    contest,
    contestProblems,
    ...(metrics === undefined ? {} : { metrics }),
  }
}

const activity = (
  submissions: ActivitySubmission[],
  extra: Partial<LearnerActivity> = {},
): LearnerActivity => ({
  submissions,
  solved: [],
  participations: [participation],
  ratingChanges: [
    {
      provider: 'codeforces',
      occurredAt: at(200),
      newRating: 1400,
      delta: 12,
    },
  ],
  statuses: new Map(),
  linkedProviders: ['codeforces'],
  ...extra,
})

describe('upsolve queue', () => {
  it('flags attempted and reachable problems and orders them by learning value', () => {
    const submissions = [
      submission('A', 5, true),
      submission('C', 40, false),
      submission('C', 60, false),
    ]
    const result = buildUpsolve({
      contests: [analyzed(submissions)],
      activity: activity(submissions),
      metadata: new Map(),
      skipped: new Map(),
      now: at(3_000),
    })
    const ids = result.queue.map((item) => item.position)
    // E (2600) is far above the learner's level and was not attempted.
    expect(ids).not.toContain('E')
    expect(ids[0]).toBe('C')
    expect(result.queue[0]).toMatchObject({
      contestOutcome: 'attempted',
      contestWrongAttempts: 2,
      editorialUrl: 'https://codeforces.com/contest/2300',
    })
    expect(result.queue[0]?.priorityReason).toContain('2 wrong submissions')
    expect(result.summary).toMatchObject({
      flagged: 3,
      pending: 3,
      upsolved: 0,
    })
  })

  it('counts later accepted submissions and manual solves as upsolved', () => {
    const submissions = [
      submission('A', 5, true),
      submission('B', 30, false),
      // Accepted after the contest ended.
      submission('B', 500, true),
    ]
    const result = buildUpsolve({
      contests: [analyzed(submissions)],
      activity: activity(submissions, {
        statuses: new Map([
          [
            'codeforces:2300C',
            {
              status: 'solved',
              source: 'manual',
              occurredAt: at(900),
            },
          ],
        ]),
      }),
      metadata: new Map(),
      skipped: new Map([['codeforces:2300D', 'skipped']]),
      now: at(3_000),
    })
    const byPosition = new Map(
      result.contests[0]?.items.map((item) => [item.position, item]),
    )
    expect(byPosition.get('B')).toMatchObject({
      status: 'upsolved',
      statusSource: 'provider',
    })
    expect(byPosition.get('C')).toMatchObject({
      status: 'upsolved',
      statusSource: 'manual',
    })
    expect(byPosition.get('D')?.status).toBe('skipped')
    expect(result.summary.completionRate).toBe(1)
    expect(result.upsolved.map((item) => item.externalId).sort()).toEqual([
      '2300B',
      '2300C',
    ])
  })

  it('builds only reviewed editorial hosts', () => {
    expect(editorialUrl('leetcode', 'two-sum', '')).toBe(
      'https://leetcode.com/problems/two-sum/editorial/',
    )
    expect(editorialUrl('codechef', 'FARSWAP', '')).toContain(
      'discuss.codechef.com',
    )
    expect(editorialUrl('cses', '1068', '')).toBeUndefined()
    expect(editorialUrl('leetcode', '../evil', '')).toBeUndefined()
  })
})
