import {
  ContestMetricsSchema,
  type ContestMetrics,
  type ContestPatternMetrics,
  type ContestProblemBreakdown,
  type ProviderKey,
} from '@algomemtor/shared-contracts'

import {
  problemRef,
  type ActivityParticipation,
  type ActivitySubmission,
  type CatalogContest,
  type ProblemMeta,
} from '../repositories/mentor-repository.js'

// Contest analysis is derived from the learner's own submission timestamps and
// verdicts, the provider's contest schedule and public results. It cannot see
// what the learner did between submissions, so every time-use figure is an
// inference from those timestamps.

const DEFAULT_DURATION_MINUTES: Record<ProviderKey, number> = {
  codeforces: 120,
  codechef: 120,
  leetcode: 90,
  cses: 120,
}
const RAPID_RESUBMIT_MINUTES = 3

export type AnalyzedContest = {
  participation: ActivityParticipation
  contest?: CatalogContest
  metrics?: ContestMetrics
  // Catalog problems of the contest when the provider publishes them.
  contestProblems: ProblemMeta[]
}

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const contestNumberToken = (value: string) =>
  /\b(starters|cook off|lunchtime|long|weekly contest|biweekly contest|round|monday munch)\s*(\d+)/.exec(
    normalizeName(value),
  )?.[0]

export function matchContest(
  participation: ActivityParticipation,
  catalog: readonly CatalogContest[],
): CatalogContest | undefined {
  const candidates = catalog.filter(
    (contest) => contest.provider === participation.provider,
  )
  if (participation.provider === 'codeforces') {
    return candidates.find(
      (contest) => contest.externalId === participation.contestId,
    )
  }
  const name = participation.contestName ?? ''
  if (participation.provider === 'leetcode' && name !== '') {
    const slug = normalizeName(name).replace(/ /g, '-')
    const bySlug = candidates.find((contest) => contest.externalId === slug)
    if (bySlug !== undefined) return bySlug
  }
  if (name !== '') {
    const normalized = normalizeName(name)
    const exact = candidates.find(
      (contest) => normalizeName(contest.name) === normalized,
    )
    if (exact !== undefined) return exact
    const token = contestNumberToken(name)
    if (token !== undefined) {
      const byToken = candidates.find(
        (contest) => contestNumberToken(contest.name) === token,
      )
      if (byToken !== undefined) return byToken
    }
  }
  const attended = participation.attendedAt?.getTime()
  if (attended === undefined) return undefined
  const nearby = candidates.filter((contest) => {
    if (contest.startsAt === undefined) return false
    const start = contest.startsAt.getTime()
    const end =
      contest.endsAt?.getTime() ??
      start + (contest.durationSeconds ?? 7_200) * 1_000
    return attended >= start && attended <= end + 3 * 3_600_000
  })
  return nearby.length === 1 ? nearby[0] : undefined
}

export const contestDurationMinutes = (
  provider: ProviderKey,
  contest: CatalogContest,
) => {
  if (contest.durationSeconds !== undefined) {
    return Math.max(1, Math.round(contest.durationSeconds / 60))
  }
  if (contest.startsAt !== undefined && contest.endsAt !== undefined) {
    return Math.max(
      1,
      Math.round(
        (contest.endsAt.getTime() - contest.startsAt.getTime()) / 60_000,
      ),
    )
  }
  return DEFAULT_DURATION_MINUTES[provider]
}

const round1 = (value: number) => Math.round(value * 10) / 10

const codeforcesIndex = (contestId: string, externalId: string) =>
  externalId.startsWith(contestId) ? externalId.slice(contestId.length) : ''

// The time the learner competed in: the contest itself, or for a contest
// practised afterwards, their own first sitting on it.
export function participationWindow(
  participation: ActivityParticipation,
  contest: CatalogContest,
): { start: number; end: number } | undefined {
  if (participation.session !== undefined) {
    return {
      start: participation.session.start.getTime(),
      end: participation.session.end.getTime(),
    }
  }
  if (contest.startsAt === undefined) return undefined
  const start = contest.startsAt.getTime()
  return {
    start,
    end:
      start + contestDurationMinutes(participation.provider, contest) * 60_000,
  }
}

