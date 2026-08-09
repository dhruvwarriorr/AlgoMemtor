import type { AddressInfo } from 'node:net'

import {
  ApiErrorResponseSchema,
  ExternalProblemCatalogResponseSchema,
  ProvidersResponseSchema,
  TopicsResponseSchema,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider.js'

const payload = {
  status: 'OK',
  result: {
    problems: [
      {
        contestId: 100,
        index: 'A',
        name: 'Graph Problem',
        type: 'PROGRAMMING',
        rating: 1200,
        tags: ['graphs'],
      },
      {
        contestId: 200,
        index: 'B',
        name: 'Hard Strings',
        type: 'PROGRAMMING',
        rating: 1900,
        tags: ['strings'],
      },
    ],
    problemStatistics: [
      { contestId: 100, index: 'A', solvedCount: 5000 },
      { contestId: 200, index: 'B', solvedCount: 1000 },
    ],
  },
}

const servers: ReturnType<ReturnType<typeof createApp>['listen']>[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) =>
            error === undefined ? resolve() : reject(error),
          )
        }),
    ),
  )
})

const startApp = (provider: CodeforcesProvider) => {
  const server = createApp({ problemProvider: provider }).listen(0)
  servers.push(server)
  const address = server.address() as AddressInfo

  return `http://127.0.0.1:${address.port}`
}

describe('core catalog API', () => {
  it('serves the Week 5 catalog contract from mocked provider HTTP', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          headers: { 'content-type': 'application/json' },
        }),
    )
    const provider = new CodeforcesProvider({
      baseUrl: 'https://mock.codeforces.test/api',
      fetchImpl: fetchMock,
      minRequestIntervalMs: 0,
    })
    const baseUrl = startApp(provider)

    const response = await fetch(
      `${baseUrl}/api/problems?minRating=1000&maxRating=1300&page=1&pageSize=10`,
    )
    const catalog = ExternalProblemCatalogResponseSchema.parse(
      await response.json(),
    )

    expect(response.status).toBe(200)
    expect(catalog.data.map((problem) => problem.externalId)).toEqual(['100A'])
    expect(catalog.meta).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      partial: false,
      stale: false,
    })
    expect(catalog.meta.providers[0]).toMatchObject({
      provider: 'codeforces',
      availability: 'available',
    })

    const topics = TopicsResponseSchema.parse(
      await (await fetch(`${baseUrl}/api/topics`)).json(),
    )
    expect(topics.data.map((topic) => topic.slug)).toEqual([
      'graphs',
      'strings',
    ])

    const providers = ProvidersResponseSchema.parse(
      await (await fetch(`${baseUrl}/api/providers`)).json(),
    )
    expect(providers.data[0]?.freshness?.fetchedAt).toBeDefined()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('returns a validated 400 error for invalid catalog query parameters', async () => {
    const provider = new CodeforcesProvider({
      baseUrl: 'https://mock.codeforces.test/api',
      fetchImpl: vi.fn(),
      minRequestIntervalMs: 0,
    })
    const baseUrl = startApp(provider)
    const response = await fetch(
      `${baseUrl}/api/problems?minRating=1300&maxRating=1000`,
    )
    const error = ApiErrorResponseSchema.parse(await response.json())

    expect(response.status).toBe(400)
    expect(error.error.code).toBe('INVALID_QUERY_PARAMETERS')
  })

  it('maps provider failures to stable validated API errors', async () => {
    const provider = new CodeforcesProvider({
      baseUrl: 'https://mock.codeforces.test/api',
      fetchImpl: vi.fn(async () => new Response(null, { status: 429 })),
      maxAttempts: 3,
      minRequestIntervalMs: 0,
    })
    const baseUrl = startApp(provider)
    const response = await fetch(`${baseUrl}/api/problems`)
    const error = ApiErrorResponseSchema.parse(await response.json())

    expect(response.status).toBe(429)
    expect(error.error).toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      retryable: true,
      details: { provider: 'codeforces' },
    })
  })
})
