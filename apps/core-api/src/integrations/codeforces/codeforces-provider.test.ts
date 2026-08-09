import { describe, expect, it, vi } from 'vitest'

import { ProviderError } from '../../errors/provider-error.js'
import type { StructuredLogger } from '../../utils/structured-logger.js'
import { CodeforcesProvider } from './codeforces-provider.js'

const validPayload = {
  status: 'OK',
  result: {
    problems: [
      {
        contestId: 4,
        index: 'A',
        name: 'Watermelon',
        type: 'PROGRAMMING',
        rating: 800,
        tags: ['brute force', 'math'],
      },
      {
        contestId: 20,
        index: 'C',
        name: 'Dijkstra?',
        type: 'PROGRAMMING',
        rating: 1600,
        tags: ['graphs', 'shortest paths'],
      },
      {
        contestId: 30,
        index: 'B',
        name: 'Unrated',
        type: 'PROGRAMMING',
        tags: ['strings'],
      },
    ],
    problemStatistics: [
      { contestId: 4, index: 'A', solvedCount: 300_000 },
      { contestId: 20, index: 'C', solvedCount: 25_000 },
      { contestId: 30, index: 'B', solvedCount: 10_000 },
    ],
  },
} as const

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const createLogger = () => {
  const info = vi.fn()
  const warn = vi.fn()
  const error = vi.fn()
  const logger: StructuredLogger = { info, warn, error }

  return { logger, info, warn, error }
}

const createProvider = (
  fetchImpl: typeof fetch,
  overrides: ConstructorParameters<typeof CodeforcesProvider>[0] = {},
) =>
  new CodeforcesProvider({
    baseUrl: 'https://mock.codeforces.test/api',
    cacheTtlMs: 1000,
    timeoutMs: 100,
    maxAttempts: 1,
    minRequestIntervalMs: 0,
    retryBaseDelayMs: 0,
    fetchImpl,
    logger: createLogger().logger,
    ...overrides,
  })