export function contestSubmissions(
  participation: ActivityParticipation,
  contest: CatalogContest,
  submissions: readonly ActivitySubmission[],
) {
  const window = participationWindow(participation, contest)
  if (window === undefined) return []
  const { start, end } = window
  const codeforcesProblem = new RegExp(
    `^${participation.contestId}[A-Z][0-9]?$`,
  )
  return submissions
    .filter((submission) => {
      if (submission.provider !== participation.provider) return false
      const at = submission.occurredAt.getTime()
      if (at < start || at > end) return false
      return (
        participation.provider !== 'codeforces' ||
        codeforcesProblem.test(submission.externalId)
      )
    })
    .sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
    )
}

export function buildContestMetrics(input: {
  participation: ActivityParticipation
  contest: CatalogContest
  submissions: readonly ActivitySubmission[]
  contestProblems: readonly ProblemMeta[]
  metadata: ReadonlyMap<string, ProblemMeta>
}): ContestMetrics | undefined {
  const { participation, contest } = input
  const window = participationWindow(participation, contest)
  if (contest.startsAt === undefined || window === undefined) return undefined
  const provider = participation.provider
  const start = window.start
  const duration = Math.max(1, Math.round((window.end - start) / 60_000))
  const inContest = contestSubmissions(
    participation,
    contest,
    input.submissions,
  )
  const minuteOf = (date: Date) =>
    round1(Math.max(0, (date.getTime() - start) / 60_000))

  type Row = {
    key: string
    externalId: string
    label: string
    title?: string
    rating?: number
    tags: string[]
    attempts: number
    wrongAttempts: number
    solvedMinute?: number
    firstSubmitMinute?: number
    order: number
  }
  const rows = new Map<string, Row>()
  const metaFor = (key: string) => input.metadata.get(problemRef(provider, key))
  for (const [index, problem] of input.contestProblems.entries()) {
    rows.set(problem.problemKey, {
      key: problem.problemKey,
      externalId: problem.externalId,
      label:
        codeforcesIndex(participation.contestId, problem.externalId) ||
        problem.position ||
        `#${index + 1}`,
      title: problem.title,
      ...(problem.rating === undefined ? {} : { rating: problem.rating }),
      tags: (problem.topics.length > 0 ? problem.topics : problem.tags).slice(
        0,
        12,
      ),
      attempts: 0,
      wrongAttempts: 0,
      order: index,
    })
  }
  let ordinal = rows.size
  const timeline: ContestMetrics['timeline'] = []
  let wrongSubmissions = 0
  let problemSwitches = 0
  let rapidWrongResubmits = 0
  const lastWrongAt = new Map<string, number>()
  let previousKey: string | undefined
  for (const submission of inContest) {
    let row = rows.get(submission.problemKey)
    if (row === undefined) {
      const meta = metaFor(submission.problemKey)
      ordinal += 1
      row = {
        key: submission.problemKey,
        externalId: submission.externalId,
        label:
          provider === 'codeforces'
            ? codeforcesIndex(participation.contestId, submission.externalId) ||
              `#${ordinal}`
            : `#${ordinal}`,
        ...((meta?.title ?? submission.title) === undefined
          ? {}
          : { title: meta?.title ?? submission.title }),
        ...(meta?.rating === undefined ? {} : { rating: meta.rating }),
        tags: (meta === undefined
          ? []
          : meta.topics.length > 0
            ? meta.topics
            : meta.tags
        ).slice(0, 12),
        attempts: 0,
        wrongAttempts: 0,
        order: ordinal,
      }
      rows.set(submission.problemKey, row)
    }
    const minute = minuteOf(submission.occurredAt)
    const alreadySolved = row.solvedMinute !== undefined
    row.attempts += 1
    row.firstSubmitMinute ??= minute
    if (
      previousKey !== undefined &&
      previousKey !== submission.problemKey &&
      rows.get(previousKey)?.solvedMinute === undefined
    ) {
      problemSwitches += 1
    }
    previousKey = submission.problemKey
    if (submission.isAccepted) {
      row.solvedMinute ??= minute
    } else if (!alreadySolved) {
      row.wrongAttempts += 1
      wrongSubmissions += 1
      const last = lastWrongAt.get(submission.problemKey)
      if (last !== undefined && minute - last <= RAPID_RESUBMIT_MINUTES) {
        rapidWrongResubmits += 1
      }
      lastWrongAt.set(submission.problemKey, minute)
    }
    if (timeline.length < 200) {
      timeline.push({
        minute,
        label: row.label.slice(0, 16),
        verdict: submission.verdict.slice(0, 64),
        accepted: submission.isAccepted,
      })
    }
  }
  const solvedOrder = [...rows.values()]
    .filter((row) => row.solvedMinute !== undefined)
    .sort((left, right) => (left.solvedMinute ?? 0) - (right.solvedMinute ?? 0))
  const spent = new Map<string, number>()
  let previousSolve = 0
  for (const row of solvedOrder) {
    const solvedAt = row.solvedMinute ?? 0
    spent.set(row.key, round1(Math.max(0, solvedAt - previousSolve)))
    previousSolve = solvedAt
  }
  const problems: ContestProblemBreakdown[] = [...rows.values()]
    .sort((left, right) => left.order - right.order)
    .slice(0, 26)
    .map((row) => ({
      label: row.label.slice(0, 16),
      externalId: row.externalId.slice(0, 128),
      ...(row.title === undefined ? {} : { title: row.title.slice(0, 512) }),
      ...(row.rating === undefined ? {} : { rating: row.rating }),
      tags: row.tags,
      attempts: row.attempts,
      wrongAttempts: row.wrongAttempts,
      solved: row.solvedMinute !== undefined,
      ...(row.firstSubmitMinute === undefined
        ? {}
        : { firstSubmitMinute: row.firstSubmitMinute }),
      ...(row.solvedMinute === undefined
        ? {}
        : { solvedMinute: row.solvedMinute }),
      ...(spent.get(row.key) === undefined
        ? {}
        : { minutesSpent: spent.get(row.key) }),
    }))
  const minutes = inContest.map((submission) => minuteOf(submission.occurredAt))
  const marks = [0, ...minutes]
  let longestGap = 0
  for (let index = 1; index < marks.length; index += 1) {
    longestGap = Math.max(
      longestGap,
      (marks[index] ?? 0) - (marks[index - 1] ?? 0),
    )
  }
  const lastMinute = minutes.at(-1)
  const firstAccepted = solvedOrder[0]?.solvedMinute
  const notes: string[] = []
  if (participation.mode === 'practice') {
    notes.push(
      'You worked on this contest after it ended; problems you solved count as upsolved.',
    )
  } else if (inContest.length === 0) {
    notes.push(
      'No submissions from this contest were found in your synced activity. Sync your platform to analyze it.',
    )
  }
  if (provider !== 'codeforces' && input.contestProblems.length === 0) {
    notes.push(
      'Only problems you submitted to are listed, in the order you first submitted; the contest problem list could not be loaded.',
    )
  }
  if (participation.completeness !== 'complete') {
    notes.push('The provider returned partial contest results.')
  }
  const parsed = ContestMetricsSchema.safeParse({
    provider,
    contestId: participation.contestId.slice(0, 128),
    name: (participation.contestName ?? contest.name).slice(0, 512),
    canonicalUrl: contest.canonicalUrl,
    startsAt: contest.startsAt.toISOString(),
    durationMinutes: duration,
    ...(participation.rank === undefined ? {} : { rank: participation.rank }),
    ...(participation.ratingChange === undefined
      ? {}
      : { ratingChange: participation.ratingChange }),
    ...(participation.oldRating === undefined
      ? {}
      : { oldRating: participation.oldRating }),
    ...(participation.newRating === undefined
      ? {}
      : { newRating: participation.newRating }),
    problems,
    timeline,
    solvedCount: solvedOrder.length,
    attemptedCount: [...rows.values()].filter((row) => row.attempts > 0).length,
    submissionCount: inContest.length,
    wrongSubmissions,
    problemSwitches,
    longestGapMinutes: round1(longestGap),
    ...(lastMinute === undefined
      ? {}
      : { idleTailMinutes: round1(Math.max(0, duration - lastMinute)) }),
    ...(firstAccepted === undefined
      ? {}
      : { firstAcceptedMinute: firstAccepted }),
    rapidWrongResubmits,
    coverage:
      (provider === 'codeforces'
        ? participation.completeness === 'complete'
        : input.contestProblems.length > 0) && inContest.length > 0
        ? 'complete'
        : 'partial',
    coverageNotes: notes.slice(0, 4),
  })
  return parsed.success ? parsed.data : undefined
}

