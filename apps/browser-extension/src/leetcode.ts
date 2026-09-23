import type { ConnectorSubmission, ProviderRead } from './types.js'
import { ProviderRequestError } from './types.js'

// Reads the signed-in learner's own LeetCode data with GET requests that the
// LeetCode website itself uses. The browser attaches the learner's session
// cookie; the connector never reads or sends it.

export const LEETCODE_ORIGIN = 'https://leetcode.com'
const PAGE_SIZE = 20

const slugPattern = /^[a-z0-9-]{1,128}$/
const handlePattern = /^(?=.*[A-Za-z0-9])[A-Za-z0-9_.-]{1,64}$/

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

export type LeetCodeStatuses = {
  username: string | null
  solved: { externalId: string; title?: string }[]
  // False when the solved list could not be read and only the username is
  // known; solves then come from accepted submissions.
  solvedComplete: boolean
}

// `/api/problems/all/` names the signed-in user and marks every problem the
// user has solved (`ac`) or tried (`notac`).
export const parseLeetCodeProblems = (body: unknown): LeetCodeStatuses => {
  if (!isRecord(body) || !Array.isArray(body.stat_status_pairs)) {
    throw new ProviderRequestError(
      'invalid',
      'LeetCode returned an unexpected problem list.',
    )
  }
  const username = text(body.user_name)
  const solved: LeetCodeStatuses['solved'] = []
  for (const pair of body.stat_status_pairs) {
    if (!isRecord(pair) || pair.status !== 'ac' || !isRecord(pair.stat))
      continue
    const slug = text(pair.stat.question__title_slug)
    if (slug === undefined || !slugPattern.test(slug)) continue
    const title = text(pair.stat.question__title)
    solved.push({
      externalId: slug,
      ...(title === undefined ? {} : { title: title.slice(0, 512) }),
    })
  }
  return {
    username:
      username !== undefined && handlePattern.test(username) ? username : null,
    solved,
    solvedComplete: true,
  }
}

const runtimeMs = (value: unknown) => {
  const match = /^([\d.]+)\s*ms$/i.exec(text(value) ?? '')
  return match?.[1] === undefined ? undefined : Math.round(Number(match[1]))
}

const memoryKb = (value: unknown) => {
  const match = /^([\d.]+)\s*(KB|MB|GB)$/i.exec(text(value) ?? '')
  if (match?.[1] === undefined || match[2] === undefined) return undefined
  const amount = Number(match[1])
  const unit = match[2].toUpperCase()
  return Math.round(
    amount * (unit === 'GB' ? 1024 * 1024 : unit === 'MB' ? 1024 : 1),
  )
}

// `compare_result` is a string of 1s and 0s, one per test case.
const passedTests = (value: unknown) => {
  const bits = text(value)
  return bits !== undefined && /^[01]{1,100000}$/.test(bits)
    ? [...bits].filter((bit) => bit === '1').length
    : undefined
}

// Normalizes one submission and drops everything else it carries, including
// the learner's source code.
export const normalizeLeetCodeSubmission = (
  item: unknown,
): ConnectorSubmission | null => {
  if (!isRecord(item)) return null
  const id =
    typeof item.id === 'number' || typeof item.id === 'string'
      ? String(item.id)
      : ''
  const slug = text(item.title_slug)
  const verdict = text(item.status_display)
  const timestamp = Number(item.timestamp)
  if (
    !/^[0-9]{1,20}$/.test(id) ||
    slug === undefined ||
    !slugPattern.test(slug) ||
    verdict === undefined ||
    !Number.isFinite(timestamp) ||
    timestamp <= 0
  ) {
    return null
  }
  const title = text(item.title)
  const language = text(item.lang_name) ?? text(item.lang)
  const runtime = runtimeMs(item.runtime)
  const memory = memoryKb(item.memory)
  const passed = passedTests(item.compare_result)
  return {
    eventId: id,
    externalId: slug,
    ...(title === undefined ? {} : { problemTitle: title.slice(0, 512) }),
    verdict: verdict.slice(0, 64),
    isAccepted: verdict === 'Accepted',
    ...(language === undefined ? {} : { language: language.slice(0, 64) }),
    occurredAt: new Date(timestamp * 1000).toISOString(),
    ...(runtime === undefined ? {} : { runtimeMs: runtime }),
    ...(memory === undefined ? {} : { memoryKb: memory }),
    ...(passed === undefined ? {} : { passedTestCount: passed }),
  }
}

export type LeetCodePage = {
  submissions: ConnectorSubmission[]
  ids: number[]
  hasNext: boolean
  lastKey: string
}

export const parseLeetCodeSubmissionPage = (body: unknown): LeetCodePage => {
  if (!isRecord(body) || !Array.isArray(body.submissions_dump)) {
    throw new ProviderRequestError(
      'invalid',
      'LeetCode returned an unexpected submission page.',
    )
  }
  const submissions = body.submissions_dump.flatMap((item) => {
    const normalized = normalizeLeetCodeSubmission(item)
    return normalized === null ? [] : [normalized]
  })
  return {
    submissions,
    ids: submissions.map((item) => Number(item.eventId)),
    hasNext: body.has_next === true,
    lastKey: text(body.last_key) ?? '',
  }
}

