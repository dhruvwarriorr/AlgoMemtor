import { afterEach, describe, expect, it, vi } from 'vitest'

const authenticatedFetchMock = vi.hoisted(() =>
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(),
)

vi.mock('@/features/auth/authenticated-fetch', () => ({
  authenticatedFetch: authenticatedFetchMock,
}))

import { ApiClientError } from '@/features/discovery/api/client'

import {
  disconnectProviderAccount,
  fetchProviderAccounts,
  linkProviderAccount,
  refreshProviderPublicStats,
} from './provider-accounts'

const account = {
  provider: 'codeforces' as const,
  handle: 'tourist',
  profileUrl: 'https://codeforces.com/profile/tourist',
  consentScope: 'store_public_profile_reference' as const,
  verification: 'not_verified' as const,
  activityAccess: 'not_enabled' as const,
  publicStats: { status: 'not_synced' as const },
  linkedAt: '2026-08-27T12:00:00.000Z',
  updatedAt: '2026-08-27T12:00:00.000Z',
}

afterEach(() => {
  authenticatedFetchMock.mockReset()
})

function parseRequestBody(init: RequestInit | undefined) {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected a serialized JSON request body.')
  }

  return JSON.parse(init.body) as unknown
}

describe('provider account API', () => {
  it('loads linked accounts through the authenticated client', async () => {
    authenticatedFetchMock.mockResolvedValue(Response.json({ data: [account] }))

    await expect(fetchProviderAccounts()).resolves.toEqual({ data: [account] })
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      '/api/provider-accounts',
      expect.objectContaining({ signal: undefined }),
    )
  })

  it('links a public handle with explicit consent', async () => {
    authenticatedFetchMock.mockResolvedValue(Response.json({ data: account }))

    await expect(
      linkProviderAccount('codeforces', {
        handle: 'tourist',
        consent: true,
      }),
    ).resolves.toEqual({ data: account })

    const [url, init] = authenticatedFetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/provider-accounts/codeforces')
    expect(init).toMatchObject({ method: 'PUT' })
    expect(parseRequestBody(init)).toEqual({
      handle: 'tourist',
      consent: true,
    })
  })

  it('refreshes public solved data with a separate consent request', async () => {
    const refreshedAccount = {
      ...account,
      activityAccess: 'public_solved_count',
      publicStatsConsentAt: '2026-08-27T12:01:00.000Z',
      publicStats: {
        status: 'available',
        solvedCount: 100,
        complete: true,
        source: 'codeforces_api',
        fetchedAt: '2026-08-27T12:01:00.000Z',
        stale: false,
      },
      updatedAt: '2026-08-27T12:01:00.000Z',
    } as const
    authenticatedFetchMock.mockResolvedValue(
      Response.json({ data: refreshedAccount }),
    )

    await expect(refreshProviderPublicStats('codeforces')).resolves.toEqual({
      data: refreshedAccount,
    })

    const [url, init] = authenticatedFetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/provider-accounts/codeforces/public-stats/refresh')
    expect(init).toMatchObject({ method: 'POST' })
    expect(parseRequestBody(init)).toEqual({ consent: true })
  })

  it('disconnects the linked account and all associated public data', async () => {
    authenticatedFetchMock.mockResolvedValue(
      Response.json({ data: { provider: 'codeforces' } }),
    )

    await expect(disconnectProviderAccount('codeforces')).resolves.toEqual({
      data: { provider: 'codeforces' },
    })
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      '/api/provider-accounts/codeforces',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('rejects malformed successful responses', async () => {
    authenticatedFetchMock.mockResolvedValue(
      Response.json({ data: [{ provider: 'codeforces' }] }),
    )

    try {
      await fetchProviderAccounts()
      expect.unreachable('Expected the malformed response to be rejected.')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError)
      expect(error).toMatchObject({ code: 'INVALID_RESPONSE' })
    }
  })
})
