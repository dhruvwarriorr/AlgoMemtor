import type { AddressInfo } from 'node:net'

import {
  ApiErrorResponseSchema,
  ConnectorIngestResponseSchema,
  ConnectorSessionResponseSchema,
  ConnectorTokensResponseSchema,
  CreateConnectorTokenResponseSchema,
  ProviderAccountsResponseSchema,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider.js'
import type { ProblemMetadataCache } from './integrations/providers/problem-metadata-cache.js'
import { InMemoryProviderAccountRepository } from './repositories/provider-account-repository.js'
import { InMemoryProviderDataRepository } from './repositories/provider-data-repository.js'

const subject = '00000000-0000-4000-8000-000000000001'
const otherSubject = '00000000-0000-4000-8000-000000000002'
// Like the real verifier, this rejects anything that is not a session token,
// so connector routes must not depend on Supabase authentication.
const jwtVerifier: SupabaseJwtVerifier = async (token) => {
  if (token !== 'learner' && token !== 'other') throw new Error('invalid JWT')
  return {
    subject: token === 'other' ? otherSubject : subject,
    claims: { role: 'authenticated' },
  }
}

const servers: ReturnType<ReturnType<typeof createApp>['listen']>[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
})

const cses1068 = {
  provider: 'cses' as const,
  externalId: '1068',
  title: 'Weird Algorithm',
  canonicalUrl: 'https://cses.fi/problemset/task/1068/',
  providerTags: ['Introductory Problems'],
  topics: ['implementation'],
  isPaidOnly: false,
  contentAvailable: false,
  extractionStrategy: 'sanitized_html' as const,
  sourceUrl: 'https://cses.fi/problemset/',
  completeness: 'complete' as const,
  stale: false,
  fetchedAt: '2026-09-23T00:00:00.000Z',
}

function startApp() {
  const dataRepository = new InMemoryProviderDataRepository()
  const problemMetadataCache: ProblemMetadataCache = {
    findByProvider: async () => null,
    findByReferences: async (references) =>
      references.some((item) => item.externalId === '1068')
        ? ([cses1068] as never)
        : [],
    replaceProviderCatalog: async () => {},
  }
  const server = createApp({
    jwtVerifier,
    problemProvider: new CodeforcesProvider({
      baseUrl: 'https://mock.codeforces.test/api',
      fetchImpl: vi.fn(),
      minRequestIntervalMs: 0,
    }),
    providerAccountRepository: new InMemoryProviderAccountRepository(),
    providerDataRepository: dataRepository,
    providerPublicStatsFetchers: [],
    providerOwnershipCheckers: [],
    problemMetadataCache,
  }).listen(0)
  servers.push(server)
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    dataRepository,
  }
}

const learner = { authorization: 'Bearer learner' }

const pair = async (baseUrl: string, headers = learner) => {
  const response = await fetch(`${baseUrl}/api/connector/tokens`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ label: 'Laptop Chrome' }),
  })
  expect(response.status).toBe(201)
  return CreateConnectorTokenResponseSchema.parse(await response.json()).data
}