// A GraphQL request made from the LeetCode page (the page reader adds the
// CSRF header LeetCode requires for signed-in POSTs).
export type ProviderPost = (url: string, body: unknown) => Promise<Response>

const httpError = (response: Response, what: string) => {
  if (response.status === 429) {
    return new ProviderRequestError(
      'rate_limited',
      'LeetCode is rate limiting requests.',
    )
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(
      'signed_out',
      `Sign in to LeetCode in this browser (${what} returned HTTP ${response.status}).`,
    )
  }
  return new ProviderRequestError(
    'unavailable',
    `LeetCode ${what} returned HTTP ${response.status}.`,
  )
}

const parseJson = async (response: Response, what: string) => {
  try {
    return (await response.json()) as unknown
  } catch {
    throw new ProviderRequestError(
      'invalid',
      `LeetCode ${what} returned a non-JSON response.`,
    )
  }
}

const graphql = async (
  post: ProviderPost,
  query: string,
  variables: object,
) => {
  const response = await post(`${LEETCODE_ORIGIN}/graphql/`, {
    query,
    variables,
  })
  if (response.status === 400) {
    // LeetCode explains a rejected query in `errors`; keep its first line
    // (schema text, never learner data) for diagnosis.
    const detail = await response
      .json()
      .then((body: unknown) =>
        isRecord(body) && Array.isArray(body.errors) && isRecord(body.errors[0])
          ? text(body.errors[0].message)
          : undefined,
      )
      .catch(() => undefined)
    throw new ProviderRequestError(
      'unavailable',
      `LeetCode GraphQL returned HTTP 400${detail === undefined ? '' : `: ${detail.slice(0, 160)}`}.`,
    )
  }
  if (!response.ok) throw httpError(response, 'GraphQL')
  const body = await parseJson(response, 'GraphQL')
  if (!isRecord(body) || !isRecord(body.data)) {
    throw new ProviderRequestError(
      'invalid',
      'LeetCode GraphQL returned no data.',
    )
  }
  return body.data
}

export const fetchLeetCodeStatuses = async (
  read: ProviderRead,
  post?: ProviderPost,
): Promise<LeetCodeStatuses> => {
  const response = await read(`${LEETCODE_ORIGIN}/api/problems/all/`)
  if (response.status === 429) throw httpError(response, 'problem list')
  if (response.ok) {
    const statuses = parseLeetCodeProblems(
      await parseJson(response, 'problem list'),
    )
    if (statuses.username !== null || post === undefined) return statuses
  } else if (post === undefined) {
    throw httpError(response, 'problem list')
  }
  if (post === undefined) {
    return { username: null, solved: [], solvedComplete: false }
  }
  // Fall back to the signed-in user from GraphQL; solves then come from
  // accepted submissions.
  const data = await graphql(
    post,
    'query globalData { userStatus { isSignedIn username } }',
    {},
  )
  const status = isRecord(data.userStatus) ? data.userStatus : {}
  const username = text(status.username)
  return {
    username:
      status.isSignedIn === true &&
      username !== undefined &&
      handlePattern.test(username)
        ? username
        : null,
    solved: [],
    solvedComplete: false,
  }
}

// `questionSlug` is required by LeetCode's schema; an empty slug lists
// submissions for every problem, as LeetCode's own submissions page does.
const submissionsQuery = `query submissionList($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String!) {
  questionSubmissionList(offset: $offset, limit: $limit, lastKey: $lastKey, questionSlug: $questionSlug) {
    lastKey hasNext
    submissions { id title titleSlug statusDisplay lang langName runtime memory timestamp }
  }
}`

export const fetchLeetCodeSubmissionPage = async (
  read: ProviderRead,
  offset: number,
  lastKey: string,
  post?: ProviderPost,
): Promise<LeetCodePage> => {
  const response = await read(
    `${LEETCODE_ORIGIN}/api/submissions/?offset=${offset}&limit=${PAGE_SIZE}&lastkey=${encodeURIComponent(lastKey)}`,
  )
  if (response.ok) {
    return parseLeetCodeSubmissionPage(
      await parseJson(response, 'submission list'),
    )
  }
  if (response.status === 429 || post === undefined) {
    throw httpError(response, 'submission list')
  }
  // The REST list is unavailable; read the same history through GraphQL.
  const data = await graphql(post, submissionsQuery, {
    offset,
    limit: PAGE_SIZE,
    lastKey: lastKey === '' ? null : lastKey,
    questionSlug: '',
  })
  const list = isRecord(data.questionSubmissionList)
    ? data.questionSubmissionList
    : {}
  const rows = Array.isArray(list.submissions) ? list.submissions : []
  return parseLeetCodeSubmissionPage({
    submissions_dump: rows.map((row) =>
      isRecord(row)
        ? {
            id: row.id,
            title: row.title,
            title_slug: row.titleSlug,
            status_display: row.statusDisplay,
            lang: row.lang,
            lang_name: row.langName,
            runtime: row.runtime,
            memory: row.memory,
            timestamp: row.timestamp,
          }
        : row,
    ),
    has_next: list.hasNext === true,
    last_key: list.lastKey,
  })
}

export const LEETCODE_PAGE_SIZE = PAGE_SIZE
