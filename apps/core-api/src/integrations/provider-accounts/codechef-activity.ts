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
import { providerHtmlToText } from '../providers/provider-html-sanitizer.js'
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
  ProviderActivityFetchOptions,
  ProviderProblemTags,
} from './provider-public-stats.js'

const ratingEntrySchema = z.object({
  code: z.string().trim().max(128).optional(),
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

const contestProblemSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(512),
})

const contestDetailSchema = z.object({
  code: z.string().trim().min(1).max(64),
  time: z.object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  }),
  problems: z.union([
    z.array(contestProblemSchema),
    z.record(z.string(), contestProblemSchema),
  ]),
})

const CONTEST_PROFILE_LOOKUP_LIMIT = 2
const safeContestCode = (value: string) => /^[A-Za-z0-9_+-]{1,64}$/.test(value)
const safeProblemCode = (value: string) => /^[A-Za-z0-9_+-]{1,64}$/.test(value)
const normalizedTitle = (value: string) =>
  value.replaceAll(/\s+/g, ' ').trim().toLocaleLowerCase('en')

// CodeChef's profile lists accepted contest problem names even when its
// /recent/user feed has not published those submissions yet. The contest API
// supplies the canonical problem codes; the profile alone cannot do that.
const profileContestSolves = (html: string) => {
  const section =
    /<section\b[^>]*class=["'][^"']*problems-solved[^"']*["'][^>]*>([\s\S]*?)<\/section>/i.exec(
      html,
    )?.[1] ?? ''
  const contests =
    /<h3\b[^>]*>\s*Contests\s*\(\d+\)\s*<\/h3>([\s\S]*?)(?=<h3\b|$)/i.exec(
      section,
    )?.[1] ?? ''
  const results: Array<{ name: string; titles: string[] }> = []
  for (const block of contests.matchAll(
    /<div\b[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
  )) {
    const content = block[1] ?? ''
    const name = providerHtmlToText(
      /<h5\b[^>]*>([\s\S]*?)<\/h5>/i.exec(content)?.[1] ?? '',
    )
    const problems = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(content)?.[1] ?? ''
    const titles = [...problems.matchAll(/<span\b[^>]*>([^<]+)<\/span>/gi)]
      .map((match) => providerHtmlToText(match[1] ?? ''))
      .filter((title) => title.length > 0 && title.length <= 512)
    if (name !== '' && name.length <= 512 && titles.length > 0) {
      results.push({ name, titles })
    }
  }
  return results
}

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

// CodeChef `user_tags` mix algorithm tags with contest codes (`start255`),
// setter handles (`name_adm`) and difficulty labels. Only keep values that
// read as a topic; an unknown tag stays unknown rather than becoming a topic.
const NON_TOPIC_TAGS = new Set([
  'cakewalk',
  'simple',
  'easy',
  'easy-medium',
  'medium',
  'medium-hard',
  'hard',
  'challenge',
])

export const codeChefTopicTags = (values: readonly string[]) => {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const value of values) {
    const tag = value.trim()
    const slug = tag
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    if (
      slug === '' ||
      /\d/.test(tag) ||
      tag.includes('_') ||
      NON_TOPIC_TAGS.has(slug) ||
      seen.has(slug)
    ) {
      continue
    }
    seen.add(slug)
    tags.push(tag)
  }
  return {
    providerTags: tags,
    topics: tags.map((tag) =>
      tag
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    ),
  }
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

type RecentRow = ReturnType<typeof recentRows>[number]

// Cursor forms:
// - `<highest>`: the whole history is stored; `highest` is the newest stored
//   solution ID, and later syncs read only until they reach it.
// - `v2:<highest>:<maxPage>:<next>`: an oldest-first backfill is unfinished.
//   `next` is the next page to read (moving toward newer pages), counted when
//   the feed's `max_page` was `maxPage`.
// Any other value (including older formats) restarts the backfill, which only
// re-reads history.
type CodeChefCursor =
  | { kind: 'none' }
  | { kind: 'done'; highest: number }
  | { kind: 'backfill'; highest: number; maxPage: number; next: number }

const parseCodeChefCursor = (value: string | undefined): CodeChefCursor => {
  if (value === undefined) return { kind: 'none' }
  const done = /^(\d{1,15})$/.exec(value)
  if (done?.[1] !== undefined) return { kind: 'done', highest: Number(done[1]) }
  const backfill = /^v2:(\d{1,15}):(\d{1,6}):(\d{1,6})$/.exec(value)
  if (
    backfill?.[1] !== undefined &&
    backfill[2] !== undefined &&
    backfill[3] !== undefined
  ) {
    return {
      kind: 'backfill',
      highest: Number(backfill[1]),
      maxPage: Number(backfill[2]),
      next: Number(backfill[3]),
    }
  }
  return { kind: 'none' }
}

const solutionNumber = (row: RecentRow) => {
  if (row.solutionId === undefined) return undefined
  const value = Number(row.solutionId)
  return Number.isSafeInteger(value) ? value : undefined
}

// A short pause after a rate limit and a shorter one when only the per-sync
// page budget ran out.
const RATE_LIMITED_RETRY_MS = 5 * 60 * 1000
const BUDGET_CONTINUE_MS = 2 * 60 * 1000

export type CodeChefActivityFetcherOptions = {
  baseUrl?: string
  timeoutMs?: number
  maxAttempts?: number
  requestGate?: RequestGate
  fetchImpl?: typeof fetch
  // Upper bound on public recent-activity pages read in one sync (about a
  // dozen submissions each).
  maxPages?: number
}

export class CodeChefActivityFetcher implements ProviderActivityDataFetcher {
  readonly provider = 'codechef' as const

  private readonly baseUrl: URL
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly requestGate: RequestGate
  private readonly fetchImpl: typeof fetch
  private readonly recentEndpoint: URL
  private readonly maxPages: number

  constructor(options: CodeChefActivityFetcherOptions = {}) {
    this.baseUrl = new URL(options.baseUrl ?? 'https://www.codechef.com/users/')
    this.timeoutMs = options.timeoutMs ?? 8000
    this.maxAttempts = options.maxAttempts ?? 2
    this.requestGate =
      options.requestGate ?? new RequestGate({ minIntervalMs: 1000 })
    this.fetchImpl = options.fetchImpl ?? fetch
    this.recentEndpoint = new URL('/recent/user', this.baseUrl)
    // CodeChef rate-limits after roughly ten quick requests, so each run
    // reads a few pages and continuation runs finish the rest.
    this.maxPages = options.maxPages ?? 8
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
      this.timeoutMs <= 0 ||
      !Number.isInteger(this.maxPages) ||
      this.maxPages < 1 ||
      this.maxPages > 500
    ) {
      throw new Error('The CodeChef activity configuration is unsafe.')
    }
  }

  async fetchActivityData(
    handle: PublicProviderHandle,
    signal?: AbortSignal,
    options?: ProviderActivityFetchOptions,
  ): Promise<ProviderActivityDataFetchResult> {
    const profileUrl = new URL(encodeURIComponent(handle), this.baseUrl)
    // Continuation runs only advance the backfill, so they skip the profile
    // page (rating history) to spend the provider's request budget on pages.
    const backfillOnly = options?.backfillOnly === true
    const html = backfillOnly
      ? ''
      : await fetchProviderText({
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
    if (!backfillOnly && isCodeChefChallengePage(html)) {
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
    const cursor = parseCodeChefCursor(options?.cursor)
    const stored = cursor.kind === 'none' ? undefined : cursor.highest
    const rowsByEvent = new Map<string, RecentRow>()
    let recentSourceUrl = ''
    let pagesRead = 0
    let failed = false
    const readPage = async (page: number) => {
      if (pagesRead >= this.maxPages) return null
      const recent = await this.fetchRecentPage(handle, page, signal)
      if (recent === null) {
        failed = true
        return null
      }
      pagesRead += 1
      if (recentSourceUrl === '') recentSourceUrl = recent.url
      for (const [index, row] of recent.rows.entries()) {
        const key =
          row.solutionId ??
          `${row.code}:${row.occurredAt?.toISOString() ?? `${page}-${index}`}`
        rowsByEvent.set(key, row)
      }
      return recent
    }
    const reachesStored = (rows: readonly RecentRow[]) =>
      stored !== undefined &&
      rows.some((row) => {
        const value = solutionNumber(row)
        return value !== undefined && value <= stored
      })

    // 1. Catch up from the newest page until reaching the newest stored
    //    submission (on a first sync, page 0 alone is the top).
    let caughtUp = false
    let topEnd = 0
    let maxPage = 0
    const first = await readPage(0)
    if (first !== null) {
      maxPage = first.maxPage ?? 0
      caughtUp =
        stored === undefined ||
        reachesStored(first.rows) ||
        first.rows.length === 0 ||
        maxPage === 0
      for (let page = 1; !caughtUp && page <= maxPage; page += 1) {
        const recent = await readPage(page)
        if (recent === null) break
        topEnd = page
        caughtUp = reachesStored(recent.rows) || page >= maxPage
      }
    }

    // 2. Backfill the rest oldest first, from the saved page toward the pages
    //    the catch-up just read. New submissions push old pages down by about
    //    `maxPage - cursor.maxPage`; reading one page further back overlaps.
    let backfillDone = cursor.kind === 'done'
    let nextBackfillPage = 0
    if (caughtUp && !backfillDone) {
      let page =
        cursor.kind === 'backfill'
          ? Math.min(maxPage, cursor.next + 1 + (maxPage - cursor.maxPage))
          : maxPage
      while (page > topEnd) {
        const recent = await readPage(page)
        if (recent === null) break
        page -= 1
      }
      backfillDone = page <= topEnd
      nextBackfillPage = page
    }

    const recentRowsData = [...rowsByEvent.values()]
    const fromProfile = pagesRead === 0 || recentRowsData.length === 0
    if (fromProfile) recentSourceUrl = profileUrl.toString()
    const rows: RecentRow[] = fromProfile
      ? problemCodesFromHtml(html).map((code) => ({
          code,
          occurredAt: null,
          verdict: 'accepted',
        }))
      : recentRowsData
    const complete = !fromProfile && caughtUp && backfillDone
    const completeness = complete ? 'complete' : 'partial'
    const highestSolution = rows.reduce<number | undefined>((highest, row) => {
      const value = solutionNumber(row)
      return value !== undefined && (highest === undefined || value > highest)
        ? value
        : highest
    }, stored)
    // An unfinished catch-up leaves the old cursor in place: the rows it did
    // read are stored, and the next sync reads the same span again.
    const nextCursor =
      fromProfile || !caughtUp || highestSolution === undefined
        ? undefined
        : backfillDone
          ? String(highestSolution)
          : `v2:${highestSolution}:${maxPage}:${nextBackfillPage}`

    // Keep the earliest accepted row per problem as the solve event.
    const firstAccepted = new Map<string, RecentRow>()
    for (const row of rows) {
      if (!row.verdict.toLowerCase().includes('accept')) continue
      const existing = firstAccepted.get(row.code)
      if (
        existing === undefined ||
        (row.occurredAt !== null &&
          (existing.occurredAt === null ||
            row.occurredAt < existing.occurredAt))
      ) {
        firstAccepted.set(row.code, row)
      }
    }
    const solvedProblems: ProviderSolvedProblem[] = [
      ...firstAccepted.values(),
    ].map((row) => {
      const externalId = row.code
      const canonicalUrl = problemUrl(externalId)
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
        completeness,
        provenance: {
          provider: this.provider,
          providerId: externalId,
          canonicalUrl,
          sourceUrl: recentSourceUrl,
          extractionStrategy: fromProfile ? 'sanitized_html' : 'official_json',
          schemaVersion: 'codechef-recent-activity-v2',
          completeness,
          fetchedAt: fetchedAt.toISOString(),
          stale: false,
        },
      })
    })

    if (!backfillOnly) {
      const newestRecentTime = recentRowsData.reduce(
        (latest, row) => Math.max(latest, row.occurredAt?.getTime() ?? 0),
        0,
      )
      const ratingContests = extractRatingEntries(html)
        .flatMap((entry) => {
          const code = entry.code ?? entry.contest_code
          const date = ratingDate(entry)
          return code !== undefined &&
            safeContestCode(code) &&
            date !== null &&
            date.getTime() >= newestRecentTime
            ? [{ code, date, name: entry.name ?? '' }]
            : []
        })
        .sort((left, right) => right.date.getTime() - left.date.getTime())
      const listedSolves = profileContestSolves(html)
      let lookups = 0
      for (const contest of ratingContests) {
        if (lookups >= CONTEST_PROFILE_LOOKUP_LIMIT) break
        const listed = listedSolves.find(
          (item) =>
            normalizedTitle(item.name) === normalizedTitle(contest.name),
        )
        if (listed === undefined) continue
        lookups += 1
        const detailUrl = new URL(
          `/api/contests/${encodeURIComponent(contest.code)}`,
          this.baseUrl,
        )
        try {
          const body = await fetchProviderJson({
            provider: this.provider,
            url: detailUrl,
            allowedHostname: 'www.codechef.com',
            requestGate: this.requestGate,
            fetchImpl: this.fetchImpl,
            timeoutMs: this.timeoutMs,
            maxAttempts: this.maxAttempts,
            maxResponseBytes: 2_000_000,
            ...(signal === undefined ? {} : { signal }),
          } satisfies ProviderHttpRequest)
          const parsed = contestDetailSchema.safeParse(body)
          if (!parsed.success || parsed.data.code !== contest.code) continue
          const { start, end } = parsed.data.time
          if (end < start || end * 1000 > fetchedAt.getTime()) continue
          const problems = Array.isArray(parsed.data.problems)
            ? parsed.data.problems
            : Object.values(parsed.data.problems)
          const byTitle = new Map<string, string[]>()
          for (const problem of problems) {
            if (!safeProblemCode(problem.code)) continue
            const title = normalizedTitle(problem.name)
            byTitle.set(title, [...(byTitle.get(title) ?? []), problem.code])
          }
          for (const title of listed.titles) {
            const matching = byTitle.get(normalizedTitle(title))
            if (matching?.length !== 1) continue
            const externalId = matching[0]
            if (externalId === undefined) continue
            const canonicalUrl = problemUrl(externalId)
            solvedProblems.push(
              ProviderSolvedProblemSchema.parse({
                provider: this.provider,
                externalId,
                canonicalUrl,
                // The public profile proves a contest solve, but does not
                // publish its submission time. Use the contest end as the
                // observed date until an exact submission becomes available.
                occurredAt: new Date(end * 1000).toISOString(),
                firstObservedAt: fetchedAt.toISOString(),
                lastObservedAt: fetchedAt.toISOString(),
                completeness: 'partial',
                provenance: {
                  provider: this.provider,
                  providerId: `${contest.code}:${externalId}`,
                  canonicalUrl,
                  sourceUrl: profileUrl.toString(),
                  extractionStrategy: 'sanitized_html',
                  schemaVersion: 'codechef-profile-contest-solve-v1',
                  completeness: 'partial',
                  fetchedAt: fetchedAt.toISOString(),
                  stale: false,
                },
              }),
            )
          }
        } catch {
          // The public recent feed remains usable when a contest lookup is
          // unavailable; the next scheduled sync can try again.
        }
      }
    }

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
        completeness,
        provenance: {
          provider: this.provider,
          providerId: eventId,
          canonicalUrl,
          sourceUrl: recentSourceUrl,
          extractionStrategy: fromProfile ? 'sanitized_html' : 'official_json',
          schemaVersion: 'codechef-recent-submissions-v2',
          completeness,
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
      complete,
      fetchedAt,
      ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
      ...(complete || fromProfile
        ? {}
        : {
            continueAfterMs: failed
              ? RATE_LIMITED_RETRY_MS
              : BUDGET_CONTINUE_MS,
          }),
    }
  }

  async fetchProblemTags(externalIds: readonly string[], signal?: AbortSignal) {
    const tags = new Map<string, ProviderProblemTags | null>()
    for (const code of new Set(externalIds)) {
      if (!/^[A-Za-z0-9_+-]{1,64}$/.test(code)) {
        tags.set(code, null)
        continue
      }
      // Every CodeChef problem is also published under PRACTICE, so stored
      // problem codes can be looked up without their original contest.
      const detailUrl = new URL(
        `/api/contests/PRACTICE/problems/${encodeURIComponent(code)}`,
        this.baseUrl,
      )
      let body: unknown
      try {
        body = await fetchProviderJson({
          provider: this.provider,
          url: detailUrl,
          allowedHostname: 'www.codechef.com',
          requestGate: this.requestGate,
          fetchImpl: this.fetchImpl,
          timeoutMs: this.timeoutMs,
          maxAttempts: this.maxAttempts,
          maxResponseBytes: 2_000_000,
          ...(signal === undefined ? {} : { signal }),
        } satisfies ProviderHttpRequest)
      } catch (error) {
        // A block or rate limit applies to every remaining lookup; stop and
        // let the next sync continue from the same backlog.
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'PROVIDER_RATE_LIMITED' ||
            error.code === 'PROVIDER_BLOCKED')
        ) {
          break
        }
        continue
      }
      const detail = problemDetailSchema.safeParse(body)
      const found = detail.success
        ? codeChefTopicTags([
            ...(detail.data.computed_tags ?? []),
            ...(detail.data.user_tags ?? []),
          ])
        : undefined
      tags.set(
        code,
        found === undefined || found.providerTags.length === 0 ? null : found,
      )
    }
    return tags
  }

  private async fetchRecentPage(
    handle: PublicProviderHandle,
    page: number,
    signal?: AbortSignal,
  ) {
    const url = new URL(this.recentEndpoint)
    url.searchParams.set('page', String(page))
    url.searchParams.set('user_handle', handle)
    try {
      const text = await fetchProviderText({
        provider: this.provider,
        url,
        allowedHostname: 'www.codechef.com',
        requestGate: this.requestGate,
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
        maxAttempts: this.maxAttempts,
        maxResponseBytes: 4_000_000,
        ...(signal === undefined ? {} : { signal }),
      } satisfies ProviderHttpRequest)
      let body: unknown
      try {
        body = JSON.parse(text) as unknown
      } catch {
        return null
      }
      const parsed = recentActivityEnvelopeSchema.safeParse(body)
      if (!parsed.success || isCodeChefChallengePage(parsed.data.content)) {
        return null
      }
      return {
        url: url.toString(),
        maxPage: parsed.data.max_page,
        rows: recentRows(parsed.data.content),
      }
    } catch {
      return null
    }
  }
}
