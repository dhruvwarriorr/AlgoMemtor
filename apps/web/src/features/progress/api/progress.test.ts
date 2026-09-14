import { afterEach, describe, expect, it, vi } from 'vitest'

const authenticatedFetchMock = vi.hoisted(() =>
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(),
)

vi.mock('@/features/auth/authenticated-fetch', () => ({
  authenticatedFetch: authenticatedFetchMock,
}))

import {
  deleteAllData,
  fetchDeleteAllDataStatus,
  removeBookmark,
  recordProblemAction,
  setProblemStatus,
} from './progress'

const problem = { provider: 'codeforces' as const, externalId: '100A' }

function parseBody(init?: RequestInit): unknown {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected a JSON request body')
  }
  return JSON.parse(init.body) as unknown
}

const progressResponse = {
  data: {
    problem,
    status: 'attempted',
    bookmarked: false,
    focusedSeconds: 0,
  },
}

afterEach(() => {
  authenticatedFetchMock.mockReset()
})

describe('progress API client', () => {
  it('uses the typed status route and request shape', async () => {
    authenticatedFetchMock.mockResolvedValue(Response.json(progressResponse))

    await setProblemStatus(problem, { status: 'attempted' })

    const [input, init] = authenticatedFetchMock.mock.calls[0] ?? []
    expect(input).toBe('/api/problems/codeforces/100A/status')
    expect(init?.method).toBe('PUT')
    expect(parseBody(init)).toEqual({ status: 'attempted' })
  })

  it('tracks impressions and opens on their distinct non-blocking routes', async () => {
    authenticatedFetchMock.mockImplementation(() =>
      Promise.resolve(
        Response.json({ data: { recorded: true, actionId: 'action-1' } }),
      ),
    )

    await recordProblemAction({
      actionType: 'impression',
      problem,
      recommendationItemId: '00000000-0000-4000-8000-000000000011',
    })
    await recordProblemAction({
      actionType: 'opened',
      problem,
      sourceContext: 'catalog',
    })

    expect(authenticatedFetchMock.mock.calls[0]?.[0]).toBe(
      '/api/recommendation-items/00000000-0000-4000-8000-000000000011/impression',
    )
    expect(authenticatedFetchMock.mock.calls[1]?.[0]).toBe(
      '/api/problems/codeforces/100A/open',
    )
    expect(parseBody(authenticatedFetchMock.mock.calls[1]?.[1])).toEqual({
      sourceContext: 'catalog',
    })
    expect(authenticatedFetchMock.mock.calls[1]?.[1]?.keepalive).toBe(true)
  })

  it('accepts provider 204 deletes and sends typed data-reset confirmation', async () => {
    authenticatedFetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    )
    await expect(removeBookmark(problem)).resolves.toBeUndefined()

    authenticatedFetchMock.mockResolvedValueOnce(
      Response.json(
        {
          data: {
            status: 'pending',
            jobId: '00000000-0000-4000-8000-000000000012',
          },
        },
        { status: 202 },
      ),
    )
    await deleteAllData({ confirmation: 'DELETE' })

    expect(authenticatedFetchMock.mock.calls[1]?.[0]).toBe('/api/me/data')
    expect(authenticatedFetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE')
    expect(parseBody(authenticatedFetchMock.mock.calls[1]?.[1])).toEqual({
      confirmation: 'DELETE',
    })

    authenticatedFetchMock.mockResolvedValueOnce(
      Response.json({ data: { status: 'completed' } }),
    )
    await expect(fetchDeleteAllDataStatus()).resolves.toEqual({
      data: { status: 'completed' },
    })
    expect(authenticatedFetchMock.mock.calls[2]?.[0]).toBe(
      '/api/me/data/status',
    )
  })
})
