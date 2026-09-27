import type { SyncOutcome } from './state.js'
import { UploadError } from './sync.js'
import {
  ProviderRequestError,
  type ConnectorSolvedProblem,
  type ConnectorSubmission,
  type ConnectorUpload,
  type ProviderRead,
} from './types.js'

// Reads the learner's own CodeChef history in their browser. CodeChef's
// public feed, as the server sees it, leaves out some solves (older pages
// and blocked requests), so the connector reads every feed page over a few
// runs, adds contest solves the profile lists, and looks up each contest
// problem's difficulty rating. Only codes, titles, times, verdicts,
// languages and ratings are kept; never code or statements.

export const CODECHEF_ORIGIN = 'https://www.codechef.com'

const codePattern = /^[A-Za-z0-9_]{1,64}$/

export type CodeChefRow = {
  code: string
  // The contest the submission was made in; absent for a practice
  // submission (a plain /problems/ link).
  contestCode?: string
  title?: string
  occurredAt: string | null
  accepted: boolean
  verdict: string
  language?: string
  solutionId?: string
}

// Rating lookups that still need doing, and ratings already found (0 when
// CodeChef has none), keyed `CONTEST:CODE`.
export type CodeChefState = {
  handle?: string
  // The newest solution ID uploaded; a catch-up stops when it reaches it.
  newestId?: number
  // Next older feed page to read; `done` once the oldest page was read.
  backfill:
    | { phase: 'not_started' }
    | { phase: 'running'; next: number }
    | {
        phase: 'done'
      }
  ratings: Record<string, number>
  pendingRatings: string[]
}

export const emptyCodeChefState = (): CodeChefState => ({
  backfill: { phase: 'not_started' },
  ratings: {},
  pendingRatings: [],
})

const decode = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const stripTags = (value: string) => decode(value.replace(/<[^>]*>/g, ' '))

// The feed prints times like `07:15 PM 21/09/26` in India time (UTC+5:30).
export const parseCodeChefTime = (value: string | undefined) => {
  const match =
    /^(\d{1,2}):(\d{2})\s*(AM|PM)\s+(\d{1,2})\/(\d{1,2})\/(\d{2})$/i.exec(
      (value ?? '').trim(),
    )
  if (match === null) return null
  let hour = Number(match[1])
  const meridiem = match[3]?.toUpperCase()
  if (meridiem === 'PM' && hour !== 12) hour += 12
  if (meridiem === 'AM' && hour === 12) hour = 0
  const time =
    Date.UTC(
      2000 + Number(match[6]),
      Number(match[5]) - 1,
      Number(match[4]),
      hour,
      Number(match[2]),
    ) -
    5.5 * 60 * 60 * 1000
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

export const parseCodeChefRecentRows = (html: string): CodeChefRow[] => {
  const rows: CodeChefRow[] = []
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1] ?? ''
    const problem =
      /href=['"]\/(?:([A-Za-z0-9_]{1,64})\/)?problems\/([A-Za-z0-9_]{1,64})/i.exec(
        row,
      )
    const code = problem?.[2]?.toUpperCase()
    if (code === undefined) continue
    const contest = problem?.[1]?.toUpperCase()
    const title = /<a[^>]*problems\/[^'"]+['"][^>]*>([^<]{1,512})<\/a>/i.exec(
      row,
    )?.[1]
    const time =
      /title=['"](\d{1,2}:\d{2}\s*(?:AM|PM)\s+\d{1,2}\/\d{1,2}\/\d{2})['"]/i.exec(
        row,
      )?.[1]
    const accepted = /title=['"]accepted['"]/i.test(row)
    const result = /<span[^>]*title=['"]([^'"]{1,64})['"]/i.exec(row)?.[1]
    const language =
      /<td[^>]*title=['"]([^'"]{1,64})['"][^>]*>[^<]*<\/td>\s*<td[^>]*title=['"]View['"]/i.exec(
        row,
      )?.[1]
    const solutionId = /\/viewsolution\/(\d{1,20})/i.exec(row)?.[1]
    rows.push({
      code,
      ...(contest === undefined || contest === 'PRACTICE'
        ? {}
        : { contestCode: contest }),
      ...(title === undefined || decode(title) === ''
        ? {}
        : { title: decode(title) }),
      occurredAt: parseCodeChefTime(time),
      accepted,
      verdict: accepted ? 'accepted' : (result ?? 'unknown').trim(),
      ...(language === undefined ? {} : { language: decode(language) }),
      ...(solutionId === undefined ? {} : { solutionId }),
    })
  }
  return rows
}

