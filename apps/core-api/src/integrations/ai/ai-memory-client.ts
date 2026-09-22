import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import type { ProviderKey } from '@algomemtor/shared-contracts'

type AiMemoryConfig = {
  baseUrl: string
  internalServiceToken: string
}

export type MemoryEvidenceRequest = {
  requestId?: string
  learnerId: string
  evidenceType: string
  evidenceId: string
  idempotencyKey: string
  occurredAt?: string
  note?: string
  perceivedDifficulty?: 'easy' | 'medium' | 'hard'
  timeSpentMinutes?: number
  feedback?: 'useful' | 'not_useful' | 'too_easy' | 'about_right' | 'too_hard'
  explicitPreference?: string
  problemStatus?: 'unsolved' | 'attempted' | 'solved'
  problemProvider?: ProviderKey
  problemExternalId?: string
}

const aiMemorySchema = z
  .object({
    id: z.uuid(),
    learnerId: z.uuid(),
    category: z.enum([
      'preference',
      'difficulty_calibration',
      'topic_weakness',
      'scheduling_preference',
      'recommendation_feedback_pattern',
      'learning_goal',
      'topic_strength',
      'coding_style',
      'problem_solving_approach',
      'learning_pace',
      'time_availability',
      'mistake_pattern',
      'contest_performance',
      'explanation_preference',
      'communication_preference',
      'user_instruction',
      'conversation_summary',
      'learning_milestone',
      'bloom_level',
      'spaced_repetition_state',
    ]),
    statement: z.string().trim().min(1).max(500),
    structuredValue: z.record(z.string(), z.unknown()).default({}),
    confidence: z.number().finite().min(0).max(1),
    status: z.enum(['proposed', 'active', 'archived']),
    evidenceIds: z.array(z.uuid()).min(1).max(64),
    version: z.number().int().positive().default(1),
    supersedesMemoryId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? undefined),
    learnerCorrected: z.boolean().default(false),
    similarity: z
      .number()
      .finite()
      .min(0)
      .max(1)
      .nullish()
      .transform((value) => value ?? undefined),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()

const aiMemoryActionResponseSchema = z
  .object({
    requestId: z.string().trim().min(1).max(160),
    action: z.enum([
      'propose',
      'approve',
      'correct',
      'archive',
      'restore',
      'delete',
    ]),
    idempotent: z.boolean().default(false),
    memory: aiMemorySchema.nullish().transform((value) => value ?? undefined),
    auditId: z
      .uuid()
      .nullish()
      .transform((value) => value ?? undefined),
  })
  .strict()

const memoryProcessStatusSchema = z
  .object({
    status: z.enum(['processed', 'already_processed', 'already_processing']),
  })
  .passthrough()

export type AiMemoryRecord = z.infer<typeof aiMemorySchema>
export type AiMemoryActionResponse = z.infer<
  typeof aiMemoryActionResponseSchema
>
export type AiMemoryProcessResult = z.infer<typeof memoryProcessStatusSchema>
export type LearnerMemoryAction = 'approve' | 'archive' | 'restore' | 'delete'
export type LearnerMemoryCategory = AiMemoryRecord['category']

export interface AiMemoryClient {
  processEvidence(
    request: MemoryEvidenceRequest,
  ): Promise<AiMemoryProcessResult>
  deleteLearnerData(
    learnerId: string,
    idempotencyKey: string,
    reason?: 'consent_revoked' | 'learner_deleted' | 'manual_request',
  ): Promise<void>
  deleteProblemEvidence(
    learnerId: string,
    problemProvider: ProviderKey,
    problemExternalId: string,
    idempotencyKey: string,
  ): Promise<void>
  deleteLearnerPreference(
    learnerId: string,
    idempotencyKey: string,
  ): Promise<void>
  listMemories(learnerId: string): Promise<AiMemoryRecord[]>
  retrieveMemories?(
    learnerId: string,
    query: string,
    limit?: number,
  ): Promise<AiMemoryRecord[]>
  proposeMemory?(
    learnerId: string,
    requestId: string,
    input: { statement: string; category: LearnerMemoryCategory },
  ): Promise<AiMemoryActionResponse>
  correctMemory(
    learnerId: string,
    memoryId: string,
    input: { text: string; category: AiMemoryRecord['category'] },
  ): Promise<AiMemoryActionResponse>
  actOnMemory(
    learnerId: string,
    memoryId: string,
    action: LearnerMemoryAction,
  ): Promise<AiMemoryActionResponse>
}

export class AiMemoryClientError extends Error {
  constructor(readonly code: string) {
    super('The AI memory service could not process this job.')
    this.name = 'AiMemoryClientError'
  }
}

export class UnavailableAiMemoryClient implements AiMemoryClient {
  async processEvidence(
    _request: MemoryEvidenceRequest,
  ): Promise<AiMemoryProcessResult> {
    throw new AiMemoryClientError('AI_MEMORY_NOT_CONFIGURED')
  }

  async deleteLearnerData(
    _learnerId: string,
    _idempotencyKey: string,
    _reason?: 'consent_revoked' | 'learner_deleted' | 'manual_request',
  ): Promise<void> {
    throw new AiMemoryClientError('AI_MEMORY_NOT_CONFIGURED')
  }

  async deleteProblemEvidence(
    _learnerId: string,
    _problemProvider: ProviderKey,
    _problemExternalId: string,
    _idempotencyKey: string,
  ): Promise<void> {
    throw new AiMemoryClientError('AI_MEMORY_NOT_CONFIGURED')
  }

  async deleteLearnerPreference(
    _learnerId: string,
    _idempotencyKey: string,
  ): Promise<void> {
    throw new AiMemoryClientError('AI_MEMORY_NOT_CONFIGURED')
  }

  async listMemories(_learnerId: string): Promise<AiMemoryRecord[]> {
    throw new AiMemoryClientError('AI_MEMORY_NOT_CONFIGURED')
  }

  async retrieveMemories(
    _learnerId: string,
    _query: string,
    _limit?: number,
  ): Promise<AiMemoryRecord[]> {
    throw new AiMemoryClientError('AI_MEMORY_NOT_CONFIGURED')
  }

  async proposeMemory(): Promise<AiMemoryActionResponse> {
    throw new AiMemoryClientError('AI_MEMORY_NOT_CONFIGURED')
  }

  async correctMemory(): Promise<AiMemoryActionResponse> {
    throw new AiMemoryClientError('AI_MEMORY_NOT_CONFIGURED')
  }

  async actOnMemory(): Promise<AiMemoryActionResponse> {
    throw new AiMemoryClientError('AI_MEMORY_NOT_CONFIGURED')
  }
}

export class HttpAiMemoryClient implements AiMemoryClient {
  constructor(
    private readonly config: AiMemoryConfig,
    private readonly timeoutMs = 8_000,
  ) {}

  private async request(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    idempotencyKey?: string,
    body?: unknown,
  ): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(new URL(path, this.config.baseUrl), {
        method,
        headers: {
          'content-type': 'application/json',
          'x-internal-service-token': this.config.internalServiceToken,
          ...(idempotencyKey === undefined
            ? {}
            : { 'x-idempotency-key': idempotencyKey }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new AiMemoryClientError(
          response.status >= 500
            ? 'AI_MEMORY_UNAVAILABLE'
            : 'AI_MEMORY_REJECTED',
        )
      }
      if (response.status === 204) return undefined
      try {
        return await response.json()
      } catch {
        throw new AiMemoryClientError('AI_MEMORY_INVALID_RESPONSE')
      }
    } catch (error) {
      if (error instanceof AiMemoryClientError) throw error
      throw new AiMemoryClientError(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'AI_MEMORY_TIMEOUT'
          : 'AI_MEMORY_TRANSPORT_ERROR',
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  async processEvidence(request: MemoryEvidenceRequest) {
    const payload = await this.request(
      '/internal/memory/process',
      'POST',
      request.idempotencyKey,
      request,
    )
    const result = memoryProcessStatusSchema.safeParse(payload)
    if (!result.success) {
      throw new AiMemoryClientError('AI_MEMORY_INVALID_RESPONSE')
    }
    if (result.data.status === 'already_processing') {
      throw new AiMemoryClientError('AI_MEMORY_STILL_PROCESSING')
    }
    return result.data
  }

  async deleteLearnerData(
    learnerId: string,
    idempotencyKey: string,
    reason:
      | 'consent_revoked'
      | 'learner_deleted'
      | 'manual_request' = 'learner_deleted',
  ) {
    await this.request('/internal/memory/delete', 'POST', idempotencyKey, {
      learnerId,
      reason,
    })
  }

  async deleteProblemEvidence(
    learnerId: string,
    problemProvider: ProviderKey,
    problemExternalId: string,
    idempotencyKey: string,
  ) {
    await this.request(
      `/internal/learners/${encodeURIComponent(learnerId)}/memory-evidence`,
      'DELETE',
      idempotencyKey,
      {
        requestId: idempotencyKey,
        problemProvider,
        problemExternalId,
      },
    )
  }

  async deleteLearnerPreference(learnerId: string, idempotencyKey: string) {
    await this.request(
      `/internal/learners/${encodeURIComponent(learnerId)}/preference-memory`,
      'DELETE',
      idempotencyKey,
      {
        requestId: idempotencyKey,
        reason: 'profile_preference_changed',
      },
    )
  }

  async listMemories(learnerId: string) {
    const payload = await this.request(
      `/internal/learners/${encodeURIComponent(learnerId)}/memory-list`,
      'GET',
    )
    const result = z.array(aiMemorySchema).safeParse(payload)
    if (!result.success)
      throw new AiMemoryClientError('AI_MEMORY_INVALID_RESPONSE')
    return result.data
  }

  async retrieveMemories(learnerId: string, query: string, limit = 15) {
    const payload = await this.request(
      `/internal/learners/${encodeURIComponent(learnerId)}/memories?query=${encodeURIComponent(query)}&limit=${Math.min(20, Math.max(1, limit))}`,
      'GET',
    )
    const result = z
      .object({ items: z.array(aiMemorySchema) })
      .passthrough()
      .safeParse(payload)
    if (!result.success) {
      throw new AiMemoryClientError('AI_MEMORY_INVALID_RESPONSE')
    }
    return result.data.items
  }

  async proposeMemory(
    learnerId: string,
    requestId: string,
    input: { statement: string; category: LearnerMemoryCategory },
  ) {
    const payload = await this.request(
      `/internal/learners/${encodeURIComponent(learnerId)}/memories/propose`,
      'POST',
      requestId,
      {
        requestId,
        statement: input.statement,
        category: input.category,
      },
    )
    const result = aiMemoryActionResponseSchema.safeParse(payload)
    if (!result.success) {
      throw new AiMemoryClientError('AI_MEMORY_INVALID_RESPONSE')
    }
    return result.data
  }

  async correctMemory(
    learnerId: string,
    memoryId: string,
    input: { text: string; category: AiMemoryRecord['category'] },
  ) {
    const requestId = randomUUID()
    const payload = await this.request(
      `/internal/learners/${encodeURIComponent(learnerId)}/memories/${encodeURIComponent(memoryId)}`,
      'PATCH',
      requestId,
      {
        requestId,
        statement: input.text,
        category: input.category,
      },
    )
    const result = aiMemoryActionResponseSchema.safeParse(payload)
    if (!result.success)
      throw new AiMemoryClientError('AI_MEMORY_INVALID_RESPONSE')
    return result.data
  }

  async actOnMemory(
    learnerId: string,
    memoryId: string,
    action: LearnerMemoryAction,
  ) {
    const basePath = `/internal/learners/${encodeURIComponent(learnerId)}/memories/${encodeURIComponent(memoryId)}`
    const requestId = randomUUID()
    const path = action === 'delete' ? basePath : `${basePath}/${action}`
    const payload = await this.request(
      path,
      action === 'delete' ? 'DELETE' : 'POST',
      requestId,
      { requestId },
    )
    const result = aiMemoryActionResponseSchema.safeParse(payload)
    if (!result.success)
      throw new AiMemoryClientError('AI_MEMORY_INVALID_RESPONSE')
    return result.data
  }
}
