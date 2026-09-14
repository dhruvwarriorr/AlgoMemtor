import { z } from 'zod'

import {
  ContestParticipationSchema,
  ProviderRatingChangeSchema,
  ProviderSolvedProblemSchema,
  type ContestParticipation,
  type ProviderRatingChange,
  type ProviderSolvedProblem,
  type ProviderSubmission,
  type PublicProviderHandle,
} from '@algomemtor/shared-contracts'

import { isCodeChefChallengePage } from './codechef-public-stats.js'
import { ProviderPublicStatsError } from './provider-public-stats.js'
import {
  fetchProviderText,
  isProviderHostnameAllowed,
  type ProviderHttpRequest,
} from '../providers/provider-http-client.js'
import { RequestGate } from '../../utils/request-gate.js'
import type {
  ProviderActivityDataFetchResult,
  ProviderActivityDataFetcher,
} from './provider-public-stats.js'

const ratingEntrySchema = z.object({
  rating: z.union([z.number(), z.string()]).optional(),
  rating_change: z.union([z.number(), z.string()]).optional(),
  contest_code: z.string().trim().max(128).optional(),
  name: z.string().trim().max(512).optional(),
  date: z.string().trim().max(64).optional(),
  end_date: z.string().trim().max(64).optional(),
  getyear: z.string().trim().max(4).optional(),
  getmonth: z.string().trim().max(2).optional(),
  getday: z.string().trim().max(2).optional(),
  rank: z.union([z.number(), z.string()]).optional(),
})

