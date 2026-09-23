import type {
  ProviderSolvedProblem,
  ProviderSubmission,
} from '@algomemtor/shared-contracts'

import type { ProblemActionRecord } from '../repositories/problem-action-repository.js'

type DatedProblem = {
  provider: string
  externalId: string
  occurredAt: string
  solved: boolean
}

export function progressWindow(
  actions: readonly ProblemActionRecord[],
  submissions: readonly ProviderSubmission[],
  solvedProblems: readonly ProviderSolvedProblem[],
  dates: readonly string[],
  localDate: (value: Date) => string,
) {
  const days = new Set(dates)
  const evidence: DatedProblem[] = [
    ...actions
      .filter(
        (action) =>
          action.actionType === 'status_changed' &&
          action.learnerStatus !== 'unsolved',
      )
      .map((action) => ({
        provider: action.provider,
        externalId: action.externalId,
        occurredAt: action.occurredAt.toISOString(),
        solved: action.learnerStatus === 'solved',
      })),
    ...submissions.flatMap((submission) =>
      submission.occurredAt === undefined
        ? []
        : [
            {
              provider: submission.provider,
              externalId: submission.externalId,
              occurredAt: submission.occurredAt,
              solved: submission.isAccepted,
            },
          ],
    ),
    ...solvedProblems.flatMap((problem) =>
      problem.occurredAt === null
        ? []
        : [
            {
              provider: problem.provider,
              externalId: problem.externalId,
              occurredAt: problem.occurredAt,
              solved: true,
            },
          ],
    ),
  ]
  const byDay = new Map<
    string,
    { attempted: Set<string>; solved: Set<string> }
  >()
  const firstSolve = new Map<string, number>()
  for (const item of evidence) {
    if (!item.solved) continue
    const timestamp = new Date(item.occurredAt).getTime()
    if (Number.isNaN(timestamp) || timestamp > Date.now()) continue
    const key = `${item.provider}:${item.externalId}`
    firstSolve.set(key, Math.min(firstSolve.get(key) ?? timestamp, timestamp))
  }
  const attempted = new Set<string>()
  const solved = new Set<string>()
  const solvedDays = new Set<string>()
  const newlySolved: Array<{ key: string; day: string }> = []
  for (const item of evidence) {
    const date = new Date(item.occurredAt)
    if (Number.isNaN(date.getTime()) || date.getTime() > Date.now()) continue
    const day = localDate(date)
    if (item.solved) solvedDays.add(day)
    if (!days.has(day)) continue
    const key = `${item.provider}:${item.externalId}`
    const entry = byDay.get(day) ?? {
      attempted: new Set<string>(),
      solved: new Set<string>(),
    }
    entry.attempted.add(key)
    attempted.add(key)
    if (item.solved && date.getTime() === firstSolve.get(key)) {
      if (!solved.has(key)) newlySolved.push({ key, day })
      entry.solved.add(key)
      solved.add(key)
    }
    byDay.set(day, entry)
  }
  return {
    attempted: attempted.size,
    solved: solved.size,
    attemptedProblemIds: [...attempted],
    solvedProblemIds: [...solved],
    solvedDays,
    newlySolved,
    trend: dates.map((date) => ({
      date,
      attempted: byDay.get(date)?.attempted.size ?? 0,
      solved: byDay.get(date)?.solved.size ?? 0,
    })),
  }
}

const shiftDay = (value: string, amount: number) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