const average = (values: readonly number[]) =>
  values.length === 0
    ? null
    : round1(values.reduce((sum, value) => sum + value, 0) / values.length)

export function contestPatterns(
  contests: readonly AnalyzedContest[],
): ContestPatternMetrics {
  const analyzed = contests
    .map((item) => ({ item, metrics: item.metrics }))
    .filter(
      (entry): entry is { item: AnalyzedContest; metrics: ContestMetrics } =>
        entry.metrics !== undefined && entry.metrics.submissionCount > 0,
    )
    .slice(0, 12)
  const topics = new Map<string, number>()
  const stuck = new Map<string, number>()
  let slowStarts = 0
  let earlyStops = 0
  let rapidContests = 0
  for (const { metrics } of analyzed) {
    const duration = metrics.durationMinutes
    if (
      metrics.firstAcceptedMinute === undefined ||
      metrics.firstAcceptedMinute > duration * 0.25
    ) {
      slowStarts += 1
    }
    const unsolvedAttemptedOrReachable = metrics.problems.some(
      (problem) => !problem.solved && problem.attempts > 0,
    )
    if (
      (metrics.idleTailMinutes ?? 0) >= Math.max(30, duration * 0.3) &&
      (unsolvedAttemptedOrReachable ||
        metrics.solvedCount < metrics.problems.length)
    ) {
      earlyStops += 1
    }
    if (metrics.rapidWrongResubmits >= 2) rapidContests += 1
    const maxSolvedRating = Math.max(
      0,
      ...metrics.problems
        .filter((problem) => problem.solved)
        .map((problem) => problem.rating ?? 0),
    )
    for (const problem of metrics.problems) {
      const reachable =
        problem.attempts > 0 ||
        (problem.rating !== undefined &&
          problem.rating <= maxSolvedRating + 300)
      if (problem.solved || !reachable) continue
      for (const tag of problem.tags.slice(0, 4)) {
        topics.set(tag, (topics.get(tag) ?? 0) + 1)
      }
    }
    const firstUnsolved = metrics.problems.find(
      (problem) => !problem.solved && problem.attempts > 0,
    )
    if (firstUnsolved !== undefined && metrics.provider === 'codeforces') {
      stuck.set(firstUnsolved.label, (stuck.get(firstUnsolved.label) ?? 0) + 1)
    }
  }
  const ratingChanges = contests
    .slice(0, 12)
    .map((item) => item.participation.ratingChange)
    .filter((value): value is number => value !== undefined)
  const minimumRepeat = analyzed.length >= 4 ? 2 : 1
  return {
    contestsAnalyzed: analyzed.length,
    averageSolved: average(analyzed.map(({ metrics }) => metrics.solvedCount)),
    averageFirstAcceptedMinute: average(
      analyzed
        .map(({ metrics }) => metrics.firstAcceptedMinute)
        .filter((value): value is number => value !== undefined),
    ),
    averageWrongPerContest: average(
      analyzed.map(({ metrics }) => metrics.wrongSubmissions),
    ),
    ratingDeltaTotal: Math.round(
      ratingChanges.reduce((sum, value) => sum + value, 0),
    ),
    ratingDrops: ratingChanges.filter((value) => value < 0).length,
    slowStarts,
    earlyStops,
    rapidResubmitContests: rapidContests,
    recurringUnsolvedTopics: [...topics]
      .filter(([, count]) => count >= minimumRepeat)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([topic, count]) => ({ topic: topic.slice(0, 64), count })),
    stuckPositions: [...stuck]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count })),
  }
}

