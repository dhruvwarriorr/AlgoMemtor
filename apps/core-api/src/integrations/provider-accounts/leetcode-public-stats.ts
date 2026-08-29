import { z } from 'zod'

import { RequestGate } from '../../utils/request-gate.js'
import {
  fetchWithTimeout,
  invalidProviderResponse,
  readLimitedResponseText,
  throwForProviderHttpStatus,
  waitForProviderRequest,
} from './provider-fetch-utils.js'
import {
  ProviderPublicStatsError,
  type ProviderPublicStatsFetcher,
} from './provider-public-stats.js'

const LeetCodeStatsEnvelopeSchema = z.object({
  data: z
    .object({
      matchedUser: z
        .object({
          submitStatsGlobal: z.object({
            acSubmissionNum: z.array(
              z.object({
                difficulty: z.string().max(32),
                count: z.number().int().nonnegative(),
              }),
            ),
          }),
        })
        .nullable(),
    })
    .optional(),
  errors: z.array(z.object({ message: z.string().max(1000) })).optional(),
})

const solvedCountQuery = `
  query userProblemsSolved($username: String!) {
    matchedUser(username: $username) {
      submitStatsGlobal {
        acSubmissionNum {
          difficulty
          count
        }
      }
    }
  }
`

export type LeetCodePublicStatsOptions = {
  endpoint?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  requestGate?: RequestGate
  now?: () => Date
}

export class LeetCodePublicStatsFetcher implements ProviderPublicStatsFetcher {
  readonly provider = 'leetcode' as const

  private readonly endpoint: URL
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly requestGate: RequestGate
  private readonly now: () => Date

  constructor(options: LeetCodePublicStatsOptions = {}) {
    this.endpoint = new URL(options.endpoint ?? 'https://leetcode.com/graphql')
    this.timeoutMs = options.timeoutMs ?? 8000
    this.fetchImpl = options.fetchImpl ?? fetch
    this.requestGate =
      options.requestGate ?? new RequestGate({ minIntervalMs: 1000 })
    this.now = options.now ?? (() => new Date())

    if (
      this.endpoint.protocol !== 'https:' ||
      this.endpoint.pathname !== '/graphql' ||
      this.timeoutMs <= 0
    ) {
      throw new Error('The LeetCode public-statistics config is invalid.')
    }
  }

  async fetchSolvedCount(handle: string, signal?: AbortSignal) {
    await waitForProviderRequest(this.provider, this.requestGate, signal)
    const response = await fetchWithTimeout({
      provider: this.provider,
      url: this.endpoint,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      ...(signal === undefined ? {} : { signal }),
      init: {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          referer: 'https://leetcode.com/',
          'user-agent': 'AlgoMemtor/0.1 public-profile-stats',
        },
        body: JSON.stringify({
          query: solvedCountQuery,
          variables: { username: handle },
        }),
      },
    })
    throwForProviderHttpStatus(this.provider, response)

    const text = await readLimitedResponseText(
      this.provider,
      response,
      1_000_000,
    )
    let body: unknown

    try {
      body = JSON.parse(text)
    } catch {
      throw invalidProviderResponse(this.provider)
    }

    const envelope = LeetCodeStatsEnvelopeSchema.safeParse(body)

    if (!envelope.success) {
      throw invalidProviderResponse(this.provider)
    }

    const matchedUser = envelope.data.data?.matchedUser

    if (matchedUser === null) {
      throw new ProviderPublicStatsError(
        'The LeetCode account was not found.',
        {
          provider: this.provider,
          code: 'PROVIDER_ACCOUNT_NOT_FOUND',
          retryable: false,
        },
      )
    }

    const allStats = matchedUser?.submitStatsGlobal.acSubmissionNum.find(
      (entry) => entry.difficulty === 'All',
    )

    if (allStats === undefined) {
      throw invalidProviderResponse(this.provider)
    }

    return {
      solvedCount: allStats.count,
      complete: true,
      source: 'leetcode_website_graphql' as const,
      fetchedAt: this.now(),
    }
  }
}
