import type { AddressInfo } from 'node:net'

import {
  ApiErrorResponseSchema,
  ProviderAccountResponseSchema,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import { CodeforcesProvider } from './integrations/codeforces/codeforces-provider.js'
import { ProviderError } from './errors/provider-error.js'
import {
  CodeChefOwnershipChecker,
  CodeforcesOwnershipChecker,
  LeetCodeOwnershipChecker,
  type ProviderOwnershipChecker,
} from './integrations/provider-accounts/provider-ownership.js'
import { InMemoryProviderAccountRepository } from './repositories/provider-account-repository.js'
import { RequestGate } from './utils/request-gate.js'

const subject = '00000000-0000-4000-8000-000000000001'
const authorization = { authorization: 'Bearer first-access-token' }

const jwtVerifier: SupabaseJwtVerifier = async () => ({
  subject,
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
  providerOwnershipCheckers: readonly ProviderOwnershipChecker[],
  providerAccountRepository = new InMemoryProviderAccountRepository(),
) {
  const server = createApp({
    jwtVerifier,
    problemProvider: new CodeforcesProvider({
      baseUrl: 'https://mock.codeforces.test/api',
      fetchImpl: vi.fn(),
      minRequestIntervalMs: 0,
    }),
    providerAccountRepository,
    providerPublicStatsFetchers: [],
    providerOwnershipCheckers,
  }).listen(0)
  servers.push(server)
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const post = (baseUrl: string, path: string) =>
  fetch(`${baseUrl}/api/provider-accounts/${path}`, {
    method: 'POST',
    headers: authorization,
  })

const link = (baseUrl: string, provider: string, handle: string) =>
  fetch(`${baseUrl}/api/provider-accounts/${provider}`, {
    method: 'PUT',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ handle, consent: true }),
  })

const fakeChecker = (
  profileContainsCode: ProviderOwnershipChecker['profileContainsCode'],
): ProviderOwnershipChecker => ({ provider: 'codeforces', profileContainsCode })

describe('provider handle verification API', () => {
  it('issues a code and verifies the handle once the code is on the profile', async () => {
    let profileText = 'Tourist'
    const baseUrl = startApp([
      fakeChecker(async (_handle, code) => profileText.includes(code)),
    ])
    await link(baseUrl, 'codeforces', 'tourist')

    const started = ProviderAccountResponseSchema.parse(
      await (await post(baseUrl, 'codeforces/verification')).json(),
    ).data
    expect(started.verification).toBe('not_verified')
    const code = started.verificationChallenge?.code
    expect(code).toMatch(/^AM-[A-Z2-9]{8}$/)

    const missing = await post(baseUrl, 'codeforces/verification/check')
    expect(missing.status).toBe(422)
    expect(ApiErrorResponseSchema.parse(await missing.json()).error.code).toBe(
      'PROVIDER_VERIFICATION_CODE_NOT_FOUND',
    )

    profileText = `Tourist ${code}`
    const checked = await post(baseUrl, 'codeforces/verification/check')
    expect(checked.status).toBe(200)
    const verified = ProviderAccountResponseSchema.parse(
      await checked.json(),
    ).data
    expect(verified).toMatchObject({ verification: 'verified' })
    expect(verified.verifiedAt).toBeDefined()
    expect(verified.verificationChallenge).toBeUndefined()

    // Relinking the same handle keeps the proof.
    const relinked = ProviderAccountResponseSchema.parse(
      await (await link(baseUrl, 'codeforces', 'tourist')).json(),
    ).data
    expect(relinked.verification).toBe('verified')
    // A different handle starts unverified.
    const changed = ProviderAccountResponseSchema.parse(
      await (await link(baseUrl, 'codeforces', 'petr')).json(),
    ).data
    expect(changed.verification).toBe('not_verified')
  })

  it('rejects checks without an open challenge or linked account', async () => {
    const baseUrl = startApp([fakeChecker(async () => true)])

    expect((await post(baseUrl, 'codeforces/verification')).status).toBe(404)
    await link(baseUrl, 'codeforces', 'tourist')
    const noChallenge = await post(baseUrl, 'codeforces/verification/check')
    expect(noChallenge.status).toBe(409)
    expect(
      ApiErrorResponseSchema.parse(await noChallenge.json()).error.code,
    ).toBe('PROVIDER_VERIFICATION_EXPIRED')
    expect((await post(baseUrl, 'cses/verification')).status).toBe(400)
  })

  it('expires a code after thirty minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const baseUrl = startApp([fakeChecker(async () => true)])
      await link(baseUrl, 'codeforces', 'tourist')
      await post(baseUrl, 'codeforces/verification')
      vi.setSystemTime(Date.now() + 31 * 60 * 1000)

      const expired = await post(baseUrl, 'codeforces/verification/check')

      expect(expired.status).toBe(409)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports an unreadable provider profile as retryable', async () => {
    const baseUrl = startApp([
      fakeChecker(async () => {
        throw new ProviderError('down', {
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'codeforces',
          retryable: true,
        })
      }),
    ])
    await link(baseUrl, 'codeforces', 'tourist')
    await post(baseUrl, 'codeforces/verification')

    const failed = await post(baseUrl, 'codeforces/verification/check')

    expect(failed.status).toBe(503)
    expect(
      ApiErrorResponseSchema.parse(await failed.json()).error,
    ).toMatchObject({
      code: 'PROVIDER_VERIFICATION_UNAVAILABLE',
      retryable: true,
    })
  })
})

describe('provider ownership checkers', () => {
  const gate = () => new RequestGate({ minIntervalMs: 0 })

  it('reads the Codeforces name and organization fields', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        status: 'OK',
        result: [{ firstName: 'Gennady', organization: 'ITMO am-abcd2345' }],
      }),
    )
    const checker = new CodeforcesOwnershipChecker({
      baseUrl: 'https://codeforces.test/api',
      fetchImpl,
      requestGate: gate(),
    })

    expect(await checker.profileContainsCode('tourist', 'AM-ABCD2345')).toBe(
      true,
    )
    expect(await checker.profileContainsCode('tourist', 'AM-ZZZZ2345')).toBe(
      false,
    )
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'https://codeforces.test/api/user.info?handles=tourist',
    )
  })

  it('searches the CodeChef public profile page', async () => {
    const checker = new CodeChefOwnershipChecker({
      baseUrl: 'https://www.codechef.test/users/',
      fetchImpl: vi.fn<typeof fetch>(
        async () =>
          new Response('<html><h1>Learner AM-ABCD2345</h1></html>', {
            headers: { 'content-type': 'text/html' },
          }),
      ),
      requestGate: gate(),
    })

    expect(await checker.profileContainsCode('learner', 'AM-ABCD2345')).toBe(
      true,
    )
  })

  it('reads the LeetCode profile summary', async () => {
    const checker = new LeetCodeOwnershipChecker({
      baseUrl: 'https://leetcode.test/graphql',
      fetchImpl: vi.fn<typeof fetch>(async () =>
        Response.json({
          data: {
            matchedUser: {
              profile: { realName: 'Learner', aboutMe: 'hi AM-ABCD2345' },
            },
          },
        }),
      ),
      requestGate: gate(),
    })

    expect(await checker.profileContainsCode('learner', 'AM-ABCD2345')).toBe(
      true,
    )
  })
})
