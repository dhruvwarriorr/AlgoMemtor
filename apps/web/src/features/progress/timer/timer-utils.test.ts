import { describe, expect, it } from 'vitest'

import type { ProblemTimerSession } from '../contracts'

import {
  formatTimerDuration,
  MAX_TIMER_SECONDS,
  timerProblemMatches,
} from './timer-utils'

const timer: ProblemTimerSession = {
  id: '00000000-0000-4000-8000-000000000010',
  problem: { provider: 'codeforces', externalId: '100A' },
  state: 'running',
  durationSeconds: 0,
  startedAt: '2026-09-13T00:00:00.000Z',
  requiresResolution: false,
  createdAt: '2026-09-13T00:00:00.000Z',
}

describe('timer utilities', () => {
  it('formats durations with a four-hour-cap-compatible clock', () => {
    expect(formatTimerDuration(0)).toBe('00:00:00')
    expect(formatTimerDuration(3_661)).toBe('01:01:01')
    expect(formatTimerDuration(MAX_TIMER_SECONDS)).toBe('04:00:00')
  })

  it('matches a timer only to the same provider problem', () => {
    expect(timerProblemMatches(timer, timer.problem)).toBe(true)
    expect(
      timerProblemMatches(timer, {
        provider: 'codeforces',
        externalId: '100B',
      }),
    ).toBe(false)
    expect(timerProblemMatches(null, timer.problem)).toBe(false)
  })
})
