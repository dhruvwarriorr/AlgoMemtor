import { describe, expect, it } from 'vitest'

import type {
  ActivityParticipation,
  ActivitySubmission,
  CatalogContest,
  ProblemMeta,
} from '../repositories/mentor-repository.js'
import {
  buildContestMetrics,
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
