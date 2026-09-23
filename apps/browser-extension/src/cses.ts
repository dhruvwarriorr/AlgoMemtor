import type {
  ConnectorSolvedProblem,
  ConnectorSubmission,
  ProviderRead,
} from './types.js'
import { ProviderRequestError } from './types.js'

// Reads the signed-in learner's own CSES pages. CSES has no API, so these
// parsers read the same HTML the learner sees and keep only task IDs, titles,
// statuses, times, and verdicts.

export const CSES_ORIGIN = 'https://cses.fi'

export type CsesTaskStatus = 'solved' | 'attempted' | 'none'

export type CsesProblemset = {
  userId: string | null
  tasks: {
    id: string
    title: string
    status: CsesTaskStatus
    section?: string
  }[]
}

const decode = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim()

export const parseCsesProblemset = (html: string): CsesProblemset => {
  // Signed in, the header links to `/user/<id>`; signed out, to `/login`.
  const account =
    /<a[^>]*class="account"[^>]*href="\/user\/(\d{1,10})\/?"/i.exec(html) ??
    /<a[^>]*href="\/user\/(\d{1,10})\/?"[^>]*class="account"/i.exec(html)
  const tasks: CsesProblemset['tasks'] = []
  const seen = new Set<string>()
  const pattern =
    /<li class="task">\s*<a href="\/problemset\/task\/(\d{1,6})\/?">([^<]{1,512})<\/a>[\s\S]*?<span class="task-score icon ?([a-z ]*)"/gi
  // Tasks are grouped under `<h2>` section headings.
  const sections = html.split(/<h2[^>]*>/i)
  sections.forEach((chunk, index) => {
    const heading =
      index === 0 ? undefined : decode(chunk.split(/<\/h2>/i)[0] ?? '')
    const section =
      heading !== undefined && heading !== '' && heading.length <= 64
        ? heading
        : undefined
    for (const match of chunk.matchAll(pattern)) {
      const id = match[1]
      const title = match[2]
      if (id === undefined || title === undefined || seen.has(id)) continue
      seen.add(id)
      const classes = (match[3] ?? '').split(/\s+/)
      tasks.push({
        id,
        title: decode(title),
        status: classes.includes('full')
          ? 'solved'
          : classes.includes('zero')
            ? 'attempted'
            : 'none',
        ...(section === undefined ? {} : { section }),
      })
    }
  })
  return { userId: account?.[1] ?? null, tasks }
}

export const csesSolvedProblems = (
  problemset: CsesProblemset,
): ConnectorSolvedProblem[] =>
  problemset.tasks
    .filter((task) => task.status === 'solved')
    .map((task) => ({
      externalId: task.id,
      title: task.title,
      ...(task.section === undefined ? {} : { section: task.section }),
    }))

// CSES prints local times of its Helsinki servers without a zone.
export const helsinkiTimeToIso = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value)
  if (match === null) return null
  const [, year, month, day, hour, minute, second] = match.map(Number)
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    return null
  }
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second)
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Helsinki',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(instant))
    const part = (type: string) =>
      Number(parts.find((item) => item.type === type)?.value)
    return (
      Date.UTC(
        part('year'),
        part('month') - 1,
        part('day'),
        part('hour'),
        part('minute'),
        part('second'),
      ) - instant
    )
  }
  const instant = wallClock - offsetAt(wallClock - offsetAt(wallClock))
  return Number.isFinite(instant) ? new Date(instant).toISOString() : null
}

// Each of the learner's submissions on a task page links to its result page
// and shows when it was sent and whether it passed.
export const parseCsesTaskSubmissions = (
  html: string,
  taskId: string,
  title?: string,
): ConnectorSubmission[] => {
  const submissions: ConnectorSubmission[] = []
  const seen = new Set<string>()
  const pattern =
    /href="\/problemset\/result\/(\d{1,20})\/?"[^>]*>([\s\S]{0,400}?)(?=href="\/problemset\/result\/|<\/table>|<\/ul>|$)/gi
  for (const match of html.matchAll(pattern)) {
    const id = match[1]
    const nearby = match[2] ?? ''
    if (id === undefined || seen.has(id)) continue
    const time = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(nearby)?.[1]
    const occurredAt = time === undefined ? null : helsinkiTimeToIso(time)
    if (occurredAt === null) continue
    seen.add(id)
    const accepted = /task-score icon full/i.test(nearby)
    submissions.push({
      eventId: id,
      externalId: taskId,
      ...(title === undefined ? {} : { problemTitle: title }),
      verdict: accepted ? 'ACCEPTED' : 'NOT ACCEPTED',
      isAccepted: accepted,
      occurredAt,
    })
  }
  return submissions
}

const readHtml = async (read: ProviderRead, path: string) => {
  const response = await read(`${CSES_ORIGIN}${path}`)
  if (response.status === 429) {
    throw new ProviderRequestError(
      'rate_limited',
      'CSES is rate limiting requests.',
    )
  }
  if (!response.ok) {
    throw new ProviderRequestError(
      'unavailable',
      `CSES returned HTTP ${response.status}.`,
    )
  }
  return response.text()
}

export const fetchCsesProblemset = async (read: ProviderRead) =>
  parseCsesProblemset(await readHtml(read, '/problemset/'))

export const fetchCsesTaskSubmissions = async (
  read: ProviderRead,
  taskId: string,
  title?: string,
) =>
  parseCsesTaskSubmissions(
    await readHtml(read, `/problemset/task/${taskId}/`),
    taskId,
    title,
  )