export type CodeChefProfile = {
  // Contest name to rated contest code, from the rating history.
  contestCodes: Map<string, string>
  // Contests the profile lists as solved in, with the solved titles.
  contestSolves: { name: string; titles: string[] }[]
  // Problem codes the profile links directly, with their contest if any.
  linked: { code: string; contestCode?: string }[]
}

const normalizedName = (value: string) =>
  value.replace(/\s+/g, ' ').trim().toLowerCase()

export const parseCodeChefProfile = (html: string): CodeChefProfile => {
  const contestCodes = new Map<string, string>()
  const rating =
    /(?:var\s+all_rating|ratingData|rating_data)\s*=\s*(\[[\s\S]*?\])\s*;/i.exec(
      html,
    )?.[1]
  if (rating !== undefined) {
    try {
      const entries = JSON.parse(rating) as unknown
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (typeof entry !== 'object' || entry === null) continue
          const record = entry as Record<string, unknown>
          const code = record.code ?? record.contest_code
          const name = record.name
          if (
            typeof code === 'string' &&
            codePattern.test(code) &&
            typeof name === 'string'
          ) {
            contestCodes.set(normalizedName(name), code.toUpperCase())
          }
        }
      }
    } catch {
      // Without the rating history, listed contest solves stay unmatched.
    }
  }
  const section =
    /<section\b[^>]*class=["'][^"']*problems-solved[^"']*["'][^>]*>([\s\S]*?)<\/section>/i.exec(
      html,
    )?.[1] ?? ''
  const contestBlock =
    /<h3\b[^>]*>\s*Contests?\s*\(\d+\)\s*<\/h3>([\s\S]*?)(?=<h3\b|$)/i.exec(
      section,
    )?.[1] ?? ''
  const contestSolves: CodeChefProfile['contestSolves'] = []
  for (const block of contestBlock.matchAll(
    /<div\b[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
  )) {
    const content = block[1] ?? ''
    const name = stripTags(
      /<h5\b[^>]*>([\s\S]*?)<\/h5>/i.exec(content)?.[1] ?? '',
    )
    const titles = [
      ...(/<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(content)?.[1] ?? '').matchAll(
        /<span\b[^>]*>([^<]{1,512})<\/span>/gi,
      ),
    ]
      .map((match) => decode(match[1] ?? ''))
      .filter((title) => title !== '')
    if (name !== '' && titles.length > 0) contestSolves.push({ name, titles })
  }
  const linked: CodeChefProfile['linked'] = []
  for (const match of section.matchAll(
    /href=['"]\/(?:([A-Za-z0-9_]{1,64})\/)?problems\/([A-Za-z0-9_]{1,64})/gi,
  )) {
    const code = match[2]?.toUpperCase()
    if (code === undefined) continue
    const contest = match[1]?.toUpperCase()
    linked.push({
      code,
      ...(contest === undefined || contest === 'PRACTICE'
        ? {}
        : { contestCode: contest }),
    })
  }
  return { contestCodes, contestSolves, linked }
}

// `/api/contests/<code>` lists a contest's problems by code and name.
export const parseContestProblems = (body: unknown) => {
  const titles = new Map<string, string[]>()
  if (typeof body !== 'object' || body === null) return titles
  const problems = (body as { problems?: unknown }).problems
  const list = Array.isArray(problems)
    ? problems
    : typeof problems === 'object' && problems !== null
      ? Object.values(problems)
      : []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const { code, name } = item as { code?: unknown; name?: unknown }
    if (typeof code !== 'string' || !codePattern.test(code)) continue
    if (typeof name !== 'string') continue
    const key = normalizedName(name)
    titles.set(key, [...(titles.get(key) ?? []), code.toUpperCase()])
  }
  return titles
}