// Solve streaks over local calendar days (YYYY-MM-DD). A streak stays alive
// through today when the learner solved yesterday: it only breaks after a
// full day without a solve, not at midnight before today's first solve.
export function calculateStreaks(days: ReadonlySet<string>, today: string) {
  const yesterday = shiftDay(today, -1)
  let current = 0
  const start = days.has(today) ? today : days.has(yesterday) ? yesterday : null
  if (start !== null) {
    for (let cursor = start; days.has(cursor); cursor = shiftDay(cursor, -1)) {
      current += 1
    }
  }
  let longest = 0
  let running = 0
  let previous: string | undefined
  for (const day of [...days].sort()) {
    running =
      previous !== undefined && day === shiftDay(previous, 1) ? running + 1 : 1
    longest = Math.max(longest, running)
    previous = day
  }
  return { current, longest }
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export const verdictKey = (verdict: string, accepted: boolean) => {
  if (accepted) return 'accepted' as const
  const text = verdict.toLowerCase().replace(/[_-]+/g, ' ')
  if (/^(wrong|wa\b)/.test(text)) return 'wrongAnswer' as const
  if (/^(time|tle\b)/.test(text)) return 'timeLimit' as const
  if (/^(memory|mle\b)/.test(text)) return 'memoryLimit' as const
  if (/^(runtime|re\b)/.test(text)) return 'runtimeError' as const
  if (/^(compil|ce\b)/.test(text)) return 'compileError' as const
  return 'other' as const
}

// Aggregates for the 30-day progress breakdown. `newlySolved` and
// `attemptedProblemIds` come from `progressWindow`, so every count here uses
// the same dated evidence as the headline numbers.
export function progressBreakdown(input: {
  dates: readonly string[]
  newlySolved: readonly { key: string; day: string }[]
  attemptedProblemIds: readonly string[]
  submissions: readonly ProviderSubmission[]
  problems: ReadonlyMap<
    string,
    { normalizedDifficulty?: string | undefined; providerDifficulty?: unknown }
  >
  localDate: (value: Date) => string
  localHour: (value: Date) => number
}) {
  const days = new Set(input.dates)
  const providerOf = (key: string) => key.slice(0, key.indexOf(':'))
  const providers = new Map<
    string,
    { solved: number; attempted: number; submissions: number }
  >()
  const providerEntry = (provider: string) => {
    const entry = providers.get(provider) ?? {
      solved: 0,
      attempted: 0,
      submissions: 0,
    }
    providers.set(provider, entry)
    return entry
  }
  const verdicts = {
    accepted: 0,
    wrongAnswer: 0,
    timeLimit: 0,
    memoryLimit: 0,
    runtimeError: 0,
    compileError: 0,
    other: 0,
  }
  const difficulty = { easy: 0, medium: 0, hard: 0, unknown: 0 }
  const bands = new Map<number, number>()
  const weekdays = WEEKDAYS.map((day) => ({ day, solved: 0, submissions: 0 }))
  const hours = Array.from({ length: 24 }, () => 0)
  const weekdayIndex = (day: string) =>
    (new Date(`${day}T12:00:00.000Z`).getUTCDay() + 6) % 7

  for (const key of input.attemptedProblemIds) {
    providerEntry(providerOf(key)).attempted += 1
  }
  for (const { key, day } of input.newlySolved) {
    providerEntry(providerOf(key)).solved += 1
    const weekday = weekdays[weekdayIndex(day)]
    if (weekday !== undefined) weekday.solved += 1
    const problem = input.problems.get(key)
    const level = problem?.normalizedDifficulty
    if (level === 'easy' || level === 'medium' || level === 'hard') {
      difficulty[level] += 1
    } else {
      difficulty.unknown += 1
    }
    const rating = problem?.providerDifficulty
    if (typeof rating === 'number' && Number.isFinite(rating) && rating > 0) {
      const band = Math.floor(rating / 200) * 200
      bands.set(band, (bands.get(band) ?? 0) + 1)
    }
  }
  let submissions = 0
  for (const submission of input.submissions) {
    if (submission.occurredAt === undefined) continue
    const date = new Date(submission.occurredAt)
    if (Number.isNaN(date.getTime())) continue
    const day = input.localDate(date)
    if (!days.has(day)) continue
    submissions += 1
    providerEntry(submission.provider).submissions += 1
    verdicts[verdictKey(submission.verdict, submission.isAccepted)] += 1
    const weekday = weekdays[weekdayIndex(day)]
    if (weekday !== undefined) weekday.submissions += 1
    const hour = input.localHour(date)
    if (hour >= 0 && hour < 24) hours[hour] = (hours[hour] ?? 0) + 1
  }
  return {
    submissions,
    providers: [...providers.entries()]
      .map(([provider, counts]) => ({ provider, ...counts }))
      .sort(
        (left, right) =>
          right.solved - left.solved || right.submissions - left.submissions,
      ),
    verdicts,
    difficulty,
    ratingBands: [...bands.entries()]
      .sort((left, right) => left[0] - right[0])
      .slice(-20)
      .map(([min, solved]) => ({ min, max: min + 199, solved })),
    weekdays,
    hours,
  }
}
