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

const CodeforcesSubmissionSchema = z.object({
  verdict: z.string().max(64).optional(),
  problem: z.object({
    contestId: z.number().int().positive().optional(),
    problemsetName: z.string().trim().min(1).max(128).optional(),
    index: z.string().trim().min(1).max(32),
  }),
})

const CodeforcesUserStatusEnvelopeSchema = z.union([
  z.object({ status: z.literal('OK'), result: z.array(z.unknown()) }),
  z.object({
    status: z.literal('FAILED'),
    comment: z.string().max(1000),
  }),
])

export type CodeforcesPublicStatsOptions = {
  baseUrl?: string
  timeoutMs?: number
  maxSubmissions?: number
  fetchImpl?: typeof fetch
  requestGate?: RequestGate
  now?: () => Date
}

export class CodeforcesPublicStatsFetcher implements ProviderPublicStatsFetcher {
  readonly provider = 'codeforces' as const

  private readonly endpoint: URL
  private readonly timeoutMs: number
  private readonly maxSubmissions: number
  private readonly fetchImpl: typeof fetch
  private readonly requestGate: RequestGate
  private readonly now: () => Date

  constructor(options: CodeforcesPublicStatsOptions = {}) {
    const baseUrl = options.baseUrl ?? 'https://codeforces.com/api'
    this.endpoint = new URL('user.status', `${baseUrl.replace(/\/+$/, '')}/`)
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxSubmissions = options.maxSubmissions ?? 10_000
    this.fetchImpl = options.fetchImpl ?? fetch
    this.requestGate =
      options.requestGate ?? new RequestGate({ minIntervalMs: 2100 })
    this.now = options.now ?? (() => new Date())

    if (
      this.endpoint.protocol !== 'https:' ||
      this.timeoutMs <= 0 ||
      !Number.isInteger(this.maxSubmissions) ||
      this.maxSubmissions < 1 ||
      this.maxSubmissions > 100_000
    ) {
      throw new Error('The Codeforces public-statistics config is invalid.')
    }
  }

  async fetchSolvedCount(handle: string, signal?: AbortSignal) {
    const endpoint = new URL(this.endpoint)
    endpoint.searchParams.set('handle', handle)
    endpoint.searchParams.set('from', '1')
    endpoint.searchParams.set('count', String(this.maxSubmissions))

    await waitForProviderRequest(this.provider, this.requestGate, signal)

    const response = await fetchWithTimeout({
      provider: this.provider,
      url: endpoint,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      ...(signal === undefined ? {} : { signal }),
      init: { headers: { accept: 'application/json' } },
    })
    throwForProviderHttpStatus(this.provider, response)

    const text = await readLimitedResponseText(
      this.provider,
      response,
      30_000_000,
    )
    let body: unknown

    try {
      body = JSON.parse(text)
    } catch {
      throw invalidProviderResponse(this.provider)
    }

    const envelope = CodeforcesUserStatusEnvelopeSchema.safeParse(body)

    if (!envelope.success) {
      throw invalidProviderResponse(this.provider)
    }

    if (envelope.data.status === 'FAILED') {
      const accountNotFound = /not found/i.test(envelope.data.comment)
      const rateLimited = /call limit exceeded/i.test(envelope.data.comment)

      throw new ProviderPublicStatsError(
        accountNotFound
          ? 'The Codeforces account was not found.'
          : 'Codeforces rejected the public-statistics request.',
        {
          provider: this.provider,
          code: accountNotFound
            ? 'PROVIDER_ACCOUNT_NOT_FOUND'
            : rateLimited
              ? 'PROVIDER_RATE_LIMITED'
              : 'PROVIDER_UNAVAILABLE',
          retryable: rateLimited,
        },
      )
    }

    const acceptedProblemIds = new Set<string>()
    let invalidSubmissionCount = 0

    for (const rawSubmission of envelope.data.result) {
      const submission = CodeforcesSubmissionSchema.safeParse(rawSubmission)

      if (!submission.success) {
        invalidSubmissionCount += 1
        continue
      }

      if (submission.data.verdict !== 'OK') {
        continue
      }

      const { contestId, index, problemsetName } = submission.data.problem
      const problemId =
        contestId === undefined
          ? problemsetName === undefined
            ? null
            : `problemset:${problemsetName}:${index}`
          : `contest:${contestId}:${index}`

      if (problemId === null) {
        invalidSubmissionCount += 1
      } else {
        acceptedProblemIds.add(problemId)
      }
    }

    return {
      solvedCount: acceptedProblemIds.size,
      complete:
        envelope.data.result.length < this.maxSubmissions &&
        invalidSubmissionCount === 0,
      source: 'codeforces_api' as const,
      fetchedAt: this.now(),
    }
  }
}
