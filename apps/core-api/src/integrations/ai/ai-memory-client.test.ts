import { afterEach, describe, expect, it, vi } from 'vitest'

import { HttpAiMemoryClient } from './ai-memory-client.js'

const learnerId = '00000000-0000-4000-8000-000000000001'
const memoryId = '00000000-0000-4000-8000-000000000002'
const evidenceId = '00000000-0000-4000-8000-000000000003'

const memory = {
  id: memoryId,
  learnerId,
  category: 'preference',
  statement: 'The learner prefers graph practice.',
  structuredValue: {},
  confidence: 0.9,
  status: 'active',
  evidenceIds: [evidenceId],
  version: 1,
  supersedesMemoryId: null,
  learnerCorrected: false,
  similarity: null,
  createdAt: '2026-09-18T03:33:09.321059Z',
  updatedAt: '2026-09-18T03:33:09.321059Z',
}

const client = () =>
  new HttpAiMemoryClient({
    baseUrl: 'https://ai.example.com',
    internalServiceToken: 'test-token',
  })

afterEach(() => vi.unstubAllGlobals())

describe('HTTP AI memory client', () => {
  it('accepts the nullable fields returned by a saved memory', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([memory])),
    )

    const records = await client().listMemories(learnerId)

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: memoryId,
      learnerId,
      evidenceIds: [evidenceId],
    })
    expect(records[0]?.supersedesMemoryId).toBeUndefined()
    expect(records[0]?.similarity).toBeUndefined()
  })

  it('accepts omitted optional fields in retrieved memories', async () => {
    const {
      supersedesMemoryId: _supersedes,
      similarity: _similarity,
      ...item
    } = memory
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ items: [item] })),
    )

    await expect(
      client().retrieveMemories(learnerId, 'graphs'),
    ).resolves.toHaveLength(1)
  })

  it('accepts a delete response without a memory or audit ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          requestId: 'delete-request',
          action: 'delete',
          idempotent: false,
          memory: null,
          auditId: null,
        }),
      ),
    )

    const response = await client().actOnMemory(learnerId, memoryId, 'delete')

    expect(response.memory).toBeUndefined()
    expect(response.auditId).toBeUndefined()
  })

  it('still rejects unknown memory fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([{ ...memory, unexpected: true }])),
    )

    await expect(client().listMemories(learnerId)).rejects.toMatchObject({
      code: 'AI_MEMORY_INVALID_RESPONSE',
    })
  })
})
