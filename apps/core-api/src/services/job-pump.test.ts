import { describe, expect, it, vi } from 'vitest'

import type { OutboxClaimScope } from '../repositories/progress-repository.js'
import { JobPump, PRIVACY_JOB_TYPES } from './job-pump.js'

const learner = '00000000-0000-4000-8000-000000000001'
const quiet = { info: () => {}, warn: () => {} }

// A processor that reports `count` jobs for each scope, then none.
const queue = (count: number) => {
  const remaining = new Map<string, number>()
  const calls: OutboxClaimScope[] = []
  return {
    calls,
    processNext: vi.fn(async (scope: OutboxClaimScope) => {
      calls.push(scope)
      const key = scope.authUserId ?? 'privacy'
      const left = remaining.get(key) ?? count
      if (left === 0) return false
      remaining.set(key, left - 1)
      return true
    }),
  }
}

describe('JobPump', () => {
  it('drains a learner’s due jobs until none are left', async () => {
    const memory = queue(2)
    const provider = { processNextFor: vi.fn(async () => false) }
    const pump = new JobPump({ memory, provider, logger: quiet })

    expect(await pump.drain(learner)).toBe(2)
    expect(provider.processNextFor).toHaveBeenCalledWith(learner)
    expect(memory.calls).toContainEqual({ authUserId: learner })
  })

  it('runs one drain per learner and joins concurrent wakes', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const provider = {
      processNextFor: vi.fn(async () => {
        calls += 1
        if (calls === 1) {
          await gate
          return true
        }
        return false
      }),
    }
    const pump = new JobPump({ provider, logger: quiet })

    const first = pump.drain(learner)
    const second = pump.drain(learner)
    expect(second).toBe(first)
    expect((await pump.status(learner)).draining).toBe(true)
    release()
    expect(await first).toBe(1)
    expect(await pump.status(learner)).toEqual({
      draining: false,
      pending: false,
    })
  })

  it('stops at the job budget', async () => {
    const provider = { processNextFor: vi.fn(async () => true) }
    const pump = new JobPump({ provider, maxJobsPerDrain: 3, logger: quiet })

    expect(await pump.drain(learner)).toBe(3)
  })

  it('stops claiming once the time budget is spent', async () => {
    let clock = 0
    const provider = {
      processNextFor: vi.fn(async () => {
        clock += 1_000
        return true
      }),
    }
    const pump = new JobPump({
      provider,
      maxDrainMs: 2_500,
      now: () => clock,
      logger: quiet,
    })

    expect(await pump.drain(learner)).toBe(3)
  })

  it('drains privacy jobs for every learner on any wake', async () => {
    const memory = queue(1)
    const pump = new JobPump({ memory, logger: quiet })

    await pump.drain(learner)
    await pump.idle()
    expect(memory.calls).toContainEqual({ jobTypes: PRIVACY_JOB_TYPES })
  })

  it('keeps work queued when a claim fails', async () => {
    const warn = vi.fn()
    const provider = {
      processNextFor: vi.fn(async () => {
        throw Object.assign(new Error('down'), { code: 'DB_UNAVAILABLE' })
      }),
    }
    const pump = new JobPump({ provider, logger: { info: () => {}, warn } })

    expect(await pump.drain(learner)).toBe(0)
    expect(warn).toHaveBeenCalledWith('job_pump_drain_failed', {
      errorCode: 'DB_UNAVAILABLE',
      processed: 0,
    })
  })

  it('reports pending work from the queues', async () => {
    const pump = new JobPump({
      hasPendingOutboxJob: async () => false,
      hasPendingProviderJob: async (authUserId) => authUserId === learner,
      logger: quiet,
    })

    expect(await pump.status(learner)).toEqual({
      draining: false,
      pending: true,
    })
  })
})
