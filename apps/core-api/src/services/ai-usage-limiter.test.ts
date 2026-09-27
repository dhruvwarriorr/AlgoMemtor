import { describe, expect, it } from 'vitest'

import {
  AiUsageLimiter,
  InMemoryAiUsageStore,
  readAiUsageLimitConfig,
  type AiUsageLimitConfig,
} from './ai-usage-limiter.js'

const learner = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'

const config = (
  overrides: Partial<AiUsageLimitConfig> = {},
): AiUsageLimitConfig => ({
  enabled: true,
  limits: {
    coach: { perMinute: 2, perDay: 3 },
    mentor: { perMinute: 1, perDay: 5 },
    recommendations: { perMinute: 0, perDay: 0 },
  },
  globalPerDay: 0,
  ...overrides,
})

describe('AI usage limits', () => {
  it('are off unless explicitly enabled', () => {
    expect(readAiUsageLimitConfig({}).enabled).toBe(false)
    expect(
      readAiUsageLimitConfig({ AI_USAGE_LIMITS_ENABLED: 'true' }).enabled,
    ).toBe(true)
    expect(
      readAiUsageLimitConfig({ AI_COACH_REQUESTS_PER_DAY: '-4' }).limits.coach
        .perDay,
    ).toBe(40)
  })

  it('allows everything when disabled', async () => {
    const limiter = new AiUsageLimiter(
      config({ enabled: false }),
      new InMemoryAiUsageStore(),
    )
    for (let index = 0; index < 10; index += 1) {
      expect((await limiter.consume(learner, 'coach')).allowed).toBe(true)
    }
  })

  it('enforces the per-minute window and reports when it resets', async () => {
    let now = new Date('2026-09-27T10:00:15Z')
    const limiter = new AiUsageLimiter(
      config(),
      new InMemoryAiUsageStore(),
      () => now,
    )
    expect((await limiter.consume(learner, 'coach')).allowed).toBe(true)
    expect((await limiter.consume(learner, 'coach')).allowed).toBe(true)
    expect(await limiter.consume(learner, 'coach')).toEqual({
      allowed: false,
      scope: 'learner',
      window: 'minute',
      limit: 2,
      retryAfterSeconds: 45,
    })
    // Other learners and other features keep their own allowance.
    expect((await limiter.consume(other, 'coach')).allowed).toBe(true)
    expect((await limiter.consume(learner, 'mentor')).allowed).toBe(true)
    now = new Date('2026-09-27T10:01:00Z')
    expect((await limiter.consume(learner, 'coach')).allowed).toBe(true)
  })

  it('enforces the daily window without spending the minute window', async () => {
    let now = new Date('2026-09-27T10:00:00Z')
    const limiter = new AiUsageLimiter(
      config(),
      new InMemoryAiUsageStore(),
      () => now,
    )
    for (const minute of [0, 1, 2]) {
      now = new Date(`2026-09-27T10:0${minute}:00Z`)
      expect((await limiter.consume(learner, 'coach')).allowed).toBe(true)
    }
    now = new Date('2026-09-27T10:05:00Z')
    const decision = await limiter.consume(learner, 'coach')
    expect(decision).toMatchObject({ allowed: false, window: 'day', limit: 3 })
    now = new Date('2026-09-28T00:00:01Z')
    expect((await limiter.consume(learner, 'coach')).allowed).toBe(true)
  })

  it('applies a shared daily ceiling across learners', async () => {
    const limiter = new AiUsageLimiter(
      config({ globalPerDay: 2 }),
      new InMemoryAiUsageStore(),
    )
    expect((await limiter.consume(learner, 'coach')).allowed).toBe(true)
    expect((await limiter.consume(other, 'mentor')).allowed).toBe(true)
    expect(await limiter.consume(other, 'coach')).toMatchObject({
      allowed: false,
      scope: 'global',
    })
  })

  it('treats a zero limit as no limit', async () => {
    const limiter = new AiUsageLimiter(config(), new InMemoryAiUsageStore())
    for (let index = 0; index < 5; index += 1) {
      expect((await limiter.consume(learner, 'recommendations')).allowed).toBe(
        true,
      )
    }
  })
})
