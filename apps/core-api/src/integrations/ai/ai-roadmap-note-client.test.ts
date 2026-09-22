import { describe, expect, it, vi } from 'vitest'

import {
  AiRoadmapNoteClientError,
  AiRoadmapNoteRequestSchema,
  HttpAiRoadmapNoteClient,
  UnavailableAiRoadmapNoteClient,
} from './ai-roadmap-note-client.js'

const request = AiRoadmapNoteRequestSchema.parse({
  topics: [
    { slug: 'sliding-window', name: 'Sliding Window', currentStatus: null },
    { slug: 'arrays', name: 'Arrays', currentStatus: 'working_on' },
  ],
  note: "I'm pretty good at sliding window now.",
})

const successPayload = {
  topic: 'sliding-window',
  status: 'practiced',
  rationale: 'Learner reports comfort with the topic.',
}

describe('HTTP AI roadmap-note client', () => {
  it('sends the strict internal request and accepts a valid response', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Response.json(successPayload),
    )
    const client = new HttpAiRoadmapNoteClient({
      baseUrl: 'https://ai.example.com/base',
      internalServiceToken: 'shared-secret',
      fetchImplementation,
    })

    await expect(client.classify(request)).resolves.toEqual(successPayload)
    expect(fetchImplementation).toHaveBeenCalledOnce()
    const [url, init] = fetchImplementation.mock.calls[0] ?? []
    expect(String(url)).toBe('https://ai.example.com/internal/coach/roadmap-note')
    expect(init).toMatchObject({ method: 'POST' })
    expect(new Headers(init?.headers).get('x-internal-service-token')).toBe(
      'shared-secret',
    )
    expect(JSON.parse(String(init?.body))).toEqual(request)
  })

  it('accepts a null topic with a no_change status', async () => {
    const client = new HttpAiRoadmapNoteClient({
      baseUrl: 'https://ai.example.com',
      internalServiceToken: 'shared-secret',
      fetchImplementation: vi.fn<typeof fetch>(async () =>
        Response.json({ topic: null, status: 'no_change', rationale: 'Unclear intent.' }),
      ),
    })

    await expect(client.classify(request)).resolves.toEqual({
      topic: null,
      status: 'no_change',
      rationale: 'Unclear intent.',
    })
  })

  it.each([
    { ...successPayload, status: 'not-a-status' },
    { ...successPayload, extra: 'not allowed' },
    { rationale: 'Missing status.' },
  ])('rejects a malformed response as a whole', async (payload) => {
    const client = new HttpAiRoadmapNoteClient({
      baseUrl: 'https://ai.example.com',
      internalServiceToken: 'shared-secret',
      fetchImplementation: vi.fn<typeof fetch>(async () =>
        Response.json(payload),
      ),
    })

    await expect(client.classify(request)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    })
  })

  it('does not retry unavailable responses', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Response.json({ error: 'unavailable' }, { status: 503 }),
    )
    const client = new HttpAiRoadmapNoteClient({
      baseUrl: 'https://ai.example.com',
      internalServiceToken: 'shared-secret',
      fetchImplementation,
    })

    await expect(client.classify(request)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    })
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it.each([
    ['timeout', 'AI_TIMEOUT'],
    ['caller cancellation', 'AI_CANCELLED'],
  ] as const)('%s aborts the request', async (kind, expectedCode) => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
          if (init?.signal?.aborted) {
            reject(init.signal.reason)
          }
        }),
    )
    const client = new HttpAiRoadmapNoteClient({
      baseUrl: 'https://ai.example.com',
      internalServiceToken: 'shared-secret',
      timeoutMs: 5,
      fetchImplementation,
    })
    const controller = new AbortController()
    if (kind === 'caller cancellation') {
      controller.abort(new Error('cancelled'))
    }

    await expect(client.classify(request, controller.signal)).rejects.toEqual(
      expect.objectContaining<Partial<AiRoadmapNoteClientError>>({
        code: expectedCode,
      }),
    )
  })
})

describe('Unavailable AI roadmap-note client', () => {
  it('returns a graceful no_change fallback', async () => {
    const client = new UnavailableAiRoadmapNoteClient()

    await expect(client.classify()).resolves.toEqual({
      topic: null,
      status: 'no_change',
      rationale: expect.stringContaining('unavailable'),
    })
  })
})
