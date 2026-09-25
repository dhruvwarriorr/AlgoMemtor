import { describe, expect, it } from 'vitest'

import type {
  ActivitySubmission,
  LearnerActivity,
} from '../repositories/mentor-repository.js'
import { buildProgressReport, slope, weekStart } from './progress-report.js'

const now = new Date('2026-09-24T12:00:00.000Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000)
const submission = (
  key: string,
  days: number,
  accepted: boolean,
): ActivitySubmission => ({
  provider: 'codeforces',
  problemKey: key,
  externalId: key,
  canonicalUrl: 'https://codeforces.com/problemset/problem/1/A',
  verdict: accepted ? 'OK' : 'WRONG_ANSWER',
  isAccepted: accepted,
  occurredAt: daysAgo(days),
})

const baseActivity = (submissions: ActivitySubmission[]): LearnerActivity => ({
  submissions,
  solved: [],
  participations: [],
  ratingChanges: [1500, 1510, 1530, 1545, 1560].map((rating, index) => ({
    provider: 'codeforces' as const,
    occurredAt: daysAgo(50 - index * 10),
    newRating: rating,
    delta: 10,
  })),
  statuses: new Map(),
  linkedProviders: ['codeforces'],
})

describe('progress report', () => {
  it('computes week starts, slopes and streaks', () => {
    expect(weekStart('2026-09-24')).toBe('2026-09-21')
    expect(slope([1, 2, 3, 4])).toBeCloseTo(1)
    expect(slope([1, 2])).toBeNull()
    const report = buildProgressReport({
      activity: baseActivity([
        submission('1A', 0, true),
        submission('2A', 1, false),
        submission('2A', 1, true),
        submission('3A', 2, true),
      ]),
      roadmapTopics: [],
      contests: [],
      helpSessions: [],
      metadata: new Map(),
      upsolvePending: 2,
      timeZone: 'UTC',
      now,
    })
    expect(report.consistency.currentStreak).toBe(3)
    expect(report.consistency.activeDaysLast30).toBe(3)
    expect(report.accuracy.at(-1)).toMatchObject({
      attempted: 3,
      firstTryAccepted: 2,
    })
    const trend = report.ratingTrend[0]
    expect(trend?.current).toBe(1560)
    expect(trend?.changePerContest).toBeGreaterThan(10)
    expect(trend?.projection90d).toBeGreaterThan(1560)
    const ids = report.insights.map((insight) => insight.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'rating-projection',
        'upsolve-pending',
        'streak',
      ]),
    )
    expect(report.hintDependency.trend).toBe('insufficient_data')
  })

  it('counts streaks on solve days, like the Progress page', () => {
    const report = buildProgressReport({
      activity: baseActivity([
        // Only failed submissions today: active, but no solve.
        submission('4A', 0, false),
        submission('5A', 2, true),
      ]),
      roadmapTopics: [],
      contests: [],
      helpSessions: [],
      metadata: new Map(),
      upsolvePending: 0,
      timeZone: 'UTC',
      now,
    })
    expect(report.consistency.currentStreak).toBe(0)
    expect(report.consistency.activeDaysLast30).toBe(2)
  })

  it('reports weak topic accuracy and stale focus topics with evidence', () => {
    const submissions = Array.from({ length: 6 }, (_, index) =>
      submission(`${index + 10}B`, 5 + index, index === 0),
    )
    const metadata = new Map(
      submissions.map((item) => [
        `codeforces:${item.problemKey}`,
        {
          provider: 'codeforces' as const,
          externalId: item.externalId,
          problemKey: item.problemKey,
          title: 'x',
          canonicalUrl: item.canonicalUrl,
          tags: ['binary search'],
          topics: ['binary-search'],
        },
      ]),
    )
    const report = buildProgressReport({
      activity: baseActivity(submissions),
      roadmapTopics: [
        {
          topic: 'dynamic-programming',
          name: 'Dynamic Programming',
          lane: 'current_focus',
          assessment: 'needs_practice',
          score: 0.3,
          confidence: 0.6,
          reason: 'Few solves.',
          evidence: {
            uniqueProblems: 4,
            solvedProblems: 3,
            attemptedProblems: 1,
            acceptedSubmissions: 3,
            totalSubmissions: 6,
            contestSignals: 0,
            recentDays: 19,
            completeness: 'complete',
            stale: false,
          },
          prerequisites: [],
          suggestions: [],
          updatedAt: now.toISOString(),
        },
      ],
      contests: [],
      helpSessions: [],
      metadata,
      upsolvePending: 0,
      timeZone: 'UTC',
      now,
    })
    const weak = report.insights.find((item) => item.id === 'weak-accuracy')
    expect(weak?.text).toContain('binary search is 17%')
    const stale = report.insights.find((item) => item.id === 'stale-topic')
    expect(stale?.text).toContain(
      'You have not practiced Dynamic Programming in 19 days',
    )
    expect(report.topicProgress[0]?.name).toBe('Dynamic Programming')
  })
})
