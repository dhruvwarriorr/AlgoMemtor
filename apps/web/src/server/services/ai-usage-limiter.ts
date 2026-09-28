import type { PrismaClient } from '../generated/prisma/client'

// Per-learner limits on requests that reach a paid AI model. The switch lets
// an operator test everything with limits off, then turn them on for launch.

export type AiUsageFeature = 'coach' | 'mentor' | 'recommendations'

type WindowKind = 'minute' | 'day'

export type AiUsageLimits = Record<
  AiUsageFeature,
  { perMinute: number; perDay: number }
>

export type AiUsageLimitConfig = {
  enabled: boolean
  limits: AiUsageLimits
  // Requests per UTC day across every learner; 0 means no shared ceiling.
  globalPerDay: number
}

export type AiUsageCounter = {
  subject: string
  bucket: string
  window: WindowKind
  windowStart: Date
  limit: number
}

export type AiUsageDecision =
  | { allowed: true }
  | {
      allowed: false
      scope: 'learner' | 'global'
      window: WindowKind
      limit: number
      retryAfterSeconds: number
    }

export interface AiUsageStore {
  /**
   * Counts one request against every counter, or none of them: when any
   * counter is already at its limit nothing is counted and that counter is
   * returned.
   */
  consume(counters: readonly AiUsageCounter[]): Promise<AiUsageCounter | null>
}

const nonNegativeInteger = (value: string | undefined, fallback: number) => {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

export function readAiUsageLimitConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AiUsageLimitConfig {
  const read = (name: string, fallback: number) =>
    nonNegativeInteger(environment[name], fallback)
  return {
    enabled: environment.AI_USAGE_LIMITS_ENABLED?.trim() === 'true',
    limits: {
      coach: {
        perMinute: read('AI_COACH_REQUESTS_PER_MINUTE', 4),
        perDay: read('AI_COACH_REQUESTS_PER_DAY', 40),
      },
      mentor: {
        perMinute: read('AI_MENTOR_REQUESTS_PER_MINUTE', 3),
        perDay: read('AI_MENTOR_REQUESTS_PER_DAY', 25),
      },
      recommendations: {
        perMinute: read('AI_RECOMMENDATION_REFRESHES_PER_MINUTE', 2),
        perDay: read('AI_RECOMMENDATION_REFRESHES_PER_DAY', 10),
      },
    },
    globalPerDay: read('AI_GLOBAL_REQUESTS_PER_DAY', 0),
  }
}

const startOfMinute = (now: Date) =>
  new Date(Math.floor(now.getTime() / 60_000) * 60_000)

const startOfUtcDay = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

const windowLengthMs: Record<WindowKind, number> = {
  minute: 60_000,
  day: 86_400_000,
}

export class AiUsageLimiter {
  constructor(
    private readonly config: AiUsageLimitConfig,
    private readonly store: AiUsageStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get enabled() {
    return this.config.enabled
  }

  async consume(
    authUserId: string,
    feature: AiUsageFeature,
  ): Promise<AiUsageDecision> {
    if (!this.config.enabled) return { allowed: true }
    const now = this.now()
    const limits = this.config.limits[feature]
    // A limit of 0 turns that window off.
    const counters: AiUsageCounter[] = [
      {
        subject: authUserId,
        bucket: feature,
        window: 'minute' as const,
        windowStart: startOfMinute(now),
        limit: limits.perMinute,
      },
      {
        subject: authUserId,
        bucket: feature,
        window: 'day' as const,
        windowStart: startOfUtcDay(now),
        limit: limits.perDay,
      },
      {
        subject: 'global',
        bucket: 'all',
        window: 'day' as const,
        windowStart: startOfUtcDay(now),
        limit: this.config.globalPerDay,
      },
    ].filter((counter) => counter.limit > 0)
    if (counters.length === 0) return { allowed: true }
    const exhausted = await this.store.consume(counters)
    if (exhausted === null) return { allowed: true }
    const resetsAt =
      exhausted.windowStart.getTime() + windowLengthMs[exhausted.window]
    return {
      allowed: false,
      scope: exhausted.subject === 'global' ? 'global' : 'learner',
      window: exhausted.window,
      limit: exhausted.limit,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((resetsAt - now.getTime()) / 1000),
      ),
    }
  }
}

const counterKey = (counter: AiUsageCounter) =>
  `${counter.subject}|${counter.bucket}|${counter.window}|${counter.windowStart.toISOString()}`

export class InMemoryAiUsageStore implements AiUsageStore {
  private readonly counts = new Map<string, number>()

  async consume(counters: readonly AiUsageCounter[]) {
    const exhausted = counters.find(
      (counter) => (this.counts.get(counterKey(counter)) ?? 0) >= counter.limit,
    )
    if (exhausted !== undefined) return exhausted
    for (const counter of counters) {
      const key = counterKey(counter)
      this.counts.set(key, (this.counts.get(key) ?? 0) + 1)
    }
    return null
  }
}

class CounterExhausted extends Error {
  constructor(readonly counter: AiUsageCounter) {
    super('AI usage counter exhausted.')
  }
}

// Counters live in PostgreSQL so a free Render instance that sleeps and
// restarts does not hand every learner a fresh allowance.
export class PrismaAiUsageStore implements AiUsageStore {
  private lastPrune = 0

  constructor(private readonly prisma: PrismaClient) {}

  async consume(counters: readonly AiUsageCounter[]) {
    try {
      await this.prisma.$transaction(async (transaction) => {
        for (const counter of counters) {
          // Increments only while below the limit; no row means exhausted.
          const rows = await transaction.$queryRaw<{ count: number }[]>`
            INSERT INTO core.ai_usage_counters
              (subject, bucket, window_kind, window_start, count, updated_at)
            VALUES (${counter.subject}, ${counter.bucket}, ${counter.window},
              ${counter.windowStart}, 1, now())
            ON CONFLICT (subject, bucket, window_kind, window_start)
            DO UPDATE SET count = core.ai_usage_counters.count + 1,
              updated_at = now()
            WHERE core.ai_usage_counters.count < ${counter.limit}
            RETURNING count`
          if (rows.length === 0) throw new CounterExhausted(counter)
        }
      })
    } catch (error) {
      if (error instanceof CounterExhausted) return error.counter
      throw error
    }
    await this.pruneOccasionally()
    return null
  }

  // Old windows are only counts, but they need not be kept.
  private async pruneOccasionally() {
    const now = Date.now()
    if (now - this.lastPrune < 3_600_000) return
    this.lastPrune = now
    await this.prisma.$executeRaw`
      DELETE FROM core.ai_usage_counters
      WHERE window_start < now() - interval '2 days'`
  }
}
