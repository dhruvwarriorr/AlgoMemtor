import { describe, expect, it } from 'vitest'

import type {
  ActivityParticipation,
  ActivitySubmission,
  CatalogContest,
  ProblemMeta,
} from '../repositories/mentor-repository.js'
import {
  buildContestMetrics,
  codeforcesContestsFromSubmissions,
  practiceSession,
  contestPatterns,
  matchContest,
} from './contest-analysis.js'

const start = new Date('2026-06-18T14:35:00.000Z')
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000)

const participation: ActivityParticipation = {
  provider: 'codeforces',
  contestId: '2237',
  contestName: 'Codeforces Round 1104',
  canonicalUrl: 'https://codeforces.com/contest/2237',
  rank: 3120,
  ratingChange: -24,
  attendedAt: at(180),
  completeness: 'complete',
}

const contest: CatalogContest = {
  provider: 'codeforces',
  externalId: '2237',
  name: 'Codeforces Round 1104',
  canonicalUrl: 'https://codeforces.com/contest/2237',
  startsAt: start,
  durationSeconds: 7_200,
}

const problem = (
  index: string,
  rating: number,
  topics: string[],
): ProblemMeta => ({
  provider: 'codeforces',
  externalId: `2237${index}`,
  problemKey: `2237${index}`,
  title: `Problem ${index}`,
  canonicalUrl: `https://codeforces.com/problemset/problem/2237/${index}`,
  rating,
  tags: topics,
  topics,
})

const submission = (
  externalId: string,
  minute: number,
  accepted: boolean,
): ActivitySubmission => ({
  provider: 'codeforces',
  problemKey: externalId,
  externalId,
  canonicalUrl: `https://codeforces.com/problemset/problem/2237/${externalId.slice(4)}`,
  verdict: accepted ? 'OK' : 'WRONG_ANSWER',
  isAccepted: accepted,
  occurredAt: at(minute),
})

const contestProblems = [
  problem('A', 800, ['greedy']),
  problem('B', 1000, ['math']),
  problem('C', 1400, ['binary-search']),
  problem('D', 1900, ['dp']),
]

describe('contest analysis', () => {
  it('matches catalog contests by id, slug, name token and time', () => {
    expect(matchContest(participation, [contest])).toBe(contest)
    const leetcode: CatalogContest = {
      provider: 'leetcode',
      externalId: 'weekly-contest-518',
      name: 'Weekly Contest 518',
      canonicalUrl: 'https://leetcode.com/contest/weekly-contest-518/',
      startsAt: start,
    }
    expect(
      matchContest(
        {
          ...participation,
          provider: 'leetcode',
          contestId: 'contest:Weekly Contest 518:x',
          contestName: 'Weekly Contest 518',
        },
        [leetcode],
      ),
    ).toBe(leetcode)
    const starters: CatalogContest = {
      provider: 'codechef',
      externalId: '70591',
      name: 'Starters 257 (Rated till 6 Star)',
      canonicalUrl: 'https://www.codechef.com/START257',
      startsAt: start,
    }
    expect(
      matchContest(
        {
          ...participation,
          provider: 'codechef',
          contestId: 'rating-18',
          contestName: 'Starters 257 (Rated)',
        },
        [starters],
      ),
    ).toBe(starters)
  })

  it('derives time use, switches and rapid resubmits from the timeline', () => {
    const metrics = buildContestMetrics({
      participation,
      contest,
      contestProblems,
      metadata: new Map(),
      submissions: [
        submission('2237A', 6, true),
        submission('2237B', 20, false),
        submission('2237B', 22, false),
        submission('2237C', 30, false),
        submission('2237B', 41, true),
        submission('2237C', 70, false),
        // Outside the contest window: ignored.
        submission('2237C', 400, true),
        // Another contest's problem inside the window: ignored.
        submission('1900A', 50, true),
      ],
    })
    expect(metrics).toBeDefined()
    expect(metrics?.solvedCount).toBe(2)
    expect(metrics?.submissionCount).toBe(6)
    expect(metrics?.firstAcceptedMinute).toBe(6)
    expect(metrics?.rapidWrongResubmits).toBe(1)
    // B -> C while B unsolved, C -> B while C unsolved.
    expect(metrics?.problemSwitches).toBe(2)
    expect(metrics?.idleTailMinutes).toBe(50)
    expect(metrics?.longestGapMinutes).toBe(29)
    const byLabel = new Map(metrics?.problems.map((item) => [item.label, item]))
    expect(byLabel.get('B')).toMatchObject({
      solved: true,
      wrongAttempts: 2,
      minutesSpent: 35,
    })
    expect(byLabel.get('D')).toMatchObject({ attempts: 0, solved: false })
    expect(metrics?.coverage).toBe('complete')
  })

  it('aggregates recurring behavior across contests', () => {
    const metrics = buildContestMetrics({
      participation,
      contest,
      contestProblems,
      metadata: new Map(),
      submissions: [
        submission('2237A', 40, true),
        submission('2237C', 45, false),
        submission('2237C', 46, false),
        submission('2237C', 47, false),
      ],
    })
    const patterns = contestPatterns([
      {
        participation,
        contest,
        contestProblems,
        ...(metrics ? { metrics } : {}),
      },
    ])
    expect(patterns.contestsAnalyzed).toBe(1)
    expect(patterns.slowStarts).toBe(1)
    expect(patterns.earlyStops).toBe(1)
    expect(patterns.rapidResubmitContests).toBe(1)
    expect(patterns.ratingDrops).toBe(1)
    // B (reachable at 1000) and C (attempted) were left unsolved.
    expect(
      patterns.recurringUnsolvedTopics.map((item) => item.topic).sort(),
    ).toEqual(['binary-search', 'math'])
    expect(patterns.stuckPositions).toEqual([{ label: 'C', count: 1 }])
  })
})

