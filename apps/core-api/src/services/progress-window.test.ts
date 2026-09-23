import type {
  ProviderSolvedProblem,
  ProviderSubmission,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProblemActionRecord } from '../repositories/problem-action-repository.js'
import {
  calculateStreaks,
  progressBreakdown,
  progressWindow,
} from './progress-window.js'

const dates = ['2026-09-20', '2026-09-21', '2026-09-22']
const localDate = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

const provenance = {
  provider: 'codeforces' as const,
  providerId: '123A',
  canonicalUrl: 'https://codeforces.com/problemset/problem/123/A',
  sourceUrl: 'https://codeforces.com/api/user.status',
  extractionStrategy: 'official_json' as const,
  schemaVersion: 'v1',
  completeness: 'partial' as const,
  fetchedAt: '2026-09-22T10:00:00.000Z',
  stale: false,
}

const submission = (
  externalId: string,
  occurredAt: string | undefined,
  isAccepted: boolean,
): ProviderSubmission => ({
  provider: 'codeforces',
  externalId,
  eventId: `event-${externalId}`,
  canonicalUrl: provenance.canonicalUrl,
  verdict: isAccepted ? 'OK' : 'WRONG_ANSWER',
  ...(occurredAt === undefined ? {} : { occurredAt }),
  isAccepted,
  completeness: 'partial',
  provenance,
})

const observation = (
  externalId: string,
  occurredAt: string | null,
): ProviderSolvedProblem => ({
  provider: 'codeforces',
  externalId,
  canonicalUrl: provenance.canonicalUrl,
  occurredAt,
  firstObservedAt: '2026-09-22T10:00:00.000Z',
  lastObservedAt: '2026-09-22T10:00:00.000Z',
  completeness: 'partial',
  provenance,
})

afterEach(() => vi.useRealTimers())

describe('progressWindow', () => {
  it('uses local dates, unique problem identities, and deduplicates overlapping evidence', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T10:00:00.000Z'))
    const action: ProblemActionRecord = {
      id: '00000000-0000-4000-8000-000000000001',
      provider: 'codeforces',
      externalId: '123A',
      actionType: 'status_changed',
      learnerStatus: 'solved',
      evidenceSource: 'provider_verified',
      occurredAt: new Date('2026-09-21T20:00:00.000Z'),
    }
    const result = progressWindow(
      [action],
      [
        submission('123A', '2026-09-21T20:00:00.000Z', true),
        submission('123B', '2026-09-20T20:00:00.000Z', false),
        submission('old', '2026-08-20T12:00:00.000Z', true),
        submission('untimed', undefined, true),
      ],
      [observation('123A', '2026-09-21T20:00:00.000Z')],
      dates,
      localDate,
    )
    expect(result.attempted).toBe(2)
    expect(result.solved).toBe(1)
    expect(result.trend).toEqual([
      { date: '2026-09-20', attempted: 0, solved: 0 },
      { date: '2026-09-21', attempted: 1, solved: 0 },
      { date: '2026-09-22', attempted: 1, solved: 1 },
    ])
  })

  it('does not count an undated solve observation as a recent solve', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T10:00:00.000Z'))
    const result = progressWindow(
      [],
      [],
      [observation('123A', null)],
      dates,
      localDate,
    )
    expect(result.solved).toBe(0)
  })

  it('does not call a repeated accepted submission a new solve', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T10:00:00.000Z'))
    const result = progressWindow(
      [],
      [submission('123A', '2026-09-22T08:00:00.000Z', true)],
      [observation('123A', '2026-08-20T12:00:00.000Z')],
      dates,
      localDate,
    )
    expect(result.attempted).toBe(1)
    expect(result.solved).toBe(0)
  })
})

describe('calculateStreaks', () => {
  const days = (...values: string[]) => new Set(values)

  it('keeps the streak alive before the first solve of today', () => {
    expect(
      calculateStreaks(
        days('2026-09-20', '2026-09-21', '2026-09-22'),
        '2026-09-23',
      ),
    ).toEqual({ current: 3, longest: 3 })
  })

  it('counts today when the learner already solved today', () => {
    expect(
      calculateStreaks(days('2026-09-22', '2026-09-23'), '2026-09-23'),
    ).toEqual({ current: 2, longest: 2 })
  })

  it('breaks after a full day without a solve', () => {
    expect(
      calculateStreaks(
        days('2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21'),
        '2026-09-23',
      ),
    ).toEqual({ current: 0, longest: 4 })
  })

  it('handles month boundaries', () => {
    expect(
      calculateStreaks(days('2026-08-31', '2026-09-01'), '2026-09-02'),
    ).toEqual({ current: 2, longest: 2 })
  })
})

describe('progressBreakdown', () => {
  const submission = (
    provider: 'codeforces' | 'leetcode',
    externalId: string,
    occurredAt: string,
    verdict: string,
    isAccepted: boolean,
  ) =>
    ({
      provider,
      externalId,
      eventId: `${externalId}-${occurredAt}`,
      canonicalUrl: 'https://codeforces.com/',
      verdict,
      occurredAt,
      isAccepted,
      completeness: 'complete',
      provenance: {} as never,
    }) as const

  it('splits the window by platform, verdict, difficulty, weekday and hour', () => {
    const result = progressBreakdown({
      dates: ['2026-09-21', '2026-09-22'],
      newlySolved: [
        { key: 'codeforces:1A', day: '2026-09-21' },
        { key: 'leetcode:two-sum', day: '2026-09-22' },
      ],
      attemptedProblemIds: [
        'codeforces:1A',
        'codeforces:2B',
        'leetcode:two-sum',
      ],
      submissions: [
        submission(
          'codeforces',
          '2B',
          '2026-09-21T09:15:00.000Z',
          'WRONG_ANSWER',
          false,
        ),
        submission('codeforces', '1A', '2026-09-21T09:40:00.000Z', 'OK', true),
        submission(
          'leetcode',
          'two-sum',
          '2026-09-22T21:05:00.000Z',
          'Accepted',
          true,
        ),
        submission('codeforces', '3C', '2026-08-01T10:00:00.000Z', 'OK', true),
      ],
      problems: new Map([
        [
          'codeforces:1A',
          { normalizedDifficulty: 'easy', providerDifficulty: 1350 },
        ],
        [
          'leetcode:two-sum',
          { normalizedDifficulty: 'easy', providerDifficulty: 'Easy' },
        ],
      ]),
      localDate: (date) => date.toISOString().slice(0, 10),
      localHour: (date) => date.getUTCHours(),
    })
    expect(result.submissions).toBe(3)
    expect(result.providers).toEqual([
      { provider: 'codeforces', solved: 1, attempted: 2, submissions: 2 },
      { provider: 'leetcode', solved: 1, attempted: 1, submissions: 1 },
    ])
    expect(result.verdicts).toMatchObject({ accepted: 2, wrongAnswer: 1 })
    expect(result.difficulty).toEqual({
      easy: 2,
      medium: 0,
      hard: 0,
      unknown: 0,
    })
    expect(result.ratingBands).toEqual([{ min: 1200, max: 1399, solved: 1 }])
    // 2026-09-21 is a Monday.
    expect(result.weekdays[0]).toEqual({
      day: 'Mon',
      solved: 1,
      submissions: 2,
    })
    expect(result.hours[9]).toBe(2)
    expect(result.hours[21]).toBe(1)
  })
})
