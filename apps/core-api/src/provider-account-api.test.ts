import type { AddressInfo } from 'node:net'

import {
  ApiErrorResponseSchema,
  ProviderAccountResponseSchema,
  ProviderAccountsResponseSchema,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider.js'
import {
  ProviderPublicStatsError,
  type ProviderVerifiedActivityFetcher,
  type ProviderPublicStatsFetcher,
} from './integrations/provider-accounts/provider-public-stats.js'
import { InMemoryProviderAccountRepository } from './repositories/provider-account-repository.js'

const firstSubject = '00000000-0000-4000-8000-000000000001'
const secondSubject = '00000000-0000-4000-8000-000000000002'
const firstAuthorization = { authorization: 'Bearer first-access-token' }
const secondAuthorization = { authorization: 'Bearer second-access-token' }

const jwtVerifier: SupabaseJwtVerifier = async (token) => ({
  subject: token === 'second-access-token' ? secondSubject : firstSubject,
  claims: { role: 'authenticated' },
})

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

function startApp(
  providerPublicStatsFetchers?: readonly ProviderPublicStatsFetcher[],
  providerVerifiedActivityFetchers?: readonly ProviderVerifiedActivityFetcher[],
  providerAccountRepository = new InMemoryProviderAccountRepository(
    () => new Date('2026-08-27T12:00:00.000Z'),
  ),
) {
  const provider = new CodeforcesProvider({
    baseUrl: 'https://mock.codeforces.test/api',
    fetchImpl: vi.fn(),
    minRequestIntervalMs: 0,
  })
  const server = createApp({
    jwtVerifier,
    problemProvider: provider,
    providerAccountRepository,
    ...(providerPublicStatsFetchers === undefined
      ? {}
      : { providerPublicStatsFetchers }),
    ...(providerVerifiedActivityFetchers === undefined
      ? {}
      : { providerVerifiedActivityFetchers }),
  }).listen(0)
  servers.push(server)

  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function saveAccount(
  baseUrl: string,
  provider: string,
  body: unknown,
  headers: Record<string, string> = firstAuthorization,
) {
  return fetch(`${baseUrl}/api/provider-accounts/${provider}`, {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function refreshStats(
  baseUrl: string,
  provider: string,
  body: unknown = { consent: true },
  headers: Record<string, string> = firstAuthorization,
) {
  return fetch(
    `${baseUrl}/api/provider-accounts/${provider}/public-stats/refresh`,
    {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

describe('provider account API', () => {
  it('restores consent on manual sync without inventing fetched statistics', async () => {
    const repository = new InMemoryProviderAccountRepository()
    const baseUrl = startApp([], [], repository)
    await saveAccount(baseUrl, 'codeforces', {
      handle: 'tourist',
      consent: true,
    })
    const account = await repository.findByAuthUserIdAndProvider(
      firstSubject,
      'codeforces',
    )
    expect(account).not.toBeNull()
    if (account === null) return
    account.publicStatsConsentAt = null

    const response = await fetch(
      `${baseUrl}/api/provider-accounts/codeforces/sync`,
      { method: 'POST', headers: firstAuthorization },
    )
    const repaired = await repository.findByAuthUserIdAndProvider(
      firstSubject,
      'codeforces',
    )

    expect(response.status).toBe(202)
    expect(repaired?.publicStatsConsentAt).toBeInstanceOf(Date)
    expect(repaired).toMatchObject({
      solvedCount: null,
      statsSource: null,
      statsFetchedAt: null,
      statsAttemptedAt: null,
    })
  })

  it('requires activity consent and exposes idempotent Codeforces activity sync', async () => {
    const fetchVerifiedActivity = vi.fn(async () => ({
      events: [
        {
          externalId: '1A',
          providerEventId: '100',
          occurredAt: new Date('2026-08-27T11:00:00.000Z'),
        },
      ],
      complete: true,
      fetchedAt: new Date('2026-08-27T12:00:00.000Z'),
    }))
    const fetcher = {
      provider: 'codeforces' as const,
      fetchSolvedCount: async () => ({
        solvedCount: 0,
        complete: true,
        source: 'codeforces_api' as const,
        fetchedAt: new Date('2026-08-27T12:00:00.000Z'),
      }),
      fetchVerifiedActivity,
    }
    const baseUrl = startApp([fetcher], [fetcher])
    await saveAccount(baseUrl, 'codeforces', {
      handle: 'tourist',
      consent: true,
    })

    const missingConsent = await fetch(
      `${baseUrl}/api/provider-accounts/codeforces/activity-sync`,
      { method: 'POST', headers: firstAuthorization },
    )
    expect(missingConsent.status).toBe(400)
    expect(
      ApiErrorResponseSchema.parse(await missingConsent.json()).error.code,
    ).toBe('PROVIDER_ACTIVITY_CONSENT_REQUIRED')

    const consentResponse = await fetch(
      `${baseUrl}/api/provider-accounts/codeforces/activity-consent`,
      {
        method: 'PUT',
        headers: { ...firstAuthorization, 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          policyVersion: 'codeforces-public-activity-v1',
        }),
      },
    )
    expect(consentResponse.status).toBe(200)
    expect(
      ProviderAccountResponseSchema.parse(await consentResponse.json()).data
        .verifiedActivity,
    ).toMatchObject({ enabled: true, status: 'not_synced' })

    const syncResponse = await fetch(
      `${baseUrl}/api/provider-accounts/codeforces/activity-sync`,
      { method: 'POST', headers: firstAuthorization },
    )
    expect(syncResponse.status).toBe(200)
    expect(await syncResponse.json()).toMatchObject({
      data: {
        provider: 'codeforces',
        discovered: 1,
        added: 1,
        confirmedSolved: 1,
        complete: true,
      },
    })
    expect(fetchVerifiedActivity).toHaveBeenCalledTimes(1)

    const progress = await fetch(
      `${baseUrl}/api/problems/codeforces/1A/progress`,
      { headers: firstAuthorization },
    )
    expect((await progress.json()).data).toMatchObject({
      status: 'solved',
      evidenceSource: 'provider_verified',
      evidence: {
        provider: 'codeforces',
        occurredAt: '2026-08-27T11:00:00.000Z',
      },
    })

    const cooldown = await fetch(
      `${baseUrl}/api/provider-accounts/codeforces/activity-sync`,
      { method: 'POST', headers: firstAuthorization },
    )
    expect(cooldown.status).toBe(429)
    expect(
      ApiErrorResponseSchema.parse(await cooldown.json()).error,
    ).toMatchObject({ code: 'PROVIDER_ACTIVITY_COOLDOWN' })
  })

  it('requires authentication for every account operation', async () => {
    const baseUrl = startApp()
    const getResponse = await fetch(`${baseUrl}/api/provider-accounts`)
    const putResponse = await saveAccount(
      baseUrl,
      'codeforces',
      { handle: 'tourist', consent: true },
      {},
    )
    const deleteResponse = await fetch(
      `${baseUrl}/api/provider-accounts/codeforces`,
      { method: 'DELETE' },
    )
    const refreshResponse = await refreshStats(
      baseUrl,
      'codeforces',
      { consent: true },
      {},
    )

    for (const response of [
      getResponse,
      putResponse,
      deleteResponse,
      refreshResponse,
    ]) {
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe('Bearer')
    }
  })

  it.each([
    ['codeforces', 'tourist', 'https://codeforces.com/profile/tourist'],
    ['codechef', 'tester_1', 'https://www.codechef.com/users/tester_1'],
    ['leetcode', 'learner-1', 'https://leetcode.com/u/learner-1/'],
  ] as const)(
    'stores a consented %s public handle without enabling activity access',
    async (provider, handle, profileUrl) => {
      const baseUrl = startApp()
      const response = await saveAccount(baseUrl, provider, {
        handle,
        consent: true,
      })
      const account = ProviderAccountResponseSchema.parse(
        await response.json(),
      ).data

      expect(response.status).toBe(200)
      expect(account).toMatchObject({
        provider,
        handle,
        profileUrl,
        consentScope: 'store_public_profile_reference',
        verification: 'not_verified',
        activityAccess: 'not_enabled',
        publicStats: { status: 'not_synced' },
      })
    },
  )

  it('requires explicit consent and rejects unsupported providers', async () => {
    const baseUrl = startApp()
    const missingConsent = await saveAccount(baseUrl, 'codeforces', {
      handle: 'tourist',
      consent: false,
    })
    const unsupported = await saveAccount(baseUrl, 'unknown', {
      handle: 'learner',
      consent: true,
    })

    expect(
      ApiErrorResponseSchema.parse(await missingConsent.json()).error.code,
    ).toBe('INVALID_PROVIDER_ACCOUNT')
    expect(
      ApiErrorResponseSchema.parse(await unsupported.json()).error.code,
    ).toBe('UNSUPPORTED_LINK_PROVIDER')
  })

  it('isolates links by verified subject and disconnects idempotently', async () => {
    const baseUrl = startApp()
    await saveAccount(baseUrl, 'codeforces', {
      handle: 'first_user',
      consent: true,
    })

    const secondUserResponse = await fetch(`${baseUrl}/api/provider-accounts`, {
      headers: secondAuthorization,
    })
    expect(
      ProviderAccountsResponseSchema.parse(await secondUserResponse.json())
        .data,
    ).toEqual([])

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const deleteResponse = await fetch(
        `${baseUrl}/api/provider-accounts/codeforces`,
        { method: 'DELETE', headers: firstAuthorization },
      )
      expect(deleteResponse.status).toBe(200)
    }

    const firstUserResponse = await fetch(`${baseUrl}/api/provider-accounts`, {
      headers: firstAuthorization,
    })
    expect(
      ProviderAccountsResponseSchema.parse(await firstUserResponse.json()).data,
    ).toEqual([])
  })

  it('fetches and stores a public solved count only after explicit consent', async () => {
    const fetchSolvedCount = vi.fn(async () => ({
      solvedCount: 321,
      complete: true,
      source: 'codeforces_api' as const,
      fetchedAt: new Date('2026-08-27T12:02:00.000Z'),
    }))
    const baseUrl = startApp([{ provider: 'codeforces', fetchSolvedCount }])
    await saveAccount(baseUrl, 'codeforces', {
      handle: 'tourist',
      consent: true,
    })

    const missingConsent = await refreshStats(baseUrl, 'codeforces', {
      consent: false,
    })
    expect(missingConsent.status).toBe(400)
    expect(fetchSolvedCount).not.toHaveBeenCalled()

    const response = await refreshStats(baseUrl, 'codeforces')
    const account = ProviderAccountResponseSchema.parse(
      await response.json(),
    ).data

    expect(response.status).toBe(200)
    expect(fetchSolvedCount).toHaveBeenCalledWith('tourist')
    expect(account).toMatchObject({
      activityAccess: 'public_solved_count',
      publicStatsConsentAt: expect.any(String),
      publicStats: {
        status: 'available',
        solvedCount: 321,
        complete: true,
        source: 'codeforces_api',
        stale: false,
      },
    })
  })

  it('preserves a refresh failure as transparent account state', async () => {
    const fetchSolvedCount = vi.fn(async () => {
      throw new ProviderPublicStatsError('No account.', {
        provider: 'leetcode',
        code: 'PROVIDER_ACCOUNT_NOT_FOUND',
        retryable: false,
      })
    })
    const baseUrl = startApp([{ provider: 'leetcode', fetchSolvedCount }])
    await saveAccount(baseUrl, 'leetcode', {
      handle: 'missing-user',
      consent: true,
    })

    const refreshResponse = await refreshStats(baseUrl, 'leetcode')
    expect(refreshResponse.status).toBe(404)
    expect(
      ApiErrorResponseSchema.parse(await refreshResponse.json()).error.code,
    ).toBe('PROVIDER_ACCOUNT_NOT_FOUND')

    const accountsResponse = await fetch(`${baseUrl}/api/provider-accounts`, {
      headers: firstAuthorization,
    })
    const [account] = ProviderAccountsResponseSchema.parse(
      await accountsResponse.json(),
    ).data
    expect(account?.publicStats).toEqual({
      status: 'unavailable',
      attemptedAt: expect.any(String),
      errorCode: 'PROVIDER_ACCOUNT_NOT_FOUND',
      retryable: false,
    })
  })

  it('clears solved-count data when a linked handle changes', async () => {
    const baseUrl = startApp([
      {
        provider: 'codechef',
        fetchSolvedCount: async () => ({
          solvedCount: 12,
          complete: true,
          source: 'codechef_public_profile_html',
          fetchedAt: new Date('2026-08-27T12:00:00.000Z'),
        }),
      },
    ])
    await saveAccount(baseUrl, 'codechef', {
      handle: 'first-handle',
      consent: true,
    })
    await refreshStats(baseUrl, 'codechef')

    const changed = await saveAccount(baseUrl, 'codechef', {
      handle: 'second-handle',
      consent: true,
    })
    expect(
      ProviderAccountResponseSchema.parse(await changed.json()).data,
    ).toMatchObject({
      handle: 'second-handle',
      activityAccess: 'not_enabled',
      publicStats: { status: 'not_synced' },
    })
  })

  it('requires a linked account before fetching public statistics', async () => {
    const baseUrl = startApp([])
    const response = await refreshStats(baseUrl, 'codeforces')

    expect(response.status).toBe(404)
    expect(ApiErrorResponseSchema.parse(await response.json()).error.code).toBe(
      'PROVIDER_ACCOUNT_NOT_LINKED',
    )
  })
})
