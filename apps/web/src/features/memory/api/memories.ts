import {
  CorrectLearnerMemoryRequestSchema,
  CreateLearnerMemoryRequestSchema,
  LearnerMemoriesResponseSchema,
  LearnerMemorySchema,
  type LearnerMemoriesResponse,
  type LearnerMemory,
} from '@algomemtor/shared-contracts'

import { requestJson } from '@/features/discovery/api/client'

import {
  LearnerMemoryActionSchema,
  type LearnerMemoryAction,
} from '../contracts'
import type { CorrectLearnerMemoryRequest } from '../contracts'
import type { CreateLearnerMemoryRequest } from '../contracts'

type AiMemoryWire = {
  id: unknown
  category: unknown
  statement: unknown
  confidence: unknown
  status: unknown
  evidenceIds: unknown
  createdAt: unknown
  updatedAt: unknown
}

export type MemoryActionResponse = {
  data: LearnerMemory | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function adaptAiMemory(value: unknown): LearnerMemory | null {
  if (!isRecord(value)) return null

  const direct = LearnerMemorySchema.safeParse(value)
  if (direct.success) return direct.data

  const wire = value as AiMemoryWire
  if (
    !Array.isArray(wire.evidenceIds) ||
    wire.evidenceIds.length === 0 ||
    !wire.evidenceIds.every((id) => typeof id === 'string')
  ) {
    return null
  }

  const adapted = LearnerMemorySchema.safeParse({
    id: wire.id,
    category: wire.category,
    text: wire.statement,
    confidence: wire.confidence,
    status: wire.status,
    version: 1,
    learnerCorrected: false,
    evidenceCount: wire.evidenceIds.length,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
  })

  return adapted.success ? adapted.data : null
}

function adaptMemoryList(value: unknown): LearnerMemoriesResponse | null {
  const direct = LearnerMemoriesResponseSchema.safeParse(value)
  if (direct.success) return direct.data

  if (!isRecord(value) || !Array.isArray(value.items)) return null
  const data = value.items.map(adaptAiMemory)
  if (data.some((memory) => memory === null)) return null

  const adapted = LearnerMemoriesResponseSchema.safeParse({
    data,
    meta: { pendingJobs: 0 },
  })
  return adapted.success ? adapted.data : null
}

function adaptMemoryAction(value: unknown): MemoryActionResponse | null {
  if (!isRecord(value)) return null

  const candidate = 'data' in value ? value.data : value.memory
  if (candidate === null) return { data: null }

  const memory = adaptAiMemory(candidate)
  return memory === null ? null : { data: memory }
}

const memoryListSchema = {
  safeParse(value: unknown) {
    const data = adaptMemoryList(value)
    return data === null
      ? {
          success: false as const,
          error: { issues: ['Invalid memory response'] },
        }
      : { success: true as const, data }
  },
}

const memoryActionSchema = {
  safeParse(value: unknown) {
    const data = adaptMemoryAction(value)
    return data === null
      ? {
          success: false as const,
          error: { issues: ['Invalid memory response'] },
        }
      : { success: true as const, data }
  },
}

export function fetchLearnerMemories({
  signal,
}: { signal?: AbortSignal } = {}) {
  return requestJson<LearnerMemoriesResponse>('/api/learner-memories', {
    authentication: 'required',
    schema: memoryListSchema,
    signal,
  })
}

export function createLearnerMemory(input: CreateLearnerMemoryRequest) {
  const validatedInput = CreateLearnerMemoryRequestSchema.parse(input)
  return requestJson<MemoryActionResponse>('/api/learner-memories', {
    authentication: 'required',
    body: JSON.stringify(validatedInput),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    schema: memoryActionSchema,
  })
}

export function actOnLearnerMemory(
  memoryId: string,
  action: LearnerMemoryAction,
) {
  const validatedAction = LearnerMemoryActionSchema.parse(action)
  return requestJson<MemoryActionResponse>(
    `/api/learner-memories/${encodeURIComponent(memoryId)}/action`,
    {
      authentication: 'required',
      body: JSON.stringify({ action: validatedAction }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      schema: memoryActionSchema,
    },
  )
}

export function correctLearnerMemory(
  memoryId: string,
  input: CorrectLearnerMemoryRequest,
) {
  const validatedInput = CorrectLearnerMemoryRequestSchema.parse(input)
  return requestJson<MemoryActionResponse>(
    `/api/learner-memories/${encodeURIComponent(memoryId)}`,
    {
      authentication: 'required',
      body: JSON.stringify(validatedInput),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
      schema: memoryActionSchema,
    },
  )
}