// Compact metrics for the AI service: no identifiers beyond problem labels.
export const metricsForAi = (metrics: ContestMetrics) => ({
  provider: metrics.provider,
  name: metrics.name,
  durationMinutes: metrics.durationMinutes,
  ...(metrics.rank === undefined ? {} : { rank: metrics.rank }),
  ...(metrics.ratingChange === undefined
    ? {}
    : { ratingChange: metrics.ratingChange }),
  ...(metrics.oldRating === undefined ? {} : { oldRating: metrics.oldRating }),
  ...(metrics.newRating === undefined ? {} : { newRating: metrics.newRating }),
  problems: metrics.problems.map((problem) => ({
    label: problem.label,
    ...(problem.title === undefined ? {} : { title: problem.title }),
    ...(problem.rating === undefined ? {} : { rating: problem.rating }),
    tags: problem.tags,
    attempts: problem.attempts,
    wrongAttempts: problem.wrongAttempts,
    solved: problem.solved,
    ...(problem.firstSubmitMinute === undefined
      ? {}
      : { firstSubmitMinute: problem.firstSubmitMinute }),
    ...(problem.solvedMinute === undefined
      ? {}
      : { solvedMinute: problem.solvedMinute }),
    ...(problem.minutesSpent === undefined
      ? {}
      : { minutesSpent: problem.minutesSpent }),
  })),
  timeline: metrics.timeline,
  solvedCount: metrics.solvedCount,
  attemptedCount: metrics.attemptedCount,
  submissionCount: metrics.submissionCount,
  wrongSubmissions: metrics.wrongSubmissions,
  problemSwitches: metrics.problemSwitches,
  longestGapMinutes: metrics.longestGapMinutes,
  ...(metrics.idleTailMinutes === undefined
    ? {}
    : { idleTailMinutes: metrics.idleTailMinutes }),
  ...(metrics.firstAcceptedMinute === undefined
    ? {}
    : { firstAcceptedMinute: metrics.firstAcceptedMinute }),
  rapidWrongResubmits: metrics.rapidWrongResubmits,
  coverageNotes: metrics.coverageNotes,
})

