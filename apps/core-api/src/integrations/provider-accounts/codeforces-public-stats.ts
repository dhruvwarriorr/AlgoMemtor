import { z } from 'zod'

import { RequestGate } from '../../utils/request-gate.js'
import { createCodeforcesExternalId } from '../codeforces/codeforces-normalizer.js'
import {
  fetchWithTimeout,
  invalidProviderResponse,
  readLimitedResponseText,
  throwForProviderHttpStatus,
  waitForProviderRequest,
} from './provider-fetch-utils.js'
import {
  ProviderPublicStatsError,
  type ProviderVerifiedActivityFetcher,
  type ProviderVerifiedActivityFetchResult,
  type ProviderPublicStatsFetcher,
} from './provider-public-stats.js'

const CodeforcesSubmissionSchema = z.object({
  id: z.number().int().positive().optional(),
  creationTimeSeconds: z.number().int().positive().optional(),
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
  maxAttempts?: number
  retryBaseDelayMs?: number
  fetchImpl?: typeof fetch
  requestGate?: RequestGate
  now?: () => Date
}

export class CodeforcesPublicStatsFetcher
  implements ProviderPublicStatsFetcher, ProviderVerifiedActivityFetcher
{
  readonly provider = 'codeforces' as const

  private readonly endpoint: URL
  private readonly timeoutMs: number
  private readonly maxSubmissions: number
  private readonly maxAttempts: number
  private readonly retryBaseDelayMs: number
  private readonly fetchImpl: typeof fetch
  private readonly requestGate: RequestGate
  private readonly now: () => Date

  constructor(options: CodeforcesPublicStatsOptions = {}) {
    const baseUrl = options.baseUrl ?? 'https://codeforces.com/api'
    this.endpoint = new URL('user.status', `${baseUrl.replace(/\/+$/, '')}/`)
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxSubmissions = options.maxSubmissions ?? 10_000
    this.maxAttempts = options.maxAttempts ?? 2
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 250
    this.fetchImpl = options.fetchImpl ?? fetch
    this.requestGate =
      options.requestGate ?? new RequestGate({ minIntervalMs: 2100 })
    this.now = options.now ?? (() => new Date())

    if (
      this.endpoint.protocol !== 'https:' ||
      this.timeoutMs <= 0 ||
      !Number.isInteger(this.maxSubmissions) ||
      this.maxSubmissions < 1 ||
      this.maxSubmissions > 100_000 ||
      !Number.isInteger(this.maxAttempts) ||
      this.maxAttempts < 1 ||
      !Number.isFinite(this.retryBaseDelayMs) ||
      this.retryBaseDelayMs < 0
    ) {
      throw new Error('The Codeforces public-statistics config is invalid.')
    }
  }

  private async fetchStatus(handle: string, signal?: AbortSignal) {
    let lastError: ProviderPublicStatsError | undefined
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        return await this.fetchStatusOnce(handle, signal)
      } catch (error) {
        if (!(error instanceof ProviderPublicStatsError)) throw error
        lastError = error
        const shouldRetry =
          error.retryable &&
          error.code !== 'PROVIDER_RATE_LIMITED' &&
          attempt < this.maxAttempts
        if (!shouldRetry) throw error
        const backoffMs =
          this.retryBaseDelayMs * 2 ** (attempt - 1) +
          Math.floor(Math.random() * this.retryBaseDelayMs)
        try {
          await new Promise<void>((resolve, reject) => {
            let timeout: ReturnType<typeof setTimeout>
            const cleanup = () => {
              if (signal !== undefined) {
                signal.removeEventListener('abort', abort)
              }
            }
            const finish = () => {
              cleanup()
              resolve()
            }
            const abort = () => {
              clearTimeout(timeout)
              cleanup()
              reject(signal?.reason ?? new Error('The request was aborted.'))
            }
            timeout = setTimeout(finish, backoffMs)
            if (signal === undefined) return
            if (signal.aborted) {
              abort()
              return
            }
            signal.addEventListener('abort', abort, { once: true })
          })
        } catch (error) {
          throw new ProviderPublicStatsError(
            'The Codeforces public-statistics request was cancelled.',
            {
              provider: this.provider,
              code: 'PROVIDER_UNAVAILABLE',
              retryable: false,
              cause: error,
            },
          )
        }
      }
    }
    throw lastError ?? invalidProviderResponse(this.provider)
  }

  private async fetchStatusOnce(handle: string, signal?: AbortSignal) {
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

    return {
      result: envelope.data.result,
    }
  }

  private normalizeSubmissions(result: readonly unknown[]) {
    const acceptedProblemIds = new Set<string>()
    const acceptedByProblem = new Map<
      string,
      { eventId: string; occurredAt: Date }
    >()
    let invalidSubmissionCount = 0
    let invalidActivityCount = 0

    for (const rawSubmission of result) {
      const submission = CodeforcesSubmissionSchema.safeParse(rawSubmission)

      if (!submission.success) {
        invalidSubmissionCount += 1
        invalidActivityCount += 1
        continue
      }

      const { contestId, index, problemsetName } = submission.data.problem
      const problemId = createCodeforcesExternalId({
        ...(contestId === undefined ? {} : { contestId }),
        ...(problemsetName === undefined ? {} : { problemsetName }),
        index,
      })

      if (submission.data.verdict !== 'OK') {
        continue
      }

      if (problemId === undefined) {
        invalidSubmissionCount += 1
        continue
      }

      acceptedProblemIds.add(problemId)

      if (
        submission.data.id === undefined ||
        submission.data.creationTimeSeconds === undefined
      ) {
        invalidActivityCount += 1
        continue
      }

      const occurredAt = new Date(submission.data.creationTimeSeconds * 1000)
      if (!Number.isFinite(occurredAt.getTime())) {
        invalidActivityCount += 1
        continue
      }

      const existing = acceptedByProblem.get(problemId)
      if (
        existing === undefined ||
        occurredAt.getTime() < existing.occurredAt.getTime()
      ) {
        acceptedByProblem.set(problemId, {
          eventId: String(submission.data.id),
          occurredAt,
        })
      }
    }

    return {
      acceptedByProblem,
      acceptedProblemIds,
      complete:
        result.length < this.maxSubmissions && invalidSubmissionCount === 0,
      activityComplete:
        result.length < this.maxSubmissions &&
        invalidSubmissionCount + invalidActivityCount === 0,
    }
  }

  async fetchVerifiedActivity(
    handle: string,
    signal?: AbortSignal,
  ): Promise<ProviderVerifiedActivityFetchResult> {
    const { result } = await this.fetchStatus(handle, signal)
    const normalized = this.normalizeSubmissions(result)

    return {
      events: [...normalized.acceptedByProblem.entries()].map(
        ([externalId, value]) => ({
          externalId,
          providerEventId: value.eventId,
          occurredAt: value.occurredAt,
        }),
      ),
      complete: normalized.activityComplete,
      fetchedAt: this.now(),
    }
  }

  async fetchSolvedCount(handle: string, signal?: AbortSignal) {
    const { result } = await this.fetchStatus(handle, signal)
    const normalized = this.normalizeSubmissions(result)

    return {
      solvedCount: normalized.acceptedProblemIds.size,
      complete: normalized.complete,
      source: 'codeforces_api' as const,
      fetchedAt: this.now(),
    }
  }
}
