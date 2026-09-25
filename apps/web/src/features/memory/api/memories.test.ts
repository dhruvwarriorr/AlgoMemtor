import { afterEach, describe, expect, it, vi } from 'vitest'

const authenticatedFetchMock = vi.hoisted(() =>
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(),
)

vi.mock('@/features/auth/authenticated-fetch', () => ({
  authenticatedFetch: authenticatedFetchMock,
}))

import {
  actOnLearnerMemory,
  createLearnerMemory,
  correctLearnerMemory,
  fetchLearnerMemories,
} from './memories'

const memoryId = '00000000-0000-4000-8000-000000000020'
const learnerId = '00000000-0000-4000-8000-000000000021'
const evidenceId = '00000000-0000-4000-8000-000000000022'
const storedMemory = {
  id: memoryId,
  learnerId,
  category: 'preference',
  statement: 'The learner prefers short graph problems.',
  structuredValue: { topic: 'graphs' },
  confidence: 0.8,
  status: 'active',
  evidenceIds: [evidenceId],
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
}

function requestBody(init: RequestInit | undefined) {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected a serialized JSON request body.')
  }
  return JSON.parse(init.body) as unknown
}

afterEach(() => {
  authenticatedFetchMock.mockReset()
})

describe('memory API adapters', () => {
  it('sends learner-authored memory text to the core memory endpoint', async () => {
    authenticatedFetchMock.mockResolvedValue(
      Response.json({
        data: {
          id: memoryId,
          category: 'user_instruction',
          text: 'Prefer concise explanations.',
          confidence: 1,
          status: 'active',
          version: 1,
          learnerCorrected: false,
          evidenceCount: 1,
          createdAt: storedMemory.createdAt,
          updatedAt: storedMemory.updatedAt,
        },
      }),
    )

    await expect(
      createLearnerMemory({ text: 'Prefer concise explanations.' }),
    ).resolves.toMatchObject({
      data: {
        category: 'user_instruction',
        status: 'active',
        text: 'Prefer concise explanations.',
      },
    })
    expect(authenticatedFetchMock.mock.calls[0]?.[0]).toBe(
      '/api/learner-memories',
    )
    expect(requestBody(authenticatedFetchMock.mock.calls[0]?.[1])).toEqual({
      text: 'Prefer concise explanations.',
    })
  })

  it('maps the AI retrieval shape to the shared learner-memory shape', async () => {
    authenticatedFetchMock.mockResolvedValue(
      Response.json({
        learnerId,
        query: null,
        retrievalMode: 'sql',
        items: [storedMemory],
      }),
    )

    await expect(fetchLearnerMemories()).resolves.toEqual({
      data: [
        {
          id: memoryId,
          category: 'preference',
          text: storedMemory.statement,
          confidence: 0.8,
          status: 'active',
          version: 1,
          learnerCorrected: false,
          evidenceCount: 1,
          createdAt: storedMemory.createdAt,
          updatedAt: storedMemory.updatedAt,
        },
      ],
      meta: { pendingJobs: 0 },
    })
    expect(authenticatedFetchMock.mock.calls[0]?.[0]).toBe(
      '/api/learner-memories',
    )
  })

  it('adapts AI memory actions while keeping the web request on its core proxy', async () => {
    authenticatedFetchMock.mockResolvedValue(
      Response.json({
        requestId: 'memory_action_1',
        action: 'archive',
        memory: { ...storedMemory, status: 'archived' },
      }),
    )

    await expect(actOnLearnerMemory(memoryId, 'archive')).resolves.toEqual({
      data: {
        id: memoryId,
        category: 'preference',
        text: storedMemory.statement,
        confidence: 0.8,
        status: 'archived',
        version: 1,
        learnerCorrected: false,
        evidenceCount: 1,
        createdAt: storedMemory.createdAt,
        updatedAt: storedMemory.updatedAt,
      },
    })
    expect(authenticatedFetchMock.mock.calls[0]?.[0]).toBe(
      `/api/learner-memories/${memoryId}/action`,
    )
    expect(requestBody(authenticatedFetchMock.mock.calls[0]?.[1])).toEqual({
      action: 'archive',
    })
  })

  it('sends corrections in the shared text/category request shape', async () => {
    authenticatedFetchMock.mockResolvedValue(
      Response.json({
        data: {
          id: memoryId,
          category: 'topic_weakness',
          text: 'The learner wants more graph practice.',
          confidence: 0.9,
          status: 'active',
          version: 2,
          supersedesMemoryId: memoryId,
          learnerCorrected: true,
          evidenceCount: 1,
          createdAt: storedMemory.createdAt,
          updatedAt: '2026-09-13T00:01:00.000Z',
        },
      }),
    )

    await correctLearnerMemory(memoryId, {
      text: 'The learner wants more graph practice.',
      category: 'topic_weakness',
    })
    expect(authenticatedFetchMock.mock.calls[0]?.[0]).toBe(
      `/api/learner-memories/${memoryId}`,
    )
    expect(requestBody(authenticatedFetchMock.mock.calls[0]?.[1])).toEqual({
      text: 'The learner wants more graph practice.',
      category: 'topic_weakness',
    })
  })
})