const PRACTICE_WINDOW_MS = 21 * 86_400_000
const SESSION_GAP_MS = 60 * 60_000

// A practice sitting: from the first submission after the contest, for the
// contest's length, extended while submissions follow within an hour.
export function practiceSession(
  times: readonly number[],
  contestEnd: number,
  durationMs: number,
): { start: Date; end: Date } {
  const after = times.filter((at) => at > contestEnd).sort((a, b) => a - b)
  const first = after[0] ?? contestEnd
  let end = first + durationMs
  let previous = first
  for (const at of after.slice(1)) {
    if (at > end && at - previous > SESSION_GAP_MS) break
    end = Math.max(end, at)
    previous = at
  }
  return { start: new Date(first), end: new Date(end) }
}
const PRACTICE_LOOKBACK_MS = 120 * 86_400_000

// Codeforces contests the learner took part in without a rating change:
// live but unrated (Div. 3 or 4 above the rating limit, out of competition)
// or worked on in the three weeks after the contest (virtual or practice).
// Problem IDs carry the contest ID, so submissions identify the contest.
export function codeforcesContestsFromSubmissions(input: {
  submissions: readonly ActivitySubmission[]
  known: ReadonlySet<string>
  catalog: readonly CatalogContest[]
  now: Date
}): ActivityParticipation[] {
  const byContest = new Map<string, ActivitySubmission[]>()
  for (const submission of input.submissions) {
    if (submission.provider !== 'codeforces') continue
    if (
      input.now.getTime() - submission.occurredAt.getTime() >
      PRACTICE_LOOKBACK_MS
    ) {
      continue
    }
    const contestId = /^(\d{1,6})[A-Z][0-9]?$/.exec(submission.externalId)?.[1]
    if (contestId === undefined || input.known.has(contestId)) continue
    const list = byContest.get(contestId) ?? []
    list.push(submission)
    byContest.set(contestId, list)
  }
  const participations: ActivityParticipation[] = []
  for (const [contestId, submissions] of byContest) {
    const contest = input.catalog.find(
      (item) => item.provider === 'codeforces' && item.externalId === contestId,
    )
    if (contest?.startsAt === undefined) continue
    const start = contest.startsAt.getTime()
    const end = start + contestDurationMinutes('codeforces', contest) * 60_000
    const times = submissions.map((submission) =>
      submission.occurredAt.getTime(),
    )
    const live = times.some((at) => at >= start && at <= end)
    const soonAfter = times.some(
      (at) => at > end && at - end <= PRACTICE_WINDOW_MS,
    )
    if (!live && !soonAfter) continue
    participations.push({
      provider: 'codeforces',
      contestId,
      contestName: contest.name,
      canonicalUrl: contest.canonicalUrl,
      attendedAt: contest.startsAt,
      completeness: 'partial',
      mode: live ? 'unrated' : 'practice',
      ...(live ? {} : { session: practiceSession(times, end, end - start) }),
    })
  }
  return participations
}
