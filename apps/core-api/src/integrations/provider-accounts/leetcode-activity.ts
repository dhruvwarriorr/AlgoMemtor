import { z } from 'zod'

import {
  ContestParticipationSchema,
  ProviderRatingChangeSchema,
  ProviderSolvedProblemSchema,
  ProviderSubmissionSchema,
  type ContestParticipation,
  type ProviderRatingChange,
  type ProviderSolvedProblem,
  type ProviderSubmission,
  type PublicProviderHandle,
} from '@algomemtor/shared-contracts'

import { ProviderError } from '../../errors/provider-error.js'
import { RequestGate } from '../../utils/request-gate.js'
import {
  fetchProviderJson,
  isProviderHostnameAllowed,
  type ProviderHttpRequest,
} from '../providers/provider-http-client.js'
import {
  type ProviderActivityDataFetchResult,
  type ProviderActivityDataFetcher,
} from './provider-public-stats.js'

const RecentSubmissionSchema = z.object({
  title: z.string().trim().min(1).max(512).nullish(),
  titleSlug: z.string().trim().min(1).max(256).nullish(),
  timestamp: z.union([z.string(), z.number()]).nullish(),
  statusDisplay: z.string().trim().max(64).nullish(),
  lang: z.string().trim().max(128).nullish(),
})

const RecentSubmissionEnvelopeSchema = z.object({
  data: z
    .object({
      recentSubmissionList: z.array(z.unknown()).nullable().optional(),
    })
    .optional(),
  errors: z.array(z.object({ message: z.string().max(1000) })).optional(),
})

const ContestHistorySchema = z.object({
  attended: z.boolean().optional(),
  rating: z.number().finite().optional(),
  ranking: z.number().int().positive().optional(),
  contest: z
    .object({
      title: z.string().trim().min(1).max(512).optional(),
      startTime: z.union([z.string(), z.number()]).optional(),
    })
    .nullable()
    .optional(),
})

const ContestHistoryEnvelopeSchema = z.object({
  data: z
    .object({
      userContestRankingHistory: z.array(z.unknown()).nullable().optional(),
    })
    .optional(),
  errors: z.array(z.object({ message: z.string().max(1000) })).optional(),
})

const recentSubmissionsQuery = `query recentSubmissionList($username: String!, $limit: Int!) { recentSubmissionList(username: $username, limit: $limit) { title titleSlug timestamp statusDisplay lang } }`
const contestHistoryQuery = `query userContestHistory($username: String!) { userContestRankingHistory(username: $username) { attended rating ranking contest { title startTime } } }`

const timestampToDate = (value: string | number | null | undefined) => {
  if (value === undefined || value === null) return null
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  const date = new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
  return Number.isFinite(date.getTime()) ? date : null
}

const problemUrl = (titleSlug: string | undefined) =>
  titleSlug === undefined
    ? 'https://leetcode.com/problemset/'
    : `https://leetcode.com/problems/${encodeURIComponent(titleSlug)}/`

const activityError = (message: string) =>
  new ProviderError(message, {
    code: 'PROVIDER_INVALID_RESPONSE',
    provider: 'leetcode',
    retryable: false,
  })

export type LeetCodeActivityFetcherOptions = {
  endpoint?: string
  timeoutMs?: number
  maxAttempts?: number
  recentLimit?: number
  requestGate?: RequestGate
  fetchImpl?: typeof fetch
}

export class LeetCodeActivityFetcher implements ProviderActivityDataFetcher {
  readonly provider = 'leetcode' as const

  private readonly endpoint: URL
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly recentLimit: number
  private readonly requestGate: RequestGate
  private readonly fetchImpl: typeof fetch