const numberFrom = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const dateFrom = (value: unknown) => {
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

const ratingDate = (entry: z.infer<typeof ratingEntrySchema>) => {
  const explicit = dateFrom(entry.date ?? entry.end_date)
  if (explicit !== null) return explicit
  if (
    entry.getyear === undefined ||
    entry.getmonth === undefined ||
    entry.getday === undefined
  ) {
    return null
  }
  const year = Number(entry.getyear)
  const month = Number(entry.getmonth)
  const day = Number(entry.getday)
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null
  }
  const parsed = new Date(Date.UTC(year, month - 1, day, 22))
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

const extractRatingEntries = (html: string) => {
  const match =
    /(?:var\s+all_rating|ratingData|rating_data|ratingHistory)\s*[:=]\s*(\[[\s\S]*?\])\s*[,;]/i.exec(
      html,
    )
  if (match?.[1] === undefined) return []
  try {
    const value = JSON.parse(match[1]) as unknown
    return Array.isArray(value)
      ? value.flatMap((entry) => {
          const parsed = ratingEntrySchema.safeParse(entry)
          return parsed.success ? [parsed.data] : []
        })
      : []
  } catch {
    return []
  }
}

const problemCodesFromHtml = (html: string) => {
  const values = new Set<string>()
  const pattern =
    /(?:href\s*=\s*["']|https?:\/\/www\.codechef\.com)\/?problems\/([A-Za-z0-9_+-]+)/gi
  for (const match of html.matchAll(pattern)) {
    const code = match[1]?.trim().toUpperCase()
    if (code !== undefined && code.length <= 64) values.add(code)
  }
  return [...values]
}

const problemUrl = (code: string) =>
  `https://www.codechef.com/problems/${encodeURIComponent(code)}`

export type CodeChefActivityFetcherOptions = {
  baseUrl?: string
  timeoutMs?: number
  maxAttempts?: number
  requestGate?: RequestGate
  fetchImpl?: typeof fetch
}

export class CodeChefActivityFetcher implements ProviderActivityDataFetcher {
  readonly provider = 'codechef' as const

  private readonly baseUrl: URL
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly requestGate: RequestGate
  private readonly fetchImpl: typeof fetch

  constructor(options: CodeChefActivityFetcherOptions = {}) {
    this.baseUrl = new URL(options.baseUrl ?? 'https://www.codechef.com/users/')
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxAttempts = options.maxAttempts ?? 2
    this.requestGate =
      options.requestGate ?? new RequestGate({ minIntervalMs: 1000 })
    this.fetchImpl = options.fetchImpl ?? fetch
    const hasCustomFetch = options.fetchImpl !== undefined
    if (
      this.baseUrl.protocol !== 'https:' ||
      !isProviderHostnameAllowed(
        this.provider,
        this.baseUrl.hostname,
        'www.codechef.com',
        hasCustomFetch,
      ) ||
      this.baseUrl.username !== '' ||
      this.baseUrl.password !== '' ||
      this.baseUrl.port !== '' ||
      this.baseUrl.search !== '' ||
      this.baseUrl.hash !== '' ||
      !this.baseUrl.pathname.endsWith('/users/') ||
      this.timeoutMs <= 0
    ) {
      throw new Error('The CodeChef activity configuration is unsafe.')
    }
  }

  async fetchActivityData(
    handle: PublicProviderHandle,
    signal?: AbortSignal,
  ): Promise<ProviderActivityDataFetchResult> {
    const profileUrl = new URL(encodeURIComponent(handle), this.baseUrl)
    const html = await fetchProviderText({
      provider: this.provider,
      url: profileUrl,
      allowedHostname: 'www.codechef.com',
      requestGate: this.requestGate,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maxAttempts: this.maxAttempts,
      maxResponseBytes: 4_000_000,
      ...(signal === undefined ? {} : { signal }),
    } satisfies ProviderHttpRequest)
    if (isCodeChefChallengePage(html)) {
      throw new ProviderPublicStatsError(
        'CodeChef blocked public activity data.',
        {
          provider: this.provider,
          code: 'PROVIDER_BLOCKED',
          retryable: false,
        },
      )
    }

    const fetchedAt = new Date()
    const sourceUrl = profileUrl.toString()
    const solvedProblems: ProviderSolvedProblem[] = problemCodesFromHtml(
      html,
    ).map((externalId) => {
      const canonicalUrl = problemUrl(externalId)
      return ProviderSolvedProblemSchema.parse({
        provider: this.provider,
        externalId,
        canonicalUrl,
        occurredAt: null,
        firstObservedAt: fetchedAt.toISOString(),
        lastObservedAt: fetchedAt.toISOString(),
        completeness: 'partial',
        provenance: {
          provider: this.provider,
          providerId: externalId,
          canonicalUrl,
          sourceUrl,
          extractionStrategy: 'sanitized_html',
          schemaVersion: 'codechef-profile-solved-links-v1',
          completeness: 'partial',
          fetchedAt: fetchedAt.toISOString(),
          stale: false,
        },
      })
    })

    const ratingEntries = extractRatingEntries(html)
      .map((entry, index) => ({
        entry,
        index,
        rating: numberFrom(entry.rating),
        occurredAt: ratingDate(entry),
      }))
      .filter((entry) => entry.rating !== undefined)
      .sort(
        (left, right) =>
          (left.occurredAt?.getTime() ?? 0) -
          (right.occurredAt?.getTime() ?? 0),
      )
    const ratingChanges: ProviderRatingChange[] = []
    const contestParticipations: ContestParticipation[] = []
    let previousRating: number | undefined
    for (const item of ratingEntries) {
      const rating = item.rating
      if (rating === undefined) continue
      const occurredAt = item.occurredAt ?? fetchedAt
      const contestId = item.entry.contest_code ?? `rating-${item.index}`
      const eventId = `contest:${contestId}:${occurredAt.toISOString()}`
      const oldRating =
        previousRating ?? rating - (numberFrom(item.entry.rating_change) ?? 0)
      const delta = rating - oldRating
      ratingChanges.push(
        ProviderRatingChangeSchema.parse({
          provider: this.provider,
          eventId,
          contestId,
          ...(item.entry.name === undefined
            ? {}
            : { contestName: item.entry.name }),
          occurredAt: occurredAt.toISOString(),
          oldRating,
          newRating: rating,
          delta,
          provenance: {
            provider: this.provider,
            providerId: eventId,
            canonicalUrl: `https://www.codechef.com/contests/${encodeURIComponent(contestId)}`,
            sourceUrl,
            extractionStrategy: 'embedded_json',
            schemaVersion: 'codechef-rating-history-v1',
            completeness: 'partial',
            fetchedAt: fetchedAt.toISOString(),
            stale: false,
          },
        }),
      )
      contestParticipations.push(
        ContestParticipationSchema.parse({
          provider: this.provider,
          contestId,
          ...(item.entry.name === undefined
            ? {}
            : { contestName: item.entry.name }),
          ...(numberFrom(item.entry.rank) === undefined
            ? {}
            : {
                rank: Math.max(1, Math.floor(numberFrom(item.entry.rank) ?? 1)),
              }),
          attendedAt: occurredAt.toISOString(),
          ratingChange: delta,
          oldRating,
          newRating: rating,
          provenance: {
            provider: this.provider,
            providerId: eventId,
            canonicalUrl: `https://www.codechef.com/contests/${encodeURIComponent(contestId)}`,
            sourceUrl,
            extractionStrategy: 'embedded_json',
            schemaVersion: 'codechef-rating-history-v1',
            completeness: 'partial',
            fetchedAt: fetchedAt.toISOString(),
            stale: false,
          },
        }),
      )
      previousRating = rating
    }

    const submissions: ProviderSubmission[] = []
    return {
      submissions,
      solvedProblems,
      ratingChanges,
      contestParticipations,
      complete: false,
      fetchedAt,
    }
  }
}
