import type { OutboxClaimScope } from '../repositories/progress-repository.js'
import {
  structuredLogger,
  type StructuredLogger,
} from '../utils/structured-logger.js'

// Queued work (provider syncs and learner-memory jobs) stays durable in
// PostgreSQL, but no always-on worker polls it. Instead, activity wakes a
// bounded drain inside the API process: the signed-in website while it is
// visible, and trusted connector uploads after they are stored. When nobody
// is active, ordinary work waits for the next visit.

// Privacy cleanup is drained for every learner whenever any drain runs, so a
// deletion never depends on that learner coming back.
export const PRIVACY_JOB_TYPES = [
  'learner_data_deletion',
  'problem_data_deletion',
  'coach_conversation_audit_deletion',
] as const

type OutboxProcessor = {
  processNext(scope: OutboxClaimScope): Promise<boolean>
}

type ProviderProcessor = {
  processNextFor(authUserId: string): Promise<boolean>
}

export type JobPumpOptions = {
  memory?: OutboxProcessor
  provider?: ProviderProcessor
  hasPendingOutboxJob?: (scope: OutboxClaimScope) => Promise<boolean>
  hasPendingProviderJob?: (authUserId: string) => Promise<boolean>
  // The longest one drain keeps claiming new jobs after it was woken. A job
  // that is already running finishes; its lease covers a restart.
  maxDrainMs?: number
  maxJobsPerDrain?: number
  maxPrivacyJobsPerDrain?: number
  logger?: Pick<StructuredLogger, 'info' | 'warn'>
  now?: () => number
}

export type JobPumpStatus = {
  // A drain for this learner is running now.
  draining: boolean
  // This learner has a job running now or due to run now.
  pending: boolean
}

const DEFAULT_MAX_DRAIN_MS = 4 * 60 * 1000
const DEFAULT_MAX_JOBS = 25
const DEFAULT_MAX_PRIVACY_JOBS = 5

const safeErrorCode = (error: unknown) =>
  error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'JOB_PUMP_FAILED'

export class JobPump {
  private readonly drains = new Map<string, Promise<number>>()
  private privacyDrain: Promise<void> | undefined
  private readonly logger
  private readonly now
  private readonly maxDrainMs
  private readonly maxJobs
  private readonly maxPrivacyJobs

  constructor(private readonly options: JobPumpOptions) {
    this.logger = options.logger ?? structuredLogger
    this.now = options.now ?? Date.now
    this.maxDrainMs = options.maxDrainMs ?? DEFAULT_MAX_DRAIN_MS
    this.maxJobs = options.maxJobsPerDrain ?? DEFAULT_MAX_JOBS
    this.maxPrivacyJobs =
      options.maxPrivacyJobsPerDrain ?? DEFAULT_MAX_PRIVACY_JOBS
    if (this.maxDrainMs <= 0 || this.maxJobs < 1 || this.maxPrivacyJobs < 0) {
      throw new Error('The job pump configuration is invalid.')
    }
  }

  // Starts draining this learner's due jobs in the background and returns at
  // once. A learner has at most one drain in this process; waking during a
  // drain joins it.
  wake(authUserId: string) {
    void this.drain(authUserId)
  }

  // Drains this learner's due jobs, oldest first, until none are due or the
  // job or time budget runs out. Resolves with the number processed.
  drain(authUserId: string): Promise<number> {
    const running = this.drains.get(authUserId)
    if (running !== undefined) return running
    const run = this.run(authUserId).finally(() => {
      if (this.drains.get(authUserId) === run) this.drains.delete(authUserId)
    })
    this.drains.set(authUserId, run)
    this.wakePrivacy()
    return run
  }

  // Read from the queues, so it also covers work another instance runs.
  async status(authUserId: string): Promise<JobPumpStatus> {
    const draining = this.drains.has(authUserId)
    try {
      const [outbox, provider] = await Promise.all([
        this.options.hasPendingOutboxJob?.({ authUserId }) ?? false,
        this.options.hasPendingProviderJob?.(authUserId) ?? false,
      ])
      return { draining, pending: outbox || provider }
    } catch (error) {
      this.logger.warn('job_pump_status_failed', {
        errorCode: safeErrorCode(error),
      })
      return { draining, pending: draining }
    }
  }

  // Waits for every drain started so far (shutdown and tests).
  async idle() {
    await Promise.allSettled([...this.drains.values(), this.privacyDrain])
  }

  private async run(authUserId: string) {
    const startedAt = this.now()
    let processed = 0
    try {
      while (
        processed < this.maxJobs &&
        this.now() - startedAt < this.maxDrainMs
      ) {
        const memory =
          (await this.options.memory?.processNext({ authUserId })) ?? false
        const provider =
          (await this.options.provider?.processNextFor(authUserId)) ?? false
        if (!memory && !provider) break
        processed += (memory ? 1 : 0) + (provider ? 1 : 0)
      }
    } catch (error) {
      // Job failures are recorded by the processors; this is a claim or
      // database failure. The work stays queued for the next wake.
      this.logger.warn('job_pump_drain_failed', {
        errorCode: safeErrorCode(error),
        processed,
      })
    }
    if (processed > 0) {
      this.logger.info('job_pump_drain_completed', {
        processed,
        durationMs: this.now() - startedAt,
      })
    }
    return processed
  }

  private wakePrivacy() {
    const memory = this.options.memory
    if (
      memory === undefined ||
      this.maxPrivacyJobs === 0 ||
      this.privacyDrain !== undefined
    ) {
      return
    }
    const run = (async () => {
      try {
        for (let index = 0; index < this.maxPrivacyJobs; index += 1) {
          const processed = await memory.processNext({
            jobTypes: PRIVACY_JOB_TYPES,
          })
          if (!processed) break
        }
      } catch (error) {
        this.logger.warn('job_pump_privacy_drain_failed', {
          errorCode: safeErrorCode(error),
        })
      }
    })().finally(() => {
      if (this.privacyDrain === run) this.privacyDrain = undefined
    })
    this.privacyDrain = run
  }
}
