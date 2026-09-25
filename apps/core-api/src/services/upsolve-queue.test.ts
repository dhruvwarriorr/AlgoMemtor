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
import {
  buildUpsolve,
  editorialUrl,
  fillQueue,
  initialQueue,
  keptQueue,
  replacementPool,
  type UpsolveCandidate,
} from './upsolve-queue.js'

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
  it('lists the whole contest and offers its first unsolved problems as candidates', () => {
    const submissions = [
      submission('A', 5, true),
      submission('C', 40, false),
      submission('C', 60, false),
    ]
    const result = buildUpsolve({
      contests: [analyzed(submissions)],
      activity: activity(submissions),
      metadata: new Map(),
      states: new Map(),
      now: at(3_000),
    })
    expect(result.contests[0]?.items.map((item) => item.status)).toEqual([
      'solved_in_contest',
      'pending',
      'pending',
      'pending',
      'pending',
    ])
    // B and C are the first two unsolved; D and E are next in line.
    expect(
      result.candidates.map((item) => [item.position, item.frontierRank]),
    ).toEqual(
      expect.arrayContaining([
        ['B', 0],
        ['C', 1],
        ['D', 2],
        ['E', 3],
      ]),
    )
    const byPosition = new Map(
      result.candidates.map((item) => [item.position, item]),
    )
    // C was fought over in the contest and sits near the learner's level.
    expect(byPosition.get('C')?.score).toBeGreaterThan(
      byPosition.get('E')?.score ?? 100,
    )
    expect(byPosition.get('C')).toMatchObject({
      contestOutcome: 'attempted',
      contestWrongAttempts: 2,
      editorialUrl: 'https://codeforces.com/contest/2300',
    })
    expect(byPosition.get('C')?.priorityReason).toContain('2 wrong submissions')
    expect(result.history[0]).toMatchObject({
      total: 5,
      solvedInContest: 1,
      upsolved: 0,
    })
  })

  it('treats a learner-marked solve as upsolved on any platform', () => {
    const result = buildUpsolve({
      contests: [analyzed([submission('A', 5, true)])],
      activity: activity([submission('A', 5, true)]),
      metadata: new Map(),
      states: new Map([['codeforces:2300B', 'solved']]),
      now: at(3_000),
    })
    const b = result.contests[0]?.items.find((item) => item.position === 'B')
    expect(b).toMatchObject({ status: 'upsolved', statusSource: 'manual' })
    expect(result.candidates.map((item) => item.position)).not.toContain('B')
    expect(result.candidates[0]?.frontierRank).toBe(0)
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
      states: new Map([['codeforces:2300D', 'skipped']]),
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
    // E is still pending: two of the three unskipped problems are upsolved.
    expect(result.summary.completionRate).toBe(0.667)
    expect(result.upsolved.map((item) => item.externalId).sort()).toEqual([
      '2300B',
      '2300C',
    ])
  })

  it('keeps queued problems in place and fills freed slots at the bottom', () => {
    const open = ['a', 'b', 'd', 'e', 'f', 'g'].map((id) => ({ id }))
    // "c" was solved: it leaves, the rest keep their order.
    const kept = keptQueue(['a', 'b', 'c', 'd', 'e'], open, 5)
    expect(kept).toEqual(['a', 'b', 'd', 'e'])
    const pool = open.filter((item) => !kept.includes(item.id))
    // The AI picked "g"; an unknown pick is ignored.
    expect(fillQueue(kept, pool, ['x', 'g'], 5)).toEqual([
      'a',
      'b',
      'd',
      'e',
      'g',
    ])
    // Without AI picks the best-scored candidate fills the slot.
    expect(fillQueue(kept, pool, [], 5)).toEqual(['a', 'b', 'd', 'e', 'f'])
  })

  it('starts from the first two unsolved of the newest contests and replaces from the allowed pool', () => {
    const candidate = (
      id: string,
      contestIndex: number,
      frontierRank: number,
    ): UpsolveCandidate =>
      ({ id, contestIndex, frontierRank }) as UpsolveCandidate
    const candidates = [
      candidate('old-0', 2, 0),
      candidate('new-2', 0, 2),
      candidate('mid-1', 1, 1),
      candidate('new-0', 0, 0),
      candidate('new-1', 0, 1),
      candidate('mid-0', 1, 0),
      candidate('new-3', 0, 3),
      candidate('old-2', 2, 2),
    ]
    expect(initialQueue(candidates, 5)).toEqual([
      'new-0',
      'new-1',
      'mid-0',
      'mid-1',
      'old-0',
    ])
    // After a solve: the latest contest's next two, or other contests' top
    // two. An older contest's third problem is not eligible.
    const pool = replacementPool(candidates, [
      'new-1',
      'mid-0',
      'mid-1',
      'old-0',
    ]).map((item) => item.id)
    expect(pool).toEqual(['new-0', 'new-2', 'new-3'])
    expect(pool).not.toContain('old-2')
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
