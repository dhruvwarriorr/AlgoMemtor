import type { AddressInfo } from 'node:net'

import { JobPumpResponseSchema } from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider.js'
import type { ProviderPublicStatsFetcher } from './integrations/provider-accounts/provider-public-stats.js'
import { InMemoryProviderAccountRepository } from './repositories/provider-account-repository.js'
import { InMemoryProviderSyncRepository } from './repositories/provider-sync-repository.js'

const firstSubject = '00000000-0000-4000-8000-000000000001'
const secondSubject = '00000000-0000-4000-8000-000000000002'
const first = { authorization: 'Bearer first-access-token' }
const second = { authorization: 'Bearer second-access-token' }

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

const statsFetcher = (): ProviderPublicStatsFetcher => ({
  provider: 'codeforces',
  fetchSolvedCount: vi.fn(async () => ({
    solvedCount: 7,
    complete: true,
    source: 'codeforces_api' as const,
    fetchedAt: new Date(),
  })),
})

function startApp(jobPumpEnabled: boolean) {
  const accounts = new InMemoryProviderAccountRepository()
  const syncs = new InMemoryProviderSyncRepository()
  const fetcher = statsFetcher()
  const server = createApp({
    jwtVerifier,
    problemProvider: new CodeforcesProvider({
      baseUrl: 'https://mock.codeforces.test/api',
      fetchImpl: vi.fn(),
      minRequestIntervalMs: 0,
    }),
    providerAccountRepository: accounts,
    providerSyncRepository: syncs,
    providerPublicStatsFetchers: [fetcher],
    providerProfileFetchers: [],
    providerSyncActivityFetchers: [],
    jobPumpEnabled,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    } as never,
  }).listen(0)
  servers.push(server)
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    accounts,
    syncs,
    fetcher,
  }
}

const pump = (
  baseUrl: string,
  headers: Record<string, string>,
  body: unknown = {},
) =>
  fetch(`${baseUrl}/api/jobs/pump`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe('job pump API', () => {
  it('requires a signed-in learner', async () => {
    const { baseUrl } = startApp(true)
    const response = await pump(baseUrl, {})
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('rejects unknown fields', async () => {
    const { baseUrl } = startApp(true)
    const response = await pump(baseUrl, first, { ownerId: secondSubject })
    expect(response.status).toBe(400)
  })

  it('reports nothing pending when the pump is off', async () => {
    const { baseUrl } = startApp(false)
    const response = await pump(baseUrl, first)
    expect(response.status).toBe(200)
    expect(JobPumpResponseSchema.parse(await response.json()).data).toEqual({
      pending: false,
      nextPollAfterMs: 600_000,
    })
  })

  it('refreshes a stale linked account on a visit and runs it', async () => {
    const { baseUrl, accounts, syncs, fetcher } = startApp(true)
    const account = await accounts.upsertByAuthUserId(
      firstSubject,
      'codeforces',
      'tourist',
    )
    await accounts.grantPublicStatsConsent(
      firstSubject,
      'codeforces',
      'tourist',
      new Date(),
    )

    const response = await pump(baseUrl, first, { visit: true })
    expect(response.status).toBe(200)
    await settle()

    const job = await syncs.findLatest(firstSubject, 'codeforces', account.id)
    expect(job?.jobType).toBe('active_session_sync')
    expect(job?.status).toBe('completed')
    expect(fetcher.fetchSolvedCount).toHaveBeenCalledTimes(1)
    // A second visit inside the freshness window queues nothing.
    await new Promise((resolve) => setTimeout(resolve, 1_050))
    await pump(baseUrl, first, { visit: true })
    await settle()
    expect(fetcher.fetchSolvedCount).toHaveBeenCalledTimes(1)
  })

  it('never runs another learner’s queued work', async () => {
    const { baseUrl, accounts, syncs } = startApp(true)
    const account = await accounts.upsertByAuthUserId(
      secondSubject,
      'codeforces',
      'petr',
    )
    await syncs.enqueue({
      userId: secondSubject,
      providerAccountId: account.id,
      provider: 'codeforces',
      capability: 'linked_user_sync',
      jobType: 'manual_sync',
      idempotencyKey: 'second-manual',
    })

    const response = await pump(baseUrl, first)
    expect(
      JobPumpResponseSchema.parse(await response.json()).data.pending,
    ).toBe(false)
    await settle()
    expect(
      (await syncs.findLatest(secondSubject, 'codeforces', account.id))?.status,
    ).toBe('queued')

    await pump(baseUrl, second)
    await settle()
    expect(
      (await syncs.findLatest(secondSubject, 'codeforces', account.id))?.status,
    ).not.toBe('queued')
  })
})
