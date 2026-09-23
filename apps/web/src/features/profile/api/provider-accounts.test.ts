import { afterEach, describe, expect, it, vi } from 'vitest'

const authenticatedFetchMock = vi.hoisted(() =>
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(),
)

vi.mock('@/features/auth/authenticated-fetch', () => ({
  authenticatedFetch: authenticatedFetchMock,
}))

import { ApiClientError } from '@/features/discovery/api/client'

import {
  checkProviderVerification,
  disconnectProviderAccount,
  fetchProviderAccounts,
  linkProviderAccount,
  refreshProviderPublicStats,
  setProviderActivityConsent,
  startProviderVerification,
  syncProviderActivity,
} from './provider-accounts'

const account = {
  provider: 'codeforces' as const,
  handle: 'tourist',
  profileUrl: 'https://codeforces.com/profile/tourist',
  consentScope: 'store_public_profile_reference' as const,
  verification: 'not_verified' as const,
  activityAccess: 'not_enabled' as const,
  verifiedActivity: { enabled: false, status: 'not_enabled' as const },
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

  it('enables consented Codeforces activity and requests a manual sync', async () => {
    const consented = {
      ...account,
      verifiedActivity: {
        enabled: true,
        status: 'not_synced' as const,
        consentedAt: '2026-08-27T12:01:00.000Z',
      },
    }
    authenticatedFetchMock.mockResolvedValueOnce(
      Response.json({ data: consented }),
    )
    await expect(
      setProviderActivityConsent('codeforces', {
        enabled: true,
        policyVersion: 'codeforces-public-activity-v1',
      }),
    ).resolves.toEqual({ data: consented })
    const [consentUrl, consentInit] = authenticatedFetchMock.mock.calls[0] ?? []
    expect(consentUrl).toBe(
      '/api/provider-accounts/codeforces/activity-consent',
    )
    expect(parseRequestBody(consentInit)).toEqual({
      enabled: true,
      policyVersion: 'codeforces-public-activity-v1',
    })

    const sync = {
      data: {
        provider: 'codeforces' as const,
        discovered: 2,
        added: 1,
        confirmedSolved: 1,
        complete: true,
        syncedAt: '2026-08-27T12:02:00.000Z',
        nextAllowedAt: '2026-08-27T12:17:00.000Z',
      },
    }
    authenticatedFetchMock.mockResolvedValueOnce(Response.json(sync))
    await expect(syncProviderActivity('codeforces')).resolves.toEqual(sync)
    expect(authenticatedFetchMock).toHaveBeenLastCalledWith(
      '/api/provider-accounts/codeforces/activity-sync',
      expect.objectContaining({ method: 'POST' }),
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

  it('starts and checks handle ownership verification', async () => {
    const challenged = {
      ...account,
      verificationChallenge: {
        code: 'AM-ABCD2345',
        expiresAt: '2026-08-27T12:30:00.000Z',
      },
    }
    const verified = {
      ...account,
      verification: 'verified' as const,
      verifiedAt: '2026-08-27T12:05:00.000Z',
    }
    authenticatedFetchMock
      .mockResolvedValueOnce(Response.json({ data: challenged }))
      .mockResolvedValueOnce(Response.json({ data: verified }))

    await expect(startProviderVerification('codeforces')).resolves.toEqual({
      data: challenged,
    })
    await expect(checkProviderVerification('codeforces')).resolves.toEqual({
      data: verified,
    })
    expect(authenticatedFetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/provider-accounts/codeforces/verification',
      '/api/provider-accounts/codeforces/verification/check',
    ])
  })

  it('surfaces the server message when the code is not on the profile', async () => {
    authenticatedFetchMock.mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'PROVIDER_VERIFICATION_CODE_NOT_FOUND',
            message: 'The code is not on your public profile yet.',
            retryable: true,
          },
        },
        { status: 422 },
      ),
    )

    await expect(checkProviderVerification('codeforces')).rejects.toMatchObject(
      {
        code: 'PROVIDER_VERIFICATION_CODE_NOT_FOUND',
        message: 'The code is not on your public profile yet.',
      },
    )
  })
})