// A problem's CodeChef difficulty rating; 0 when it has none.
export const parseDifficultyRating = (body: unknown) => {
  if (typeof body !== 'object' || body === null) return 0
  const value = Number(
    (body as { difficulty_rating?: unknown }).difficulty_rating,
  )
  return Number.isInteger(value) && value > 0 && value <= 10_000 ? value : 0
}

const readText = async (read: ProviderRead, url: string) => {
  const response = await read(url)
  if (response.status === 429) {
    throw new ProviderRequestError(
      'rate_limited',
      'CodeChef is rate limiting requests.',
    )
  }
  if (!response.ok) {
    throw new ProviderRequestError(
      'unavailable',
      `CodeChef returned HTTP ${response.status}.`,
    )
  }
  const text = await response.text()
  if (/cf-challenge|captcha|verify you are human/i.test(text.slice(0, 4_000))) {
    throw new ProviderRequestError(
      'unavailable',
      'CodeChef asked this browser to confirm it is not a robot. Open codechef.com once, then sync again.',
    )
  }
  return text
}

const readJson = async (read: ProviderRead, url: string) => {
  try {
    return JSON.parse(await readText(read, url)) as unknown
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error
    throw new ProviderRequestError(
      'invalid',
      'CodeChef returned an unreadable response.',
    )
  }
}

export const fetchCodeChefFeedPage = async (
  read: ProviderRead,
  handle: string,
  page: number,
) => {
  const url = new URL('/recent/user', CODECHEF_ORIGIN)
  url.searchParams.set('page', String(page))
  url.searchParams.set('user_handle', handle)
  const body = await readJson(read, url.toString())
  if (typeof body !== 'object' || body === null) {
    throw new ProviderRequestError(
      'invalid',
      'CodeChef returned an unexpected activity page.',
    )
  }
  const { content, max_page: maxPage } = body as {
    content?: unknown
    max_page?: unknown
  }
  if (typeof content !== 'string') {
    throw new ProviderRequestError(
      'invalid',
      'CodeChef returned an unexpected activity page.',
    )
  }
  return {
    rows: parseCodeChefRecentRows(content),
    maxPage:
      typeof maxPage === 'number' && Number.isInteger(maxPage) && maxPage >= 0
        ? maxPage
        : 0,
  }
}

export type CodeChefSyncDeps = {
  read: ProviderRead
  upload: (upload: ConnectorUpload) => Promise<void>
  sleep: (ms: number) => Promise<void>
  now: () => Date
  pageBudget?: number
  ratingBudget?: number
  requestSpacingMs?: number
}

const outcome = (
  deps: CodeChefSyncDeps,
  status: SyncOutcome['status'],
  message: string,
  rest: Partial<SyncOutcome> = {},
): SyncOutcome => ({
  status,
  message,
  at: deps.now().toISOString(),
  uploadedSubmissions: 0,
  historyComplete: false,
  continueSoon: false,
  ...rest,
})

const solutionNumber = (row: CodeChefRow) =>
  row.solutionId === undefined ? undefined : Number(row.solutionId)

const MAX_UPLOAD = 1000