const ingest = (baseUrl: string, secret: string, body: unknown) =>
  fetch(`${baseUrl}/api/connector/ingest`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

const leetCodeUpload = (handle = 'Learner') => ({
  provider: 'leetcode',
  account: { handle },
  submissions: [
    {
      eventId: '1001',
      externalId: 'two-sum',
      problemTitle: 'Two Sum',
      verdict: 'Wrong Answer',
      isAccepted: false,
      language: 'C++',
      occurredAt: '2026-09-01T10:00:00.000Z',
      passedTestCount: 12,
    },
    {
      eventId: '1002',
      externalId: 'two-sum',
      problemTitle: 'Two Sum',
      verdict: 'Accepted',
      isAccepted: true,
      language: 'C++',
      occurredAt: '2026-09-01T10:05:00.000Z',
      runtimeMs: 4,
      memoryKb: 9300,
    },
  ],
  solvedProblems: [{ externalId: 'two-sum' }, { externalId: 'valid-anagram' }],
  solvedListComplete: true,
  historyComplete: false,
})

describe('browser connector API', () => {
  it('pairs, reports the session, and never lists the secret again', async () => {
    const { baseUrl } = startApp()
    const { secret, token } = await pair(baseUrl)
    expect(secret).toMatch(/^amc_[A-Za-z0-9_-]{43}$/)

    const listed = ConnectorTokensResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/connector/tokens`, { headers: learner })
      ).json(),
    )
    expect(listed.data).toEqual([expect.objectContaining({ id: token.id })])
    expect(JSON.stringify(listed)).not.toContain(secret)

    const session = await fetch(`${baseUrl}/api/connector/session`, {
      headers: { authorization: `Bearer ${secret}` },
    })
    expect(
      ConnectorSessionResponseSchema.parse(await session.json()).data,
    ).toEqual({ tokenLabel: 'Laptop Chrome', accounts: [] })
  })

  it('allows browser-extension origins on connector routes only', async () => {
    const { baseUrl } = startApp()
    const preflight = await fetch(`${baseUrl}/api/connector/ingest`, {
      method: 'OPTIONS',
      headers: {
        origin: 'moz-extension://4b6f1c2e-1234-4d4d-9a9a-0123456789ab',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    })
    expect(preflight.headers.get('access-control-allow-origin')).toBe(
      'moz-extension://4b6f1c2e-1234-4d4d-9a9a-0123456789ab',
    )
    const other = await fetch(`${baseUrl}/api/provider-accounts`, {
      method: 'OPTIONS',
      headers: {
        origin: 'moz-extension://4b6f1c2e-1234-4d4d-9a9a-0123456789ab',
        'access-control-request-method': 'GET',
      },
    })
    expect(other.headers.get('access-control-allow-origin')).not.toBe(
      'moz-extension://4b6f1c2e-1234-4d4d-9a9a-0123456789ab',
    )
  })

  it('rejects missing, malformed, and revoked connector tokens', async () => {
    const { baseUrl } = startApp()
    const { secret, token } = await pair(baseUrl)
    for (const authorization of [
      undefined,
      'Bearer not-a-token',
      `Bearer amc_${'a'.repeat(43)}`,
    ]) {
      const response = await fetch(`${baseUrl}/api/connector/session`, {
        headers: authorization === undefined ? {} : { authorization },
      })
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe('Bearer')
    }
    const revoked = await fetch(`${baseUrl}/api/connector/tokens/${token.id}`, {
      method: 'DELETE',
      headers: learner,
    })
    expect(revoked.status).toBe(200)
    const after = await fetch(`${baseUrl}/api/connector/session`, {
      headers: { authorization: `Bearer ${secret}` },
    })
    expect(after.status).toBe(401)
    // Another learner cannot revoke someone else's token.
    const { token: second } = await pair(baseUrl)
    expect(
      (
        await fetch(`${baseUrl}/api/connector/tokens/${second.id}`, {
          method: 'DELETE',
          headers: { authorization: 'Bearer other' },
        })
      ).status,
    ).toBe(404)
  })

  it('links, verifies, and stores a LeetCode upload', async () => {
    const { baseUrl, dataRepository } = startApp()
    const { secret } = await pair(baseUrl)

    const response = await ingest(baseUrl, secret, leetCodeUpload())
    expect(response.status).toBe(200)
    expect(
      ConnectorIngestResponseSchema.parse(await response.json()).data,
    ).toEqual({
      provider: 'leetcode',
      handle: 'Learner',
      storedSubmissions: 2,
      storedSolvedProblems: 2,
    })

    const accounts = ProviderAccountsResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/provider-accounts`, { headers: learner })
      ).json(),
    )
    expect(accounts.data).toMatchObject([
      { provider: 'leetcode', handle: 'Learner', verification: 'verified' },
    ])
    const submissions = await dataRepository.listSubmissions(subject)
    expect(submissions).toHaveLength(2)
    expect(submissions[0]).toMatchObject({
      eventId: 'lc:1002',
      canonicalUrl: 'https://leetcode.com/problems/two-sum/',
      runtimeMs: 4,
      provenance: { extractionStrategy: 'authenticated_connector' },
    })
    const solved = await dataRepository.listSolvedProblems(subject)
    expect(solved.find((item) => item.externalId === 'two-sum')).toMatchObject({
      occurredAt: '2026-09-01T10:05:00.000Z',
      sourceSubmissionId: 'lc:1002',
    })
  })

  it('replaces matching public-feed rows and blocks them afterwards', async () => {
    const { baseUrl, dataRepository } = startApp()
    const { secret } = await pair(baseUrl)
    await ingest(baseUrl, secret, leetCodeUpload())
    const [connectorRow] = await dataRepository.listSubmissions(subject)
    if (connectorRow === undefined) throw new Error('missing upload')
    const accountKey = (
      await fetch(`${baseUrl}/api/provider-accounts`, { headers: learner })
    ).ok
    expect(accountKey).toBe(true)
    const publicRow = (occurredAt: string, suffix: string) => ({
      ...connectorRow,
      eventId: `recent:two-sum:${suffix}`,
      occurredAt,
      provenance: {
        ...connectorRow.provenance,
        extractionStrategy: 'public_graphql' as const,
      },
    })
    // The in-memory repository keys rows by account; reuse the connector
    // row's account by saving through the same learner and account ID.
    const accountId = 'account'
    await dataRepository.saveSubmissions(subject, accountId, [
      publicRow('2026-09-01T10:05:00.000Z', 'before'),
      publicRow('2026-09-02T08:00:00.000Z', 'unrelated'),
    ])
    await dataRepository.saveSubmissions(subject, accountId, [
      { ...connectorRow, eventId: 'lc:1002' },
    ])
    await dataRepository.deleteSupersededPublicSubmissions(subject, accountId, [
      { externalId: 'two-sum', occurredAt: '2026-09-01T10:05:00.000Z' },
    ])
    await dataRepository.saveSubmissions(subject, accountId, [
      publicRow('2026-09-01T10:05:00.000Z', 'after'),
    ])

    const eventIds = (await dataRepository.listSubmissions(subject)).map(
      (row) => row.eventId,
    )
    expect(eventIds).not.toContain('recent:two-sum:before')
    expect(eventIds).not.toContain('recent:two-sum:after')
    expect(eventIds).toContain('recent:two-sum:unrelated')
  })

  it('rejects a different signed-in account and source code fields', async () => {
    const { baseUrl } = startApp()
    const { secret } = await pair(baseUrl)
    await ingest(baseUrl, secret, leetCodeUpload('Learner'))

    const mismatch = await ingest(baseUrl, secret, leetCodeUpload('someone'))
    expect(mismatch.status).toBe(409)
    expect(ApiErrorResponseSchema.parse(await mismatch.json()).error.code).toBe(
      'CONNECTOR_ACCOUNT_MISMATCH',
    )

    const upload = leetCodeUpload()
    const withCode = {
      ...upload,
      submissions: [{ ...upload.submissions[0], code: 'int main() {}' }],
    }
    expect((await ingest(baseUrl, secret, withCode)).status).toBe(400)
    const badSlug = {
      ...upload,
      solvedProblems: [{ externalId: 'https://evil.example/x' }],
    }
    expect((await ingest(baseUrl, secret, badSlug)).status).toBe(400)
  })

  it('verifies a signed-in Codeforces handle and queues a server sync', async () => {
    const { baseUrl } = startApp()
    const { secret } = await pair(baseUrl)
    const claim = (handle: string) =>
      fetch(`${baseUrl}/api/connector/claim`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ provider: 'codeforces', handle }),
      })

    const first = await claim('tourist')
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({
      data: {
        provider: 'codeforces',
        handle: 'tourist',
        verified: true,
        syncQueued: true,
      },
    })
    const accounts = ProviderAccountsResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/provider-accounts`, { headers: learner })
      ).json(),
    )
    const codeforces = accounts.data.find((a) => a.provider === 'codeforces')
    expect(codeforces).toMatchObject({ verification: 'verified' })
    // The server, not the connector, syncs Codeforces data.
    expect(codeforces?.connectorSyncedAt).toBeUndefined()

    expect((await claim('tourist')).status).toBe(200)
    const mismatch = await claim('petr')
    expect(mismatch.status).toBe(409)
  })

  it('links CSES only through the connector and records its solved total', async () => {
    const { baseUrl, dataRepository } = startApp()
    const manual = await fetch(`${baseUrl}/api/provider-accounts/cses`, {
      method: 'PUT',
      headers: { ...learner, 'content-type': 'application/json' },
      body: JSON.stringify({ handle: '12345', consent: true }),
    })
    expect(manual.status).toBe(400)
    expect(ApiErrorResponseSchema.parse(await manual.json()).error.code).toBe(
      'CONNECTOR_ONLY_PROVIDER',
    )

    const { secret } = await pair(baseUrl)
    const response = await ingest(baseUrl, secret, {
      provider: 'cses',
      account: { handle: '12345' },
      submissions: [],
      solvedProblems: [
        { externalId: '1068' },
        { externalId: '1083', section: 'Introductory Problems' },
      ],
      solvedListComplete: true,
      historyComplete: false,
    })
    expect(response.status).toBe(200)

    const accounts = ProviderAccountsResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/provider-accounts`, { headers: learner })
      ).json(),
    )
    expect(accounts.data).toMatchObject([
      {
        provider: 'cses',
        handle: '12345',
        profileUrl: 'https://cses.fi/user/12345',
        verification: 'verified',
        publicStats: {
          status: 'available',
          solvedCount: 2,
          source: 'browser_connector',
        },
      },
    ])
    const solved = await dataRepository.listSolvedProblems(subject, 'cses')
    expect(solved.find((item) => item.externalId === '1068')).toMatchObject({
      canonicalUrl: 'https://cses.fi/problemset/task/1068/',
      providerTags: ['Introductory Problems'],
    })
    expect(solved.find((item) => item.externalId === '1083')).toMatchObject({
      providerTags: ['cses', 'introductory-problems'],
      topics: ['cses', 'introductory-problems'],
    })
    // A server-side sync is never offered for CSES.
    const sync = await fetch(`${baseUrl}/api/provider-accounts/cses/sync`, {
      method: 'POST',
      headers: learner,
    })
    expect(sync.status).toBe(400)
  })

  it('stores CodeChef uploads with each solve\'s context and rating', async () => {
    const { baseUrl, dataRepository } = startApp()
    const { secret } = await pair(baseUrl)
    const response = await ingest(baseUrl, secret, {
      provider: 'codechef',
      account: { handle: 'chef_learner' },
      submissions: [
        {
          eventId: '112233',
          externalId: 'start1a',
          verdict: 'accepted',
          isAccepted: true,
          language: 'C++17',
          occurredAt: '2026-09-10T15:00:00.000Z',
        },
      ],
      solvedProblems: [
        {
          externalId: 'START1A',
          solveContext: 'contest',
          contestCode: 'START150',
          difficultyRating: 1450,
        },
        { externalId: 'FLOW001', solveContext: 'practice' },
      ],
      solvedListComplete: true,
      historyComplete: true,
    })
    expect(response.status).toBe(200)
    expect(
      ConnectorIngestResponseSchema.parse(await response.json()).data,
    ).toMatchObject({ provider: 'codechef', storedSolvedProblems: 2 })

    const solved = await dataRepository.listSolvedProblems(subject, 'codechef')
    expect(solved.find((item) => item.externalId === 'START1A')).toMatchObject(
      {
        solveContext: 'contest',
        difficultyRating: 1450,
        occurredAt: '2026-09-10T15:00:00.000Z',
        canonicalUrl: 'https://www.codechef.com/problems/START1A',
      },
    )
    const practice = solved.find((item) => item.externalId === 'FLOW001')
    expect(practice?.solveContext).toBe('practice')
    expect(practice?.difficultyRating).toBeUndefined()
    // The solution ID is the event ID the server's public feed uses too.
    const submissions = await dataRepository.listSubmissions(
      subject,
      'codechef',
    )
    expect(submissions.map((item) => item.eventId)).toEqual(['112233'])
  })

  it('rejects CodeChef problem codes that are not codes', async () => {
    const { baseUrl } = startApp()
    const { secret } = await pair(baseUrl)
    const response = await ingest(baseUrl, secret, {
      provider: 'codechef',
      account: { handle: 'chef_learner' },
      submissions: [],
      solvedProblems: [{ externalId: '../admin' }],
      solvedListComplete: true,
      historyComplete: true,
    })
    expect(response.status).toBe(400)
  })
})
