import type {
  ProviderSolvedProblem,
  ProviderSubmission,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProblemActionRecord } from '../repositories/problem-action-repository.js'
import { progressWindow } from './progress-window.js'

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