// Syncs the signed-in handle's history. The handle comes from the claim step,
// which also links and verifies the account.
export const syncCodeChef = async (
  deps: CodeChefSyncDeps,
  previous: CodeChefState,
  handle: string,
): Promise<{ state: CodeChefState; outcome: SyncOutcome }> => {
  const pageBudget = deps.pageBudget ?? 20
  const ratingBudget = deps.ratingBudget ?? 15
  const spacing = deps.requestSpacingMs ?? 1500
  // Another signed-in account starts its own history.
  let state: CodeChefState =
    previous.handle?.toLowerCase() === handle.toLowerCase()
      ? previous
      : { ...emptyCodeChefState(), handle }
  let requests = 0
  const pause = async () => {
    if (requests > 0) await deps.sleep(spacing)
    requests += 1
  }
  const rows = new Map<string, CodeChefRow>()
  const remember = (list: readonly CodeChefRow[]) => {
    for (const [index, row] of list.entries()) {
      rows.set(row.solutionId ?? `${row.code}:${row.occurredAt ?? index}`, row)
    }
  }
  let rateLimited = false
  let pages = 0
  let newest = state.newestId
  let caughtUp = false
  let backfill = state.backfill
  const stored = state.newestId
  try {
    // 1. Newest pages until reaching the newest uploaded solution (on a
    // first run, page 0 alone; the backfill reads the rest).
    for (let page = 0; pages < pageBudget; page += 1) {
      await pause()
      const feed = await fetchCodeChefFeedPage(deps.read, handle, page)
      pages += 1
      remember(feed.rows)
      for (const row of feed.rows) {
        const id = solutionNumber(row)
        if (id !== undefined && (newest === undefined || id > newest))
          newest = id
      }
      const reached =
        stored === undefined ||
        feed.rows.some((row) => (solutionNumber(row) ?? Infinity) <= stored)
      const last = feed.rows.length === 0 || page >= feed.maxPage
      if (reached || last) {
        caughtUp = true
        if (backfill.phase === 'not_started') {
          backfill = last
            ? { phase: 'done' }
            : { phase: 'running', next: page + 1 }
        }
        break
      }
    }
    // 2. Older pages, continuing from where the last run stopped. New
    // submissions push rows to later pages, so a page may be read twice but
    // never skipped.
    while (caughtUp && backfill.phase === 'running' && pages < pageBudget) {
      await pause()
      const feed = await fetchCodeChefFeedPage(deps.read, handle, backfill.next)
      pages += 1
      remember(feed.rows)
      backfill =
        backfill.next >= feed.maxPage || feed.rows.length === 0
          ? { phase: 'done' }
          : { phase: 'running', next: backfill.next + 1 }
    }
  } catch (error) {
    if (
      !(error instanceof ProviderRequestError) ||
      error.kind !== 'rate_limited'
    )
      return { state: previous, outcome: failure(deps, error) }
    rateLimited = true
  }

  // Solves by problem: a contest solve wins over a practice one.
  const solved = new Map<string, ConnectorSolvedProblem>()
  const addSolve = (code: string, contestCode?: string, title?: string) => {
    const existing = solved.get(code)
    if (existing?.solveContext === 'contest') return
    solved.set(code, {
      externalId: code,
      ...(title === undefined ? {} : { title }),
      ...(contestCode === undefined
        ? { solveContext: 'practice' as const }
        : { solveContext: 'contest' as const, contestCode }),
    })
  }
  for (const row of rows.values()) {
    if (row.accepted) addSolve(row.code, row.contestCode, row.title)
  }

  // 3. Contest solves the profile lists but the feed did not show.
  if (!rateLimited) {
    try {
      await pause()
      const profile = parseCodeChefProfile(
        await readText(
          deps.read,
          `${CODECHEF_ORIGIN}/users/${encodeURIComponent(handle)}`,
        ),
      )
      for (const item of profile.linked) addSolve(item.code, item.contestCode)
      let lookups = 0
      for (const contest of profile.contestSolves) {
        const code = profile.contestCodes.get(normalizedName(contest.name))
        if (code === undefined || lookups >= 4) continue
        lookups += 1
        await pause()
        const problems = parseContestProblems(
          await readJson(
            deps.read,
            `${CODECHEF_ORIGIN}/api/contests/${encodeURIComponent(code)}`,
          ),
        )
        for (const title of contest.titles) {
          const matching = problems.get(normalizedName(title))
          if (matching?.length === 1 && matching[0] !== undefined)
            addSolve(matching[0], code, title)
        }
      }
    } catch (error) {
      if (
        error instanceof ProviderRequestError &&
        error.kind === 'rate_limited'
      )
        rateLimited = true
      // The feed rows stay usable without the profile.
    }
  }

  // 4. Ratings of contest solves, a few per run; the rest wait.
  const pending = new Set(state.pendingRatings)
  for (const problem of solved.values()) {
    if (problem.solveContext !== 'contest' || problem.contestCode === undefined)
      continue
    const key = `${problem.contestCode}:${problem.externalId}`
    if (state.ratings[key] === undefined) pending.add(key)
  }
  const ratings = { ...state.ratings }
  let looked = 0
  for (const key of [...pending]) {
    if (rateLimited || looked >= ratingBudget) break
    const [contest, code] = key.split(':')
    if (contest === undefined || code === undefined) {
      pending.delete(key)
      continue
    }
    try {
      await pause()
      looked += 1
      ratings[key] = parseDifficultyRating(
        await readJson(
          deps.read,
          `${CODECHEF_ORIGIN}/api/contests/${encodeURIComponent(contest)}/problems/${encodeURIComponent(code)}`,
        ),
      )
      pending.delete(key)
      // A rating found for a problem solved in an earlier run is sent again
      // so the server can attach it.
      if (!solved.has(code))
        solved.set(code, {
          externalId: code,
          solveContext: 'contest',
          contestCode: contest,
        })
    } catch (error) {
      if (
        error instanceof ProviderRequestError &&
        error.kind === 'rate_limited'
      )
        rateLimited = true
      else pending.delete(key)
    }
  }
  const solvedProblems = [...solved.values()].map((problem) => {
    const rating =
      problem.contestCode === undefined
        ? 0
        : (ratings[`${problem.contestCode}:${problem.externalId}`] ?? 0)
    return rating > 0 ? { ...problem, difficultyRating: rating } : problem
  })

  const submissions: ConnectorSubmission[] = [...rows.values()].flatMap(
    (row) =>
      row.solutionId === undefined || row.occurredAt === null
        ? []
        : [
            {
              eventId: row.solutionId,
              externalId: row.code,
              ...(row.title === undefined ? {} : { problemTitle: row.title }),
              verdict: row.verdict.slice(0, 64) || 'unknown',
              isAccepted: row.accepted,
              ...(row.language === undefined ? {} : { language: row.language }),
              occurredAt: row.occurredAt,
            },
          ],
  )
  const historyComplete = backfill.phase === 'done' && caughtUp
  try {
    let index = 0
    do {
      await deps.upload({
        provider: 'codechef',
        account: { handle },
        submissions: submissions.slice(index, index + MAX_UPLOAD),
        solvedProblems: index === 0 ? solvedProblems : [],
        // Solves arrive a few pages at a time, never as one full list.
        solvedListComplete: false,
        historyComplete,
      })
      index += MAX_UPLOAD
    } while (index < submissions.length)
  } catch (error) {
    return { state: previous, outcome: failure(deps, error) }
  }

  state = {
    handle,
    ...(caughtUp && newest !== undefined
      ? { newestId: newest }
      : state.newestId === undefined
        ? {}
        : { newestId: state.newestId }),
    backfill,
    ratings,
    pendingRatings: [...pending].slice(0, 500),
  }
  const continueSoon =
    rateLimited || !historyComplete || state.pendingRatings.length > 0
  const rated = solvedProblems.filter((item) => item.difficultyRating).length
  return {
    state,
    outcome: outcome(
      deps,
      rateLimited ? 'rate_limited' : 'synced',
      rateLimited
        ? `Uploaded ${submissions.length} submissions; CodeChef asked to slow down, continuing shortly.`
        : historyComplete
          ? `Up to date: ${submissions.length} new submissions, ${solvedProblems.length} solves (${rated} rated contest solves).`
          : `Uploaded ${submissions.length} submissions; loading older history in the next run.`,
      {
        handle,
        uploadedSubmissions: submissions.length,
        historyComplete,
        continueSoon,
      },
    ),
  }
}

const failure = (deps: CodeChefSyncDeps, error: unknown): SyncOutcome => {
  if (error instanceof ProviderRequestError) {
    if (error.kind === 'signed_out')
      return outcome(deps, 'signed_out', error.message)
    if (error.kind === 'rate_limited')
      return outcome(deps, 'rate_limited', error.message, {
        continueSoon: true,
      })
    return outcome(deps, 'error', error.message)
  }
  if (error instanceof UploadError) {
    return outcome(deps, error.unpaired ? 'unpaired' : 'error', error.message)
  }
  const detail = error instanceof Error ? error.message : String(error)
  return outcome(
    deps,
    'error',
    `The CodeChef sync failed: ${detail}`.slice(0, 280),
  )
}
