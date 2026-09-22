import { describe, expect, it } from 'vitest'

import { ProgressAnalyticsResponseSchema } from '../src/progress.js'

const analytics = {
  data: {
    generatedAt: '2026-09-22T10:00:00.000Z',
    timezone: 'Asia/Kolkata',
    inventory: { unsolved: 0, attempted: 5, solved: 100 },
    window: { days: 30, attempted: 8, solved: 3 },
    trend: [{ date: '2026-09-22', attempted: 2, solved: 1 }],
    focusedSeconds: 0,
    averageSolvedSeconds: null,
    currentStreak: 1,
    longestStreak: 4,
    completionRate: 3 / 8,
    recommendationConversions: {
      impressions: 0,
      attempted: 0,
      solved: 0,
      impressionToAttempt: 0,
      impressionToSolve: 0,
    },
    topicScores: [],
  },
}

describe('progress analytics window', () => {
  it('keeps a dated-window count separate from the all-time inventory', () => {
    expect(
      ProgressAnalyticsResponseSchema.parse(analytics).data.window,
    ).toEqual({
      days: 30,
      attempted: 8,
      solved: 3,
    })
  })

  it('rejects missing or invalid window counts', () => {
    const { window: _window, ...withoutWindow } = analytics.data
    expect(
      ProgressAnalyticsResponseSchema.safeParse({ data: withoutWindow })
        .success,
    ).toBe(false)
    expect(
      ProgressAnalyticsResponseSchema.safeParse({
        data: {
          ...analytics.data,
          window: { days: 30, attempted: -1, solved: 3 },
        },
      }).success,
    ).toBe(false)
  })
})