  constructor(options: LeetCodeActivityFetcherOptions = {}) {
    this.endpoint = new URL(options.endpoint ?? 'https://leetcode.com/graphql')
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxAttempts = options.maxAttempts ?? 2
    this.recentLimit = Math.min(Math.max(options.recentLimit ?? 100, 1), 200)
    this.requestGate =
      options.requestGate ?? new RequestGate({ minIntervalMs: 1000 })
    this.fetchImpl = options.fetchImpl ?? fetch
    const hasCustomFetch = options.fetchImpl !== undefined
    if (
      this.endpoint.protocol !== 'https:' ||
      !isProviderHostnameAllowed(
        this.provider,
        this.endpoint.hostname,
        'leetcode.com',
        hasCustomFetch,
      ) ||
      this.endpoint.username !== '' ||
      this.endpoint.password !== '' ||
      this.endpoint.port !== '' ||
      this.endpoint.search !== '' ||
      this.endpoint.hash !== '' ||
      this.endpoint.pathname !== '/graphql' ||
      this.timeoutMs <= 0
    ) {
      throw new Error('The LeetCode activity configuration is unsafe.')
    }
  }

  private async request(
    query: string,
    variables: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    return fetchProviderJson({
      provider: this.provider,
      url: this.endpoint,
      allowedHostname: 'leetcode.com',
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        referer: 'https://leetcode.com/',
      },
      body: JSON.stringify({ query, variables }),
      requestGate: this.requestGate,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxAttempts: this.maxAttempts,
      maxResponseBytes: 2_000_000,
      ...(signal === undefined ? {} : { signal }),
    } satisfies ProviderHttpRequest)
  }

  async fetchActivityData(
    handle: PublicProviderHandle,
    signal?: AbortSignal,
  ): Promise<ProviderActivityDataFetchResult> {
    const fetchedAt = new Date()
    const submissions: ProviderSubmission[] = []
    const solvedByProblem = new Map<
      string,
      { occurredAt: Date | null; eventId?: string; titleSlug: string }
    >()
    let complete = true
    let invalid = 0

    const recentBody = await this.request(
      recentSubmissionsQuery,
      { username: handle, limit: this.recentLimit },
      signal,
    )
    const recentEnvelope = RecentSubmissionEnvelopeSchema.safeParse(recentBody)
    if (!recentEnvelope.success || recentEnvelope.data.errors?.length) {
      throw activityError(
        'LeetCode returned an invalid recent-submission response.',
      )
    }
    const recent = recentEnvelope.data.data?.recentSubmissionList
    if (recent === null || recent === undefined) {
      throw activityError(
        'LeetCode did not return public submissions for this handle.',
      )
    }
    if (recent.length >= this.recentLimit) complete = false

    for (const [index, raw] of recent.entries()) {
      const parsed = RecentSubmissionSchema.safeParse(raw)
      if (
        !parsed.success ||
        parsed.data.titleSlug === undefined ||
        parsed.data.titleSlug === null
      ) {
        invalid += 1
        continue
      }
      const occurredAt = timestampToDate(parsed.data.timestamp)
      if (
        parsed.data.timestamp !== undefined &&
        parsed.data.timestamp !== null &&
        occurredAt === null
      )
        invalid += 1
      const externalId = parsed.data.titleSlug
      const eventId = `recent:${externalId}:${parsed.data.timestamp ?? index}`
      const canonicalUrl = problemUrl(parsed.data.titleSlug)
      const verdict = parsed.data.statusDisplay?.trim() || 'UNKNOWN'
      const submission = ProviderSubmissionSchema.parse({
        provider: this.provider,
        externalId,
        eventId,
        ...(parsed.data.title === undefined
          ? {}
          : { problemTitle: parsed.data.title }),
        canonicalUrl,
        verdict,
        ...(parsed.data.lang?.trim()
          ? { language: parsed.data.lang.trim() }
          : {}),
        ...(occurredAt === null
          ? {}
          : { occurredAt: occurredAt.toISOString() }),
        isAccepted: verdict.toLowerCase() === 'accepted',
        completeness: 'partial',
        provenance: {
          provider: this.provider,
          providerId: eventId,
          canonicalUrl,
          sourceUrl: this.endpoint.toString(),
          extractionStrategy: 'public_graphql',
          schemaVersion: 'leetcode-recent-submissions-v1',
          completeness: 'partial',
          fetchedAt: fetchedAt.toISOString(),
          stale: false,
        },
      })
      submissions.push(submission)
      if (submission.isAccepted) {
        const existing = solvedByProblem.get(externalId)
        if (
          existing === undefined ||
          (occurredAt !== null &&
            (existing.occurredAt === null ||
              occurredAt.getTime() < existing.occurredAt.getTime()))
        ) {
          solvedByProblem.set(externalId, {
            occurredAt,
            eventId,
            titleSlug: parsed.data.titleSlug,
          })
        }
      }
    }

    const solvedProblems: ProviderSolvedProblem[] = [...solvedByProblem].map(
      ([externalId, value]) => {
        const canonicalUrl = problemUrl(value.titleSlug)
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
          completeness: 'partial',
          provenance: {
            provider: this.provider,
            providerId: externalId,
            canonicalUrl,
            sourceUrl: this.endpoint.toString(),
            extractionStrategy: 'public_graphql',
            schemaVersion: 'leetcode-solved-observation-v1',
            completeness: 'partial',
            fetchedAt: fetchedAt.toISOString(),
            stale: false,
          },
        })
      },
    )

    let ratingChanges: ProviderRatingChange[] = []
    let contestParticipations: ContestParticipation[] = []
    try {
      const contestBody = await this.request(
        contestHistoryQuery,
        { username: handle },
        signal,
      )
      const contestEnvelope =
        ContestHistoryEnvelopeSchema.safeParse(contestBody)
      if (!contestEnvelope.success || contestEnvelope.data.errors?.length) {
        complete = false
      } else {
        const history = contestEnvelope.data.data?.userContestRankingHistory
        if (history === null || history === undefined) {
          complete = false
        } else {
          const entries = history.flatMap((raw) => {
            const parsed = ContestHistorySchema.safeParse(raw)
            return parsed.success &&
              parsed.data.attended === true &&
              parsed.data.rating !== undefined
              ? [parsed.data]
              : []
          })
          const ordered = entries
            .map((entry, index) => ({
              entry,
              index,
              occurredAt: timestampToDate(entry.contest?.startTime),
            }))
            .sort(
              (left, right) =>
                (left.occurredAt?.getTime() ?? 0) -
                (right.occurredAt?.getTime() ?? 0),
            )
          let previousRating: number | undefined
          for (const item of ordered) {
            const rating = item.entry.rating
            if (rating === undefined) continue
            const occurredAt = item.occurredAt ?? fetchedAt
            const contestName = item.entry.contest?.title
            const eventId = `contest:${contestName ?? 'unknown'}:${occurredAt.toISOString()}:${item.index}`
            if (previousRating !== undefined) {
              ratingChanges.push(
                ProviderRatingChangeSchema.parse({
                  provider: this.provider,
                  eventId,
                  ...(contestName === undefined ? {} : { contestName }),
                  occurredAt: occurredAt.toISOString(),
                  oldRating: previousRating,
                  newRating: rating,
                  delta: rating - previousRating,
                  provenance: {
                    provider: this.provider,
                    providerId: eventId,
                    canonicalUrl: 'https://leetcode.com/contest/',
                    sourceUrl: this.endpoint.toString(),
                    extractionStrategy: 'public_graphql',
                    schemaVersion: 'leetcode-contest-history-v1',
                    completeness: 'partial',
                    fetchedAt: fetchedAt.toISOString(),
                    stale: false,
                  },
                }),
              )
            }
            const participation = ContestParticipationSchema.parse({
              provider: this.provider,
              contestId: eventId,
              ...(contestName === undefined ? {} : { contestName }),
              ...(item.entry.ranking === undefined
                ? {}
                : { rank: item.entry.ranking }),
              attendedAt: occurredAt.toISOString(),
              provenance: {
                provider: this.provider,
                providerId: eventId,
                canonicalUrl: 'https://leetcode.com/contest/',
                sourceUrl: this.endpoint.toString(),
                extractionStrategy: 'public_graphql',
                schemaVersion: 'leetcode-contest-history-v1',
                completeness: 'partial',
                fetchedAt: fetchedAt.toISOString(),
                stale: false,
              },
            })
            contestParticipations.push(participation)
            previousRating = rating
          }
        }
      }
    } catch {
      complete = false
    }

    return {
      submissions,
      solvedProblems,
      ratingChanges,
      contestParticipations,
      complete: complete && invalid === 0,
      fetchedAt,
    }
  }
}
