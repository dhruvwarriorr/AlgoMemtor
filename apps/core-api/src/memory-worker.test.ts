import { describe, expect, it, vi } from 'vitest'

import {
  InMemoryProgressRepository,
  type ProgressRepository,
} from './repositories/progress-repository.js'
import { MemoryWorker, type MemoryWorkerOptions } from './memory-worker.js'
import type { AiMemoryClient } from './integrations/ai/ai-memory-client.js'

const learnerId = '11111111-1111-4111-8111-111111111111'
const evidenceId = '22222222-2222-4222-8222-222222222222'

const createClient = (
  processEvidence: AiMemoryClient['processEvidence'],
): AiMemoryClient => ({
  processEvidence,
  deleteLearnerData: async () => undefined,
  deleteProblemEvidence: async () => undefined,
  deleteLearnerPreference: async () => undefined,
  listMemories: async () => [],
  correctMemory: async () => {
    throw new Error('Not used in this test.')
  },
  actOnMemory: async () => {
    throw new Error('Not used in this test.')
  },
})

const createWorker = (
  repository: ProgressRepository,
  client: AiMemoryClient,
  now: () => Date,
) => {
  const logger = { info: vi.fn(), warn: vi.fn() }
  const options: MemoryWorkerOptions = { repository, client, now, logger }
  return { worker: new MemoryWorker(options), logger }
}

describe('memory worker', () => {
  it('retries at 30 seconds, two minutes, and ten minutes before failing', async () => {
    let currentTime = new Date('2026-09-13T12:00:00.000Z')
    const now = () => new Date(currentTime)
    const repository: ProgressRepository = new InMemoryProgressRepository(now)
    repository.getMemoryEvidence = async () => ({
      occurredAt: now(),
      perceivedDifficulty: 'medium',
    })
    const attempts: string[] = []
    const failure = Object.assign(new Error('AI unavailable'), {
      code: 'AI_MEMORY_UNAVAILABLE',
    })
    const client = createClient(async () => {
      attempts.push(now().toISOString())
      throw failure
    })
    const { worker, logger } = createWorker(repository, client, now)

    await repository.enqueueJob({
      authUserId: learnerId,
      jobType: 'memory_generation',
      evidenceType: 'reflection',
      evidenceId,
      idempotencyKey: 'memory-retry-test',
    })

    expect(await worker.processOnce()).toBe(true)
    expect(attempts).toHaveLength(1)
    expect(await worker.processOnce()).toBe(false)

    currentTime = new Date(currentTime.getTime() + 30_000)
    expect(await worker.processOnce()).toBe(true)
    expect(attempts).toHaveLength(2)
    expect(await worker.processOnce()).toBe(false)

    currentTime = new Date(currentTime.getTime() + 120_000)
    expect(await worker.processOnce()).toBe(true)
    expect(attempts).toHaveLength(3)
    expect(await worker.processOnce()).toBe(false)

    currentTime = new Date(currentTime.getTime() + 600_000)
    expect(await worker.processOnce()).toBe(true)
    expect(attempts).toHaveLength(4)
    expect(await worker.processOnce()).toBe(false)
    expect(logger.warn).toHaveBeenCalledWith(
      'memory_outbox_job_failed',
      expect.objectContaining({ errorCode: 'AI_MEMORY_UNAVAILABLE' }),
    )
    expect(await repository.claimNextJob(now())).toBeNull()
  })

  it('sends problem deletion context to AI and completes the job', async () => {
    let currentTime = new Date('2026-09-13T13:00:00.000Z')
    const now = () => new Date(currentTime)
    const repository: ProgressRepository = new InMemoryProgressRepository(now)
    const deleted: Array<{
      learnerId: string
      provider: string
      externalId: string
      idempotencyKey: string
    }> = []
    const client = createClient(async () => ({ status: 'processed' }))
    client.deleteProblemEvidence = async (
      learnerId,
      problemProvider,
      problemExternalId,
      idempotencyKey,
    ) => {
      deleted.push({
        learnerId,
        provider: problemProvider,
        externalId: problemExternalId,
        idempotencyKey,
      })
    }
    const { worker, logger } = createWorker(repository, client, now)

    await repository.enqueueJob({
      authUserId: learnerId,
      jobType: 'problem_data_deletion',
      evidenceType: 'problem',
      problemProvider: 'codeforces',
      problemExternalId: '1000A',
      idempotencyKey: 'problem-delete-test',
    })

    expect(await worker.processOnce()).toBe(true)
    expect(deleted).toEqual([
      {
        learnerId,
        provider: 'codeforces',
        externalId: '1000A',
        idempotencyKey: 'problem-delete-test',
      },
    ])
    expect(logger.info).toHaveBeenCalledWith(
      'memory_outbox_job_completed',
      expect.objectContaining({ jobType: 'problem_data_deletion' }),
    )
    expect(await worker.processOnce()).toBe(false)
  })
})
