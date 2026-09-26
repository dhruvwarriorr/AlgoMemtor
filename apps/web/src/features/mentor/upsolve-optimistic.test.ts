import type { UpsolveItem, UpsolveResponse } from '@algomemtor/shared-contracts'
import { describe, expect, it } from 'vitest'

import { applyUpsolveState } from './upsolve-optimistic'

const item = (externalId: string, overrides: Partial<UpsolveItem> = {}) =>
  ({
    id: `codeforces:${externalId}`,
    provider: 'codeforces',
    externalId,
    title: `Problem ${externalId}`,
    canonicalUrl: `https://codeforces.com/problemset/problem/1/${externalId}`,
    tags: [],
    contestOutcome: 'attempted',
    contestWrongAttempts: 1,
    status: 'pending',
    priority: 50,
    priorityReason: 'Close to your rating',
    contest: { provider: 'codeforces', contestId: '1', name: 'Round 1' },
    ...overrides,
  }) satisfies UpsolveItem

const data = (): UpsolveResponse => ({
  data: {
    queue: [item('A'), item('B')],
    contests: [
      {
        provider: 'codeforces',
        contestId: '1',
        name: 'Round 1',
        canonicalUrl: 'https://codeforces.com/contest/1',
        solvedInContest: 1,
        coverage: 'complete',
        items: [
          item('A'),
          item('B'),
          item('C', { status: 'solved_in_contest' }),
        ],
      },
    ],
    summary: {
      windowDays: 30,
      flagged: 2,
      upsolved: 0,
      skipped: 0,
      pending: 2,
      completionRate: 0,
      trend: [],
    },
    linkedProviders: ['codeforces'],
    generatedAt: '2026-09-26T12:00:00.000Z',
  },
})

describe('applyUpsolveState', () => {
  it('removes a solved problem from the queue and marks it upsolved', () => {
    const next = applyUpsolveState(
      data(),
      { provider: 'codeforces', externalId: 'A', state: 'solved' },
      '2026-09-26T13:00:00.000Z',
    )
    expect(next.data.queue.map((entry) => entry.externalId)).toEqual(['B'])
    expect(next.data.contests[0]?.items[0]).toMatchObject({
      status: 'upsolved',
      statusSource: 'manual',
      upsolvedAt: '2026-09-26T13:00:00.000Z',
    })
  })

  it('keeps the queue on restore and never changes contest solves', () => {
    const skipped = applyUpsolveState(data(), {
      provider: 'codeforces',
      externalId: 'B',
      state: 'skipped',
    })
    expect(skipped.data.contests[0]?.items[1]?.status).toBe('skipped')
    const restored = applyUpsolveState(skipped, {
      provider: 'codeforces',
      externalId: 'B',
      state: 'pending',
    })
    expect(restored.data.queue).toHaveLength(1)
    expect(restored.data.contests[0]?.items[1]?.status).toBe('pending')
    const contestSolve = applyUpsolveState(data(), {
      provider: 'codeforces',
      externalId: 'C',
      state: 'solved',
    })
    expect(contestSolve.data.contests[0]?.items[2]?.status).toBe(
      'solved_in_contest',
    )
  })
})