describe('CodeforcesProvider', () => {
  it('validates, normalizes, joins statistics, and constructs safe URLs', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(validPayload),
    )
    const provider = createProvider(fetchMock)

    const result = await provider.search({})

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://mock.codeforces.test/api/problemset.problems',
    )
    expect(result.problems[0]).toMatchObject({
      provider: 'codeforces',
      externalId: '4A',
      title: 'Watermelon',
      canonicalUrl: 'https://codeforces.com/problemset/problem/4/A',
      providerDifficulty: 800,
      normalizedDifficulty: 'easy',
      providerTags: ['brute force', 'math'],
      topics: ['brute-force', 'math'],
      solvedCount: 300_000,
    })
    expect(result.problems[1]?.normalizedDifficulty).toBe('medium')
    expect(result.freshness).toMatchObject({
      provider: 'codeforces',
      availability: 'available',
      stale: false,
    })
  })

  it('applies server-side filters and excludes unrated records for rating bounds', async () => {
    const provider = createProvider(
      vi.fn(async () => jsonResponse(validPayload)),
    )

    const result = await provider.search({
      search: 'shortest',
      topic: 'graphs',
      difficulty: 'medium',
      minRating: 1500,
      maxRating: 1700,
    })

    expect(result.problems.map((problem) => problem.externalId)).toEqual([
      '20C',
    ])
    expect((await provider.search({ minRating: 0 })).problems).toHaveLength(2)
  })

  it('rejects malformed records individually and returns valid partial data', async () => {
    const payload = {
      status: 'OK',
      result: {
        problems: [validPayload.result.problems[0], { contestId: 1 }],
        problemStatistics: [
          validPayload.result.problemStatistics[0],
          { contestId: 1, index: 'A', solvedCount: -1 },
        ],
      },
    }
    const provider = createProvider(vi.fn(async () => jsonResponse(payload)))

    const result = await provider.search({})

    expect(result.problems).toHaveLength(1)
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'INVALID_PROVIDER_RECORDS' }),
    ])
    expect(result.freshness.availability).toBe('degraded')
  })

  it('labels valid records without a safe contest URL as unsupported', async () => {
    const provider = createProvider(
      vi.fn(async () =>
        jsonResponse({
          status: 'OK',
          result: {
            problems: [
              validPayload.result.problems[0],
              {
                problemsetName: 'acmsguru',
                index: '100',
                name: 'Custom problem',
                type: 'PROGRAMMING',
                tags: ['math'],
              },
            ],
            problemStatistics: validPayload.result.problemStatistics,
          },
        }),
      ),
    )

    const result = await provider.search({})

    expect(result.problems).toHaveLength(1)
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'UNSUPPORTED_PROVIDER_RECORDS' }),
    ])
    expect(result.freshness.availability).toBe('degraded')
  })

  it('rejects an unusable provider result instead of caching an empty catalog', async () => {
    const provider = createProvider(
      vi.fn(async () =>
        jsonResponse({
          status: 'OK',
          result: {
            problems: [{ unexpected: true }],
            problemStatistics: [],
          },
        }),
      ),
    )

    await expect(provider.search({})).rejects.toMatchObject({
      code: 'PROVIDER_INVALID_RESPONSE',
      retryable: false,
    })
  })

  it('classifies HTTP and envelope rate limits without retrying', async () => {
    for (const response of [
      jsonResponse({ error: true }, 429),
      jsonResponse({ status: 'FAILED', comment: 'Call limit exceeded' }),
    ]) {
      const fetchMock = vi.fn(async () => response.clone())
      const provider = createProvider(fetchMock, { maxAttempts: 3 })

      await expect(provider.search({})).rejects.toMatchObject({
        code: 'PROVIDER_RATE_LIMITED',
        retryable: true,
      })
      expect(fetchMock).toHaveBeenCalledOnce()
    }
  })

  it('classifies timeouts with a stable retryable error', async () => {
    const fetchMock: typeof fetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })
    const provider = createProvider(fetchMock, { timeoutMs: 5 })

    await expect(provider.search({})).rejects.toEqual(
      expect.objectContaining<Partial<ProviderError>>({
        code: 'PROVIDER_TIMEOUT',
        retryable: true,
      }),
    )
  })

  it('retries retryable unavailability and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse(validPayload))
    const provider = createProvider(fetchMock, {
      maxAttempts: 2,
      sleep: async () => undefined,
    })

    await expect(provider.search({})).resolves.toMatchObject({
      problems: expect.any(Array),
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses the TTL cache and enforces the provider request interval after expiry', async () => {
    let now = 0
    const waits: number[] = []
    const fetchMock = vi.fn(async () => jsonResponse(validPayload))
    const provider = createProvider(fetchMock, {
      now: () => now,
      cacheTtlMs: 1000,
      minRequestIntervalMs: 2100,
      sleep: async (milliseconds) => {
        waits.push(milliseconds)
        now += milliseconds
      },
    })

    await provider.search({})
    await provider.search({ topic: 'math' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

    now = 1001
    await provider.search({})

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(waits).toContain(1099)
  })

  it('deduplicates concurrent cache refreshes', async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    const provider = createProvider(fetchMock)
    const first = provider.search({})
    const second = provider.search({ topic: 'math' })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    resolveResponse?.(jsonResponse(validPayload))

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult.problems).toHaveLength(3)
    expect(secondResult.problems).toHaveLength(1)
  })

  it('returns explicitly stale cached metadata after a refresh failure', async () => {
    let now = 0
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(validPayload))
      .mockRejectedValueOnce(new TypeError('network unavailable'))
    const provider = createProvider(fetchMock, {
      now: () => now,
      cacheTtlMs: 100,
    })

    await provider.search({})
    now = 101
    const stale = await provider.search({})

    expect(stale.problems).toHaveLength(3)
    expect(stale.freshness).toMatchObject({
      availability: 'degraded',
      stale: true,
      lastErrorCode: 'PROVIDER_UNAVAILABLE',
    })
    expect(stale.warnings).toEqual([
      expect.objectContaining({ code: 'STALE_DATA' }),
    ])

    const cooldownResult = await provider.search({ topic: 'graphs' })
    expect(cooldownResult.freshness.stale).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns the same stale fallback to concurrent deduplicated callers', async () => {
    let now = 0
    let rejectRefresh: ((error: Error) => void) | undefined
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(validPayload))
      .mockImplementationOnce(
        async () =>
          new Promise<Response>((_resolve, reject) => {
            rejectRefresh = reject
          }),
      )
    const provider = createProvider(fetchMock, {
      now: () => now,
      cacheTtlMs: 100,
    })

    await provider.search({})
    now = 101
    const first = provider.search({})
    const second = provider.search({ topic: 'graphs' })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    rejectRefresh?.(new TypeError('network unavailable'))

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult.freshness.stale).toBe(true)
    expect(secondResult.freshness.stale).toBe(true)
    expect(secondResult.problems).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('logs only safe metadata and never logs raw provider payloads', async () => {
    const { logger, info, warn, error } = createLogger()
    const provider = createProvider(
      vi.fn(async () =>
        jsonResponse({ secret: 'must-not-be-logged', payload: validPayload }),
      ),
      { logger },
    )

    await expect(
      provider.search({}, { requestId: 'request_123' }),
    ).rejects.toBeInstanceOf(ProviderError)

    const logged = JSON.stringify([
      ...info.mock.calls,
      ...warn.mock.calls,
      ...error.mock.calls,
    ])
    expect(logged).not.toContain('must-not-be-logged')
    expect(logged).toContain('PROVIDER_INVALID_RESPONSE')
    expect(logged).toContain('request_123')
  })
})
