import { z } from 'zod'
import {
  ProviderRatingChangeSchema,
  ProviderSolvedProblemSchema,
  ProviderSubmissionSchema,
  type ProviderRatingChange,
  type ProviderSubmission,
} from '@algomemtor/shared-contracts'

import { RequestGate } from '../../utils/request-gate.js'
import { createCodeforcesExternalId } from '../codeforces/codeforces-normalizer.js'
import {
  fetchWithTimeout,
  invalidProviderResponse,
  readLimitedResponseText,
  throwForProviderHttpStatus,
  waitForProviderRequest,
} from './provider-fetch-utils.js'
import { isProviderHostnameAllowed } from '../providers/provider-http-client.js'
import {
  ProviderPublicStatsError,
  type ProviderVerifiedActivityFetcher,
  type ProviderVerifiedActivityFetchResult,
  type ProviderActivityDataFetchResult,
  type ProviderActivityDataFetcher,
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
  implements
    ProviderPublicStatsFetcher,
    ProviderVerifiedActivityFetcher,
    ProviderActivityDataFetcher
{
  readonly provider = 'codeforces' as const

  private readonly endpoint: URL
  private readonly ratingEndpoint: URL
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
    this.ratingEndpoint = new URL(
      'user.rating',
      `${baseUrl.replace(/\/+$/, '')}/`,
    )
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxSubmissions = options.maxSubmissions ?? 10_000
    this.maxAttempts = options.maxAttempts ?? 2
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 250
    this.fetchImpl = options.fetchImpl ?? fetch
    this.requestGate =
      options.requestGate ?? new RequestGate({ minIntervalMs: 2100 })
    this.now = options.now ?? (() => new Date())
    const testHostAllowed = isProviderHostnameAllowed(
      this.provider,
      this.endpoint.hostname,
      'codeforces.com',
      options.fetchImpl !== undefined,
    )

    if (
      this.endpoint.protocol !== 'https:' ||
      !testHostAllowed ||
      this.endpoint.username !== '' ||
      this.endpoint.password !== '' ||
      this.endpoint.port !== '' ||
      this.endpoint.search !== '' ||
      this.endpoint.hash !== '' ||
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

  async fetchActivityData(
    handle: string,
    signal?: AbortSignal,
  ): Promise<ProviderActivityDataFetchResult> {
    const { result } = await this.fetchStatus(handle, signal)
    const fetchedAt = this.now()
    const sourceUrl = new URL(this.endpoint)
    sourceUrl.searchParams.set('handle', handle)
    sourceUrl.searchParams.set('from', '1')
    sourceUrl.searchParams.set('count', String(this.maxSubmissions))
    const submissions: ProviderSubmission[] = []
    const solvedByProblem = new Map<
      string,
      { occurredAt: Date | null; eventId?: string }
    >()
    let invalid = 0
    for (const raw of result) {
      const parsed = CodeforcesSubmissionSchema.safeParse(raw)
      if (!parsed.success) {
        invalid += 1
        continue
      }
      const { contestId, index, problemsetName } = parsed.data.problem
      const externalId = createCodeforcesExternalId({
        ...(contestId === undefined ? {} : { contestId }),
        ...(problemsetName === undefined ? {} : { problemsetName }),
        index,
      })
      if (externalId === undefined) {
        invalid += 1
        continue
      }
      const canonicalUrl =
        contestId === undefined
          ? 'https://codeforces.com/problemset'
          : `https://codeforces.com/problemset/problem/${contestId}/${encodeURIComponent(index.trim().toUpperCase())}`
      const occurredAt =
        parsed.data.creationTimeSeconds === undefined
          ? null
          : new Date(parsed.data.creationTimeSeconds * 1000)
      const validOccurredAt =
        occurredAt === null || Number.isFinite(occurredAt.getTime())
          ? occurredAt
          : null
      const eventId =
        parsed.data.id === undefined
          ? `${externalId}:${parsed.data.creationTimeSeconds ?? 'unknown'}:${parsed.data.verdict ?? 'unknown'}`
          : String(parsed.data.id)
      const verdict = parsed.data.verdict?.trim() || 'UNKNOWN'
      const submission = ProviderSubmissionSchema.parse({
        provider: this.provider,
        externalId,
        eventId,
        canonicalUrl,
        verdict,
        ...(validOccurredAt === null
          ? {}
          : { occurredAt: validOccurredAt.toISOString() }),
        isAccepted: verdict === 'OK',
        completeness:
          result.length < this.maxSubmissions && invalid === 0
            ? 'complete'
            : 'partial',
        provenance: {
          provider: this.provider,
          providerId: eventId,
          canonicalUrl,
          sourceUrl: sourceUrl.toString(),
          extractionStrategy: 'official_json',
          schemaVersion: 'codeforces-user-status-v2',
          completeness:
            result.length < this.maxSubmissions && invalid === 0
              ? 'complete'
              : 'partial',
          fetchedAt: fetchedAt.toISOString(),
          stale: false,
        },
      })
      submissions.push(submission)
      if (submission.isAccepted) {
        const existing = solvedByProblem.get(externalId)
        if (
          existing === undefined ||
          (validOccurredAt !== null &&
            (existing.occurredAt === null ||
              validOccurredAt.getTime() < existing.occurredAt.getTime()))
        ) {
          solvedByProblem.set(externalId, {
            occurredAt: validOccurredAt,
            ...(parsed.data.id === undefined
              ? {}
              : { eventId: String(parsed.data.id) }),
          })
        }
      }
    }
    const solvedProblems = [...solvedByProblem.entries()].map(
      ([externalId, value]) => {
        const canonicalUrl =
          submissions.find((submission) => submission.externalId === externalId)
            ?.canonicalUrl ?? 'https://codeforces.com/problemset'
        return ProviderSolvedProblemSchema.parse({
          provider: this.provider,
          externalId,
          canonicalUrl,
          occurredAt: value.occurredAt?.toISOString() ?? null,
          firstObservedAt: fetchedAt.toISOString(),
          lastObservedAt: fetchedAt.toISOString(),
          ...(value.eventId === undefined
            ? {}
            : { sourceSubmissionId: value.eventId }),
          completeness:
            result.length < this.maxSubmissions && invalid === 0
              ? 'complete'
              : 'partial',
          provenance: {
            provider: this.provider,
            providerId: externalId,
            canonicalUrl,
            sourceUrl: sourceUrl.toString(),
            extractionStrategy: 'official_json',
            schemaVersion: 'codeforces-solved-observation-v1',
            completeness:
              result.length < this.maxSubmissions && invalid === 0
                ? 'complete'
                : 'partial',
            fetchedAt: fetchedAt.toISOString(),
            stale: false,
          },
        })
      },
    )
    let ratingChanges: ProviderRatingChange[] = []
    try {
      const ratingResult = await this.fetchRating(handle, signal)
      ratingChanges = ratingResult.map((change) =>
        ProviderRatingChangeSchema.parse(change),
      )
    } catch {
      // The activity feed remains useful when the optional rating endpoint is
      // unavailable; completeness communicates the missing dimension.
    }
    const contestParticipations = ratingChanges.map((change) => ({
      provider: this.provider,
      contestId: change.contestId ?? change.eventId,
      ...(change.contestName === undefined
        ? {}
        : { contestName: change.contestName }),
      attendedAt: change.occurredAt,
      ratingChange: change.delta,
      oldRating: change.oldRating,
      newRating: change.newRating,
      provenance: change.provenance,
    }))
    return {
      submissions,
      solvedProblems,
      ratingChanges,
      contestParticipations,
      complete: result.length < this.maxSubmissions && invalid === 0,
      fetchedAt,
    }
  }

  private async fetchRating(handle: string, signal?: AbortSignal) {
    const endpoint = new URL(this.ratingEndpoint)
    endpoint.searchParams.set('handle', handle)
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
      2_000_000,
    )
    let body: unknown
    try {
      body = JSON.parse(text) as unknown
    } catch {
      throw invalidProviderResponse(this.provider)
    }
    const envelope = z
      .union([
        z.object({ status: z.literal('OK'), result: z.array(z.unknown()) }),
        z.object({
          status: z.literal('FAILED'),
          comment: z.string().max(1000),
        }),
      ])
      .safeParse(body)
    if (!envelope.success || envelope.data.status === 'FAILED') {
      throw invalidProviderResponse(this.provider)
    }
    return envelope.data.result.flatMap((raw) => {
      const row = z
        .object({
          contestId: z.number().int().positive(),
          contestName: z.string().trim().min(1),
          handle: z.string().trim().min(1).optional(),
          rank: z.number().int().positive().optional(),
          ratingUpdateTimeSeconds: z.number().int().positive(),
          oldRating: z.number().finite(),
          newRating: z.number().finite(),
        })
        .safeParse(raw)
      if (!row.success) return []
      const occurredAt = new Date(row.data.ratingUpdateTimeSeconds * 1000)
      if (!Number.isFinite(occurredAt.getTime())) return []
      const eventId = String(row.data.contestId)
      return [
        ProviderRatingChangeSchema.parse({
          provider: this.provider,
          eventId,
          contestId: String(row.data.contestId),
          contestName: row.data.contestName,
          occurredAt: occurredAt.toISOString(),
          oldRating: row.data.oldRating,
          newRating: row.data.newRating,
          delta: row.data.newRating - row.data.oldRating,
          provenance: {
            provider: this.provider,
            providerId: eventId,
            canonicalUrl: `https://codeforces.com/contest/${row.data.contestId}`,
            sourceUrl: endpoint.toString(),
            extractionStrategy: 'official_json',
            schemaVersion: 'codeforces-user-rating-v1',
            completeness: 'complete',
            fetchedAt: this.now().toISOString(),
            stale: false,
          },
        }),
      ]
    })
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