describe('Codeforces contests from submissions', () => {
  const round = (id: string, start: string): CatalogContest => ({
    provider: 'codeforces',
    externalId: id,
    name: `Round ${id}`,
    canonicalUrl: `https://codeforces.com/contest/${id}`,
    startsAt: new Date(start),
    durationSeconds: 9_000,
  })
  const sub = (externalId: string, at: string): ActivitySubmission => ({
    provider: 'codeforces',
    problemKey: externalId,
    externalId,
    canonicalUrl: 'https://codeforces.com/problemset/problem/1/A',
    verdict: 'OK',
    isAccepted: true,
    occurredAt: new Date(at),
  })

  it('finds live unrated rounds and contests practised right after', () => {
    const found = codeforcesContestsFromSubmissions({
      submissions: [
        // Live during the contest, no rating change.
        sub('2259A', '2026-09-05T15:00:00Z'),
        // Solved the morning after the contest ended.
        sub('2266A', '2026-09-22T01:41:00Z'),
        // An old problemset problem is not a contest you took part in.
        sub('734E', '2026-09-17T05:19:00Z'),
        // Already on the rating history.
        sub('2237A', '2026-09-10T10:00:00Z'),
      ],
      known: new Set(['2237']),
      catalog: [
        round('2259', '2026-09-05T14:45:00Z'),
        round('2266', '2026-09-21T14:35:00Z'),
        round('734', '2016-10-01T14:35:00Z'),
        round('2237', '2026-06-18T17:35:00Z'),
      ],
      now: new Date('2026-09-25T12:00:00Z'),
    })
    expect(found.map((item) => [item.contestId, item.mode]).sort()).toEqual([
      ['2259', 'unrated'],
      ['2266', 'practice'],
    ])
    expect(found.find((item) => item.contestId === '2266')?.attendedAt).toEqual(
      new Date('2026-09-21T14:35:00Z'),
    )
  })
})

describe('practice sessions', () => {
  it('spans the contest length from the first sitting and follows close submissions', () => {
    const end = Date.parse('2026-09-21T17:05:00Z')
    const at = (iso: string) => Date.parse(iso)
    const session = practiceSession(
      [
        at('2026-09-22T01:41:00Z'),
        at('2026-09-22T03:30:00Z'),
        // 40 minutes after the previous one: still the same sitting.
        at('2026-09-22T04:10:00Z'),
        // Hours later: a separate upsolve.
        at('2026-09-22T11:59:00Z'),
      ],
      end,
      150 * 60_000,
    )
    expect(session.start.toISOString()).toBe('2026-09-22T01:41:00.000Z')
    expect(session.end.toISOString()).toBe('2026-09-22T04:11:00.000Z')
  })
})
