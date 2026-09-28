import { z } from 'zod'

import type {
  LinkableProvider,
  PublicProviderHandle,
} from '@algomemtor/shared-contracts'

import { ProviderError } from '../../errors/provider-error'
import { RequestGate } from '../../utils/request-gate'
import {
  fetchProviderJson,
  fetchProviderText,
  type ProviderHttpRequest,
} from '../providers/provider-http-client'
import { isCodeChefChallengePage } from './codechef-public-stats'

// Handle ownership is proven by a one-time code the learner places in a public
// profile field. Each checker reads only that public profile and reports
// whether the code is present; it never needs the learner's credentials.
export interface ProviderOwnershipChecker {
  readonly provider: LinkableProvider
  profileContainsCode(
    handle: PublicProviderHandle,
    code: string,
    signal?: AbortSignal,
  ): Promise<boolean>
}

type CheckerOptions = {
  baseUrl?: string
  timeoutMs?: number
  requestGate?: RequestGate
  fetchImpl?: typeof fetch
}

const requestOptions = (
  options: CheckerOptions,
  defaultIntervalMs: number,
) => ({
  requestGate:
    options.requestGate ??
    new RequestGate({ minIntervalMs: defaultIntervalMs }),
  timeoutMs: options.timeoutMs ?? 8000,
  maxAttempts: 1,
  ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
})

const containsCode = (
  values: readonly (string | null | undefined)[],
  code: string,
) => values.some((value) => value?.toUpperCase().includes(code) === true)

const CodeforcesUserInfoSchema = z.union([
  z.object({
    status: z.literal('OK'),
    result: z
      .array(
        z.object({
          firstName: z.string().max(512).optional(),
          lastName: z.string().max(512).optional(),
          organization: z.string().max(512).optional(),
        }),
      )
      .length(1),
  }),
  z.object({ status: z.literal('FAILED'), comment: z.string().max(1000) }),
])

export class CodeforcesOwnershipChecker implements ProviderOwnershipChecker {
  readonly provider = 'codeforces' as const
  private readonly endpoint: URL
  private readonly request

  constructor(options: CheckerOptions = {}) {
    const baseUrl = options.baseUrl ?? 'https://codeforces.com/api'
    this.endpoint = new URL('user.info', `${baseUrl.replace(/\/+$/, '')}/`)
    this.request = requestOptions(options, 2100)
  }

  async profileContainsCode(
    handle: PublicProviderHandle,
    code: string,
    signal?: AbortSignal,
  ) {
    const url = new URL(this.endpoint)
    url.searchParams.set('handles', handle)
    const body = CodeforcesUserInfoSchema.safeParse(
      await fetchProviderJson({
        ...this.request,
        provider: this.provider,
        url,
        allowedHostname: 'codeforces.com',
        maxResponseBytes: 200_000,
        ...(signal === undefined ? {} : { signal }),
      } satisfies ProviderHttpRequest),
    )
    if (!body.success) {
      throw new ProviderError('Codeforces returned an invalid profile.', {
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: this.provider,
        retryable: false,
      })
    }
    if (body.data.status === 'FAILED') return false
    const [user] = body.data.result
    return containsCode(
      [user?.firstName, user?.lastName, user?.organization],
      code,
    )
  }
}

export class CodeChefOwnershipChecker implements ProviderOwnershipChecker {
  readonly provider = 'codechef' as const
  private readonly baseUrl: URL
  private readonly request

  constructor(options: CheckerOptions = {}) {
    this.baseUrl = new URL(options.baseUrl ?? 'https://www.codechef.com/users/')
    this.request = requestOptions(options, 1000)
  }

  async profileContainsCode(
    handle: PublicProviderHandle,
    code: string,
    signal?: AbortSignal,
  ) {
    const html = await fetchProviderText({
      ...this.request,
      provider: this.provider,
      url: new URL(encodeURIComponent(handle), this.baseUrl),
      allowedHostname: 'www.codechef.com',
      maxResponseBytes: 4_000_000,
      ...(signal === undefined ? {} : { signal }),
    } satisfies ProviderHttpRequest)
    if (isCodeChefChallengePage(html)) {
      throw new ProviderError('CodeChef blocked the profile request.', {
        code: 'PROVIDER_BLOCKED',
        provider: this.provider,
        retryable: false,
      })
    }
    // The code is random, so its presence anywhere on the learner's own
    // public profile page (name, institution, or about text) is proof.
    return html.toUpperCase().includes(code)
  }
}

const LeetCodeProfileSchema = z.object({
  data: z
    .object({
      matchedUser: z
        .object({
          profile: z
            .object({
              realName: z.string().max(512).nullish(),
              aboutMe: z.string().max(10_000).nullish(),
            })
            .nullish(),
        })
        .nullish(),
    })
    .optional(),
})

export class LeetCodeOwnershipChecker implements ProviderOwnershipChecker {
  readonly provider = 'leetcode' as const
  private readonly endpoint: URL
  private readonly request

  constructor(options: CheckerOptions = {}) {
    this.endpoint = new URL(options.baseUrl ?? 'https://leetcode.com/graphql')
    this.request = requestOptions(options, 1000)
  }

  async profileContainsCode(
    handle: PublicProviderHandle,
    code: string,
    signal?: AbortSignal,
  ) {
    const body = LeetCodeProfileSchema.safeParse(
      await fetchProviderJson({
        ...this.request,
        provider: this.provider,
        url: this.endpoint,
        allowedHostname: 'leetcode.com',
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          referer: 'https://leetcode.com/',
        },
        body: JSON.stringify({
          query:
            'query ownership($username: String!) { matchedUser(username: $username) { profile { realName aboutMe } } }',
          variables: { username: handle },
        }),
        maxResponseBytes: 200_000,
        ...(signal === undefined ? {} : { signal }),
      } satisfies ProviderHttpRequest),
    )
    if (!body.success) {
      throw new ProviderError('LeetCode returned an invalid profile.', {
        code: 'PROVIDER_INVALID_RESPONSE',
        provider: this.provider,
        retryable: false,
      })
    }
    const profile = body.data.data?.matchedUser?.profile
    return containsCode([profile?.realName, profile?.aboutMe], code)
  }
}
