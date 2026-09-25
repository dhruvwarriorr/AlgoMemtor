import { describe, expect, it, vi } from 'vitest'

import {
  InMemoryProgressRepository,
  type ProgressRepository,
} from './repositories/progress-repository.js'
import { InMemoryCoachRepository } from './repositories/coach-repository.js'
import { MemoryWorker, type MemoryWorkerOptions } from './memory-worker.js'
import type { AiMemoryClient } from './integrations/ai/ai-memory-client.js'
import type { AiCoachClient } from './integrations/ai/ai-coach-client.js'

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
  aiCoachClient?: AiCoachClient,
  coachRepository?: MemoryWorkerOptions['coachRepository'],
) => {
  const logger = { info: vi.fn(), warn: vi.fn() }
  const options: MemoryWorkerOptions = {
    repository,
    client,
    now,
    logger,
    ...(aiCoachClient === undefined ? {} : { aiCoachClient }),
    ...(coachRepository === undefined ? {} : { coachRepository }),
  }
  return { worker: new MemoryWorker(options), logger }
}

describe('memory worker', () => {
  it('retries at 30 seconds, two minutes, and ten minutes before failing', async () => {
    let currentTime = new Date('2026-09-13T12:00:00.000Z')
    const now = () => new Date(currentTime)
    const repository: ProgressRepository = new InMemoryProgressRepository(now)
    await repository.saveConsent(
      learnerId,
      true,
      'personalized-coaching-rag-v2',
    )
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

  it('does not execute retired consent cleanup jobs after the always-on migration', async () => {
    const now = () => new Date('2026-09-13T13:30:00.000Z')
    const repository: ProgressRepository = new InMemoryProgressRepository(now)
    const deleteLearnerData = vi.fn(async () => undefined)
    const client = createClient(async () => ({ status: 'processed' }))
    client.deleteLearnerData = deleteLearnerData
    const { worker } = createWorker(repository, client, now)

    await repository.enqueueJob({
      authUserId: learnerId,
      jobType: 'memory_consent_cleanup',
      evidenceType: 'consent_revoked',
      idempotencyKey: 'retired-consent-cleanup-test',
    })

    expect(await worker.processOnce()).toBe(true)
    expect(deleteLearnerData).not.toHaveBeenCalled()
    expect(await worker.processOnce()).toBe(false)
  })

  it('completes coach check-in jobs queued before check-ins were retired', async () => {
    const now = () => new Date('2026-09-13T14:00:00.000Z')
    const repository: ProgressRepository = new InMemoryProgressRepository(now)
    const { worker } = createWorker(
      repository,
      createClient(async () => ({ status: 'processed' })),
      now,
    )

    await repository.enqueueJob({
      authUserId: learnerId,
      jobType: 'coach_check_in_refresh',
      evidenceType: 'coach_check_in',
      idempotencyKey: 'coach-check-in-refresh-test',
    })

    expect(await worker.processOnce()).toBe(true)
    expect(await worker.processOnce()).toBe(false)
  })

  it('extracts only sanitized recent conversation turns for coach memory jobs', async () => {
    const now = () => new Date('2026-09-13T14:30:00.000Z')
    const repository: ProgressRepository = new InMemoryProgressRepository(now)
    await repository.saveConsent(
      learnerId,
      true,
      'personalized-coaching-rag-v2',
    )
    const coachRepository = new InMemoryCoachRepository(now)
    const conversation = await coachRepository.createConversation(learnerId)
    await coachRepository.appendMessage(learnerId, conversation.id, {
      role: 'user',
      content: 'I prefer progressive hints and struggle with graph DP.',
      evidence: [],
      proposals: [],
    })
    await coachRepository.appendMessage(learnerId, conversation.id, {
      role: 'assistant',
      content:
        '```cpp\nsecret source code\n``` Let us start with an invariant.',
      evidence: [],
      proposals: [],
    })
    const payloads: Array<{ note?: string; evidenceType: string }> = []
    const client = createClient(async (request) => {
      payloads.push({
        ...(request.note === undefined ? {} : { note: request.note }),
        evidenceType: request.evidenceType,
      })
      return { status: 'processed' }
    })
    const { worker } = createWorker(
      repository,
      client,
      now,
      undefined,
      coachRepository,
    )
    await repository.enqueueJob({
      authUserId: learnerId,
      jobType: 'memory_generation',
      evidenceType: 'coach_conversation',
      evidenceId: conversation.id,
      idempotencyKey: 'memory:coach-conversation-test',
    })

    expect(await worker.processOnce()).toBe(true)
    expect(payloads[0]?.evidenceType).toBe('coach_conversation')
    expect(payloads[0]?.note).toContain('progressive hints')
    expect(payloads[0]?.note).toContain('[code omitted]')
    expect(payloads[0]?.note).not.toContain('secret source code')
  })

  it('resolves a topic-note evidence job through the coach repository', async () => {
    const now = () => new Date('2026-09-13T14:30:00.000Z')
    const repository: ProgressRepository = new InMemoryProgressRepository(now)
    await repository.saveConsent(
      learnerId,
      true,
      'personalized-coaching-rag-v2',
    )
    const coachRepository = new InMemoryCoachRepository(now)
    const event = await coachRepository.recordTopicNote(
      learnerId,
      'sliding-window',
      "I'm pretty good at sliding window now.",
      'practiced',
      'ai_note',
    )
    const payloads: Array<{ note?: string; evidenceType: string }> = []
    const client = createClient(async (request) => {
      payloads.push({
        ...(request.note === undefined ? {} : { note: request.note }),
        evidenceType: request.evidenceType,
      })
      return { status: 'processed' }
    })
    const { worker } = createWorker(
      repository,
      client,
      now,
      undefined,
      coachRepository,
    )
    await repository.enqueueJob({
      authUserId: learnerId,
      jobType: 'memory_generation',
      evidenceType: 'topic_note',
      evidenceId: event.id,
      idempotencyKey: 'memory:topic-note-test',
    })

    expect(await worker.processOnce()).toBe(true)
    expect(payloads[0]?.evidenceType).toBe('topic_note')
    expect(payloads[0]?.note).toContain('sliding window')
  })

  it('skips a topic-note job when the note event cannot be found', async () => {
    const now = () => new Date('2026-09-13T14:30:00.000Z')
    const repository: ProgressRepository = new InMemoryProgressRepository(now)
    await repository.saveConsent(
      learnerId,
      true,
      'personalized-coaching-rag-v2',
    )
    const coachRepository = new InMemoryCoachRepository(now)
    const payloads: Array<{ evidenceType: string }> = []
    const client = createClient(async (request) => {
      payloads.push({ evidenceType: request.evidenceType })
      return { status: 'processed' }
    })
    const { worker } = createWorker(
      repository,
      client,
      now,
      undefined,
      coachRepository,
    )
    await repository.enqueueJob({
      authUserId: learnerId,
      jobType: 'memory_generation',
      evidenceType: 'topic_note',
      evidenceId: evidenceId,
      idempotencyKey: 'memory:topic-note-missing-test',
    })

    expect(await worker.processOnce()).toBe(true)
    expect(payloads).toHaveLength(0)
  })

  it('retries coach audit deletion through the durable outbox', async () => {
    const now = () => new Date('2026-09-13T15:00:00.000Z')
    const repository: ProgressRepository = new InMemoryProgressRepository(now)
    const deleted: Array<{ learnerId: string; conversationId: string }> = []
    const aiCoachClient: AiCoachClient = {
      respond: async () => ({ answer: 'unused', evidence: [], proposals: [] }),
      deleteConversation: async (authUserId, conversationId) => {
        deleted.push({ learnerId: authUserId, conversationId })
      },
    }
    const { worker } = createWorker(
      repository,
      createClient(async () => ({ status: 'processed' })),
      now,
      aiCoachClient,
    )

    const conversationId = '33333333-3333-4333-8333-333333333333'
    await repository.enqueueJob({
      authUserId: learnerId,
      jobType: 'coach_conversation_audit_deletion',
      evidenceType: 'coach_audit',
      evidenceId: conversationId,
      idempotencyKey: 'coach-audit-delete-test',
    })

    expect(await worker.processOnce()).toBe(true)
    expect(deleted).toEqual([{ learnerId, conversationId }])
    expect(await worker.processOnce()).toBe(false)
  })
})
