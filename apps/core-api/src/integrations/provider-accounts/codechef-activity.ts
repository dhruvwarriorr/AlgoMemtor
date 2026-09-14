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

import { isCodeChefChallengePage } from './codechef-public-stats.js'
import { ProviderPublicStatsError } from './provider-public-stats.js'
import {
  fetchProviderJson,
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

const recentActivityEnvelopeSchema = z.object({
  max_page: z.number().int().nonnegative().optional(),
  content: z.string().max(4_000_000),
})

const problemDetailSchema = z.object({
  problem_code: z.string().trim().min(1).max(128),
  problem_name: z.string().trim().max(512).optional(),
  contest_code: z.string().trim().max(128).optional(),
  computed_tags: z.array(z.string().trim().min(1).max(128)).optional(),
  user_tags: z.array(z.string().trim().min(1).max(128)).optional(),
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

const parseRecentDate = (value: string | undefined) => {
  if (value === undefined) return null
  const match =
    /^(\d{1,2}):(\d{2})\s*(AM|PM)\s+(\d{1,2})\/(\d{1,2})\/(\d{2})$/i.exec(
      value.trim(),
    )
  if (match === null) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const meridiem = match[3]?.toUpperCase()
  if (meridiem === 'PM' && hour !== 12) hour += 12
  if (meridiem === 'AM' && hour === 12) hour = 0
  const date = new Date(
    Date.UTC(
      2000 + Number(match[6]),
      Number(match[5]) - 1,
      Number(match[4]),
      hour,
      minute,
    ) -
      5.5 * 60 * 60 * 1000,
  )
  return Number.isFinite(date.getTime()) ? date : null
}

const recentRows = (html: string) => {
  const rows: Array<{
    code: string
    contestCode?: string
    title?: string
    occurredAt: Date | null
    verdict: string
    language?: string
    solutionId?: string
  }> = []
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1] ?? ''
    const problem = /href=['"]\/([^/'"]+\/)?problems\/([A-Za-z0-9_+-]+)/i.exec(
      row,
    )
    if (problem?.[2] === undefined) continue
    const code = problem[2].toUpperCase()
    const contestCode = problem[1]?.replace(/\/$/, '')
    const problemTitle =
      /<td[^>]*title=['"]([^'"]+)['"][^>]*>\s*<a[^>]*>\s*([^<]+)/i.exec(row)
    const timeTitle =
      /<td[^>]*title=['"](\d{1,2}:\d{2}\s*(?:AM|PM)\s+\d{1,2}\/\d{1,2}\/\d{2})['"]/i.exec(
        row,
      )
    const language =
      /<td[^>]*title=['"]([^'"]+)['"][^>]*>\s*[^<]*\s*<\/td>\s*<td[^>]*title=['"]View['"]/i.exec(
        row,
      )
    const solution = /href=['"]\/viewsolution\/(\d+)['"]/i.exec(row)
    const accepted = /title=['"]accepted['"]/i.test(row)
    const result =
      /<td[^>]*title=['"]([^'"]*)['"][^>]*>\s*<span[^>]*title=['"]([^'"]+)['"]/i.exec(
        row,
      )
    rows.push({
      code,
      ...(contestCode === undefined ? {} : { contestCode }),
      ...(problemTitle?.[2] === undefined
        ? {}
        : { title: problemTitle[2].trim() }),
      occurredAt: parseRecentDate(timeTitle?.[1]),
      verdict: accepted ? 'accepted' : (result?.[2] ?? 'unknown').trim(),
      ...(language?.[1] === undefined ? {} : { language: language[1].trim() }),
      ...(solution?.[1] === undefined ? {} : { solutionId: solution[1] }),
    })
  }
  return rows
}

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
  private readonly recentEndpoint: URL

  constructor(options: CodeChefActivityFetcherOptions = {}) {
    this.baseUrl = new URL(options.baseUrl ?? 'https://www.codechef.com/users/')
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxAttempts = options.maxAttempts ?? 2
    this.requestGate =
      options.requestGate ?? new RequestGate({ minIntervalMs: 1000 })
    this.fetchImpl = options.fetchImpl ?? fetch
    this.recentEndpoint = new URL('/recent/user', this.baseUrl)
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
    const recentUrl = new URL(this.recentEndpoint)
    recentUrl.searchParams.set('page', '0')
    recentUrl.searchParams.set('user_handle', handle)
    let recentRowsData: ReturnType<typeof recentRows> = []
    let recentSourceUrl = recentUrl.toString()
    try {
      const recentText = await fetchProviderText({
        provider: this.provider,
        url: recentUrl,
        allowedHostname: 'www.codechef.com',
        requestGate: this.requestGate,
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
        maxAttempts: this.maxAttempts,
        maxResponseBytes: 4_000_000,
        ...(signal === undefined ? {} : { signal }),
      } satisfies ProviderHttpRequest)
      let recentBody: unknown
      try {
        recentBody = JSON.parse(recentText) as unknown
      } catch {
        recentBody = undefined
      }
      const parsedRecent = recentActivityEnvelopeSchema.safeParse(recentBody)
      if (
        parsedRecent.success &&
        !isCodeChefChallengePage(parsedRecent.data.content)
      ) {
        recentRowsData = recentRows(parsedRecent.data.content)
      }
    } catch {
      recentRowsData = []
      recentSourceUrl = profileUrl.toString()
    }

    const rows: ReturnType<typeof recentRows> =
      recentRowsData.length > 0
        ? recentRowsData
        : problemCodesFromHtml(html).map((code) => ({
            code,
            occurredAt: null,
            verdict: 'accepted',
          }))
    const acceptedCodes = [
      ...new Set(
        rows
          .filter((row) => row.verdict.toLowerCase().includes('accept'))
          .map((row) => row.code),
      ),
    ]
    const details = new Map<string, z.infer<typeof problemDetailSchema>>()
    for (const code of acceptedCodes.slice(0, 25)) {
      const row = rows.find((item) => item.code === code)
      const contest = row?.contestCode ?? 'PRACTICE'
      const detailUrl = new URL(
        `/api/contests/${encodeURIComponent(contest)}/problems/${encodeURIComponent(code)}`,
        this.baseUrl,
      )
      try {
        const detail = problemDetailSchema.safeParse(
          await fetchProviderJson({
            provider: this.provider,
            url: detailUrl,
            allowedHostname: 'www.codechef.com',
            requestGate: this.requestGate,
            fetchImpl: this.fetchImpl,
            timeoutMs: this.timeoutMs,
            maxAttempts: this.maxAttempts,
            maxResponseBytes: 2_000_000,
            ...(signal === undefined ? {} : { signal }),
          } satisfies ProviderHttpRequest),
        )
        if (detail.success) details.set(code, detail.data)
      } catch {
        continue
      }
    }

    const solvedProblems: ProviderSolvedProblem[] = rows
      .filter((row) => row.verdict.toLowerCase().includes('accept'))
      .map((row) => {
        const externalId = row.code
        const canonicalUrl = problemUrl(externalId)
        const detail = details.get(externalId)
        const providerTags = [
          ...(detail?.computed_tags ?? []),
          ...(detail?.user_tags ?? []),
        ]
        const topics = providerTags.map((tag) =>
          tag
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, ''),
        )
        return ProviderSolvedProblemSchema.parse({
          provider: this.provider,
          externalId,
          canonicalUrl,
          occurredAt: row.occurredAt?.toISOString() ?? null,
          firstObservedAt: fetchedAt.toISOString(),
          lastObservedAt: fetchedAt.toISOString(),
          ...(row.solutionId === undefined
            ? {}
            : { sourceSubmissionId: row.solutionId }),
          ...(providerTags.length === 0 ? {} : { providerTags }),
          ...(topics.length === 0 ? {} : { topics }),
          completeness: 'partial',
          provenance: {
            provider: this.provider,
            providerId: externalId,
            canonicalUrl,
            sourceUrl: recentSourceUrl,
            extractionStrategy:
              details === undefined ? 'sanitized_html' : 'official_json',
            schemaVersion:
              details === undefined
                ? 'codechef-recent-activity-v1'
                : 'codechef-recent-activity-tags-v1',
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
            sourceUrl: profileUrl.toString(),
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
            sourceUrl: profileUrl.toString(),
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

    const submissions: ProviderSubmission[] = rows.map((row, index) => {
      const eventId =
        row.solutionId ??
        `recent:${row.code}:${row.occurredAt?.toISOString() ?? index}`
      const canonicalUrl = problemUrl(row.code)
      return ProviderSubmissionSchema.parse({
        provider: this.provider,
        externalId: row.code,
        eventId,
        ...(row.title === undefined ? {} : { problemTitle: row.title }),
        canonicalUrl,
        verdict: row.verdict,
        ...(row.language === undefined ? {} : { language: row.language }),
        ...(row.occurredAt === null
          ? {}
          : { occurredAt: row.occurredAt.toISOString() }),
        isAccepted: row.verdict.toLowerCase().includes('accept'),
        completeness: 'partial',
        provenance: {
          provider: this.provider,
          providerId: eventId,
          canonicalUrl,
          sourceUrl: recentSourceUrl,
          extractionStrategy: 'official_json',
          schemaVersion: 'codechef-recent-submissions-v1',
          completeness: 'partial',
          fetchedAt: fetchedAt.toISOString(),
          stale: false,
        },
      })
    })
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
