import {
  ProgressReportSchema,
  type ContestMetrics,
  type ImprovementTopic,
  type ProblemHelpSession,
  type ProgressInsight,
  type ProgressReport,
  type ProviderKey,
} from '@algomemtor/shared-contracts'

import {
  problemRef,
  type LearnerActivity,
  type ProblemMeta,
} from '../repositories/mentor-repository.js'

// Deterministic progress evaluation. Every number here comes from stored
// provider activity, contest results, the learning plan and Doubt Helper
// sessions; the optional AI narrative only interprets this report.

const DAY_MS = 86_400_000
const WEEKS = 12

const providerNames: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
}

const laneOrder: Record<string, number> = {
  current_focus: 0,
  needs_more_practice: 1,
  recommended_next: 2,
  revisit_later: 3,
  practiced_comfortable: 4,
  skipped: 5,
}

export const dayKey = (date: Date, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

const dayNumber = (key: string) =>
  Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY_MS)
const keyFromDayNumber = (value: number) =>
  new Date(value * DAY_MS).toISOString().slice(0, 10)

// Monday of the week containing the given local day.
export const weekStart = (key: string) => {
  const number = dayNumber(key)
  const weekday = (new Date(number * DAY_MS).getUTCDay() + 6) % 7
  return keyFromDayNumber(number - weekday)
}

export const humanTopic = (value: string) => value.replaceAll('-', ' ')

const median = (values: readonly number[]) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const value =
    sorted.length % 2 === 1
      ? (sorted[middle] ?? 0)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
  return Math.round(value * 10) / 10
}

const mean = (values: readonly number[]) =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length

const percent = (value: number) => `${Math.round(value * 100)}%`

export function slope(values: readonly number[]) {
  if (values.length < 3) return null
  const n = values.length
  const xMean = (n - 1) / 2
  const yMean = values.reduce((sum, value) => sum + value, 0) / n
  let numerator = 0
  let denominator = 0
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean)
    denominator += (index - xMean) ** 2
  })
  return denominator === 0 ? null : numerator / denominator
}

const band = (rating: number | undefined) =>
  rating === undefined
    ? 'Unrated'
    : rating < 1_200
      ? 'Under 1200'
      : rating < 1_600
        ? '1200–1599'
        : rating < 2_000
          ? '1600–1999'
          : '2000+'

export function buildProgressReport(input: {
  activity: LearnerActivity
  roadmapTopics: readonly ImprovementTopic[]
  contests: readonly ContestMetrics[]
  helpSessions: readonly ProblemHelpSession[]
  metadata: ReadonlyMap<string, ProblemMeta>
  upsolvePending: number
  revisionsDue: number
  timeZone: string
  now: Date
}): ProgressReport {
  const { activity, now, timeZone } = input
  const today = dayKey(now, timeZone)
  const thisWeek = weekStart(today)
  const weekKeys = Array.from({ length: WEEKS }, (_, index) =>
    keyFromDayNumber(dayNumber(thisWeek) - (WEEKS - 1 - index) * 7),
  )
  const weekSet = new Set(weekKeys)

  // First submission and first acceptance per problem.
  const firstSubmission = new Map<string, { at: Date; accepted: boolean }>()
  const firstAccepted = new Map<string, Date>()
  for (const submission of activity.submissions) {
    const ref = problemRef(submission.provider, submission.problemKey)
    if (!firstSubmission.has(ref)) {
      firstSubmission.set(ref, {
        at: submission.occurredAt,
        accepted: submission.isAccepted,
      })
    }
    if (submission.isAccepted && !firstAccepted.has(ref)) {
      firstAccepted.set(ref, submission.occurredAt)
    }
  }
  for (const solved of activity.solved) {
    const ref = problemRef(solved.provider, solved.problemKey)
    if (solved.occurredAt !== undefined && !firstAccepted.has(ref)) {
      firstAccepted.set(ref, solved.occurredAt)
    }
  }
  const observedTopics = new Map(
    activity.solved.map((item) => [
      problemRef(item.provider, item.problemKey),
      item.topics,
    ]),
  )
  const topicsFor = (ref: string) => {
    const meta = input.metadata.get(ref)
    return meta?.topics.length
      ? meta.topics
      : (observedTopics.get(ref) ?? meta?.tags ?? [])
  }

  // Accuracy by week.
  const accuracyByWeek = new Map(
    weekKeys.map((key) => [key, { attempted: 0, firstTryAccepted: 0 }]),
  )
  for (const first of firstSubmission.values()) {
    const week = weekStart(dayKey(first.at, timeZone))
    const bucket = accuracyByWeek.get(week)
    if (bucket === undefined) continue
    bucket.attempted += 1
    if (first.accepted) bucket.firstTryAccepted += 1
  }
  const accuracy = weekKeys.map((key) => {
    const bucket = accuracyByWeek.get(key) ?? {
      attempted: 0,
      firstTryAccepted: 0,
    }
    return {
      weekStart: key,
      attempted: bucket.attempted,
      firstTryAccepted: bucket.firstTryAccepted,
      rate:
        bucket.attempted === 0
          ? null
          : Math.round((bucket.firstTryAccepted / bucket.attempted) * 1_000) /
            1_000,
    }
  })

  // Consistency.
  const activeDays = new Set<string>()
  for (const submission of activity.submissions) {
    activeDays.add(dayKey(submission.occurredAt, timeZone))
  }
  for (const solved of activity.solved) {
    if (solved.occurredAt !== undefined) {
      activeDays.add(dayKey(solved.occurredAt, timeZone))
    }
  }
  const todayNumber = dayNumber(today)
  const activeNumbers = [...activeDays].map(dayNumber).sort((a, b) => a - b)
  const activeSet = new Set(activeNumbers)
  let currentStreak = 0
  let cursor = activeSet.has(todayNumber) ? todayNumber : todayNumber - 1
  while (activeSet.has(cursor)) {
    currentStreak += 1
    cursor -= 1
  }
  let longestStreak = 0
  let run = 0
  let previous: number | undefined
  for (const value of activeNumbers) {
    run = previous !== undefined && value === previous + 1 ? run + 1 : 1
    longestStreak = Math.max(longestStreak, run)
    previous = value
  }
  const solvedByWeek = new Map<string, number>()
  for (const at of firstAccepted.values()) {
    const week = weekStart(dayKey(at, timeZone))
    if (weekSet.has(week))
      solvedByWeek.set(week, (solvedByWeek.get(week) ?? 0) + 1)
  }
  const weeklyActive = new Map<string, number>()
  for (const value of activeNumbers) {
    const week = weekStart(keyFromDayNumber(value))
    if (weekSet.has(week))
      weeklyActive.set(week, (weeklyActive.get(week) ?? 0) + 1)
  }
  const lastActive = activeNumbers.at(-1)
  const consistency = {
    activeDaysLast30: activeNumbers.filter(
      (value) => value > todayNumber - 30 && value <= todayNumber,
    ).length,
    currentStreak,
    longestStreak,
    weekly: weekKeys.map((key) => ({
      weekStart: key,
      activeDays: Math.min(7, weeklyActive.get(key) ?? 0),
      solved: solvedByWeek.get(key) ?? 0,
    })),
  }

  // Rating trend and projection.
  const byProvider = new Map<ProviderKey, { date: Date; rating: number }[]>()
  for (const change of activity.ratingChanges) {
    const points = byProvider.get(change.provider) ?? []
    points.push({ date: change.occurredAt, rating: change.newRating })
    byProvider.set(change.provider, points)
  }
  const ratingTrend = [...byProvider]
    .map(([provider, points]) => {
      const recent = points.slice(-10).map((point) => point.rating)
      const perContest = slope(recent)
      const current = points.at(-1)?.rating ?? null
      const recentContests = points.filter(
        (point) => point.date.getTime() > now.getTime() - 90 * DAY_MS,
      ).length
      return {
        provider,
        points: points.slice(-60).map((point) => ({
          date: point.date.toISOString(),
          rating: Math.round(point.rating),
        })),
        current: current === null ? null : Math.round(current),
        changePerContest:
          perContest === null ? null : Math.round(perContest * 10) / 10,
        projection90d:
          perContest === null || current === null
            ? null
            : Math.round(current + perContest * Math.max(recentContests, 1)),
      }
    })
    .sort((left, right) => right.points.length - left.points.length)
    .slice(0, 4)

  // Contest solving speed by difficulty band.
  const samples: { at: number; band: string; minutes: number }[] = []
  for (const contest of input.contests) {
    const start = Date.parse(contest.startsAt)
    for (const problem of contest.problems) {
      if (!problem.solved || problem.minutesSpent === undefined) continue
      samples.push({
        at: start,
        band: band(problem.rating),
        minutes: problem.minutesSpent,
      })
    }
  }
  const bands = ['Under 1200', '1200–1599', '1600–1999', '2000+', 'Unrated']
  const solvingSpeed = bands
    .map((name) => {
      const values = samples
        .filter((sample) => sample.band === name)
        .sort((left, right) => left.at - right.at)
      const half = Math.floor(values.length / 2)
      return {
        band: name,
        samples: values.length,
        earlierMedianMinutes:
          values.length < 2
            ? null
            : median(values.slice(0, half).map((sample) => sample.minutes)),
        recentMedianMinutes: median(
          values
            .slice(values.length < 2 ? 0 : half)
            .map((sample) => sample.minutes),
        ),
      }
    })
    .filter((item) => item.samples > 0)

  // Hint dependency from Doubt Helper sessions.
  const windowStart = dayNumber(weekKeys[0] ?? thisWeek)
  const recentSessions = input.helpSessions
    .filter(
      (session) =>
        dayNumber(dayKey(new Date(session.createdAt), timeZone)) >= windowStart,
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  const sessionWeeks = new Map<string, number[]>()
  for (const session of recentSessions) {
    const week = weekStart(dayKey(new Date(session.createdAt), timeZone))
    const values = sessionWeeks.get(week) ?? []
    values.push(session.hintLevel)
    sessionWeeks.set(week, values)
  }
  const levels = recentSessions.map((session) => session.hintLevel)
  const half = Math.floor(levels.length / 2)
  const earlier = mean(levels.slice(0, half))
  const later = mean(levels.slice(half))
  const trend =
    levels.length < 4 || earlier === null || later === null
      ? ('insufficient_data' as const)
      : later - earlier >= 0.5
        ? ('rising' as const)
        : earlier - later >= 0.5
          ? ('falling' as const)
          : ('steady' as const)
  const averageHintLevel = mean(levels)
  const hintDependency = {
    sessions: recentSessions.length,
    averageHintLevel:
      averageHintLevel === null ? null : Math.round(averageHintLevel * 10) / 10,
    solutionRevealRate:
      recentSessions.length === 0
        ? null
        : Math.round(
            (recentSessions.filter(
              (session) => session.solutionRevealedAt !== undefined,
            ).length /
              recentSessions.length) *
              1_000,
          ) / 1_000,
    trend,
    weekly: weekKeys.map((key) => {
      const values = sessionWeeks.get(key) ?? []
      const average = mean(values)
      return {
        weekStart: key,
        sessions: values.length,
        averageHintLevel:
          average === null ? null : Math.round(average * 10) / 10,
      }
    }),
  }

  // Topic progress from the learning plan.
  const topicProgress = input.roadmapTopics
    .filter((topic) => topic.lane !== 'skipped')
    .sort(
      (left, right) =>
        (laneOrder[left.lane] ?? 9) - (laneOrder[right.lane] ?? 9) ||
        right.evidence.solvedProblems - left.evidence.solvedProblems,
    )
    .slice(0, 16)
    .map((topic) => ({
      topic: topic.topic,
      name: topic.name,
      score: topic.score,
      assessment: topic.assessment,
      solved: topic.evidence.solvedProblems,
      recentDays: topic.evidence.recentDays,
    }))

  // Insights.
  const insights: ProgressInsight[] = []
  const nowMs = now.getTime()
  const solvedLast30 = new Map<string, number>()
  for (const [ref, at] of firstAccepted) {
    if (at.getTime() < nowMs - 30 * DAY_MS) continue
    for (const topic of topicsFor(ref).slice(0, 4)) {
      solvedLast30.set(topic, (solvedLast30.get(topic) ?? 0) + 1)
    }
  }
  const topicAccuracy = new Map<string, { attempted: number; first: number }>()
  for (const [ref, first] of firstSubmission) {
    if (first.at.getTime() < nowMs - 60 * DAY_MS) continue
    for (const topic of topicsFor(ref).slice(0, 4)) {
      const value = topicAccuracy.get(topic) ?? { attempted: 0, first: 0 }
      value.attempted += 1
      if (first.accepted) value.first += 1
      topicAccuracy.set(topic, value)
    }
  }
  const busiest = [...solvedLast30].sort((a, b) => b[1] - a[1])[0]
  const weakest = [...topicAccuracy]
    .filter(([, value]) => value.attempted >= 5)
    .map(([topic, value]) => ({ topic, rate: value.first / value.attempted }))
    .filter((item) => item.rate < 0.6)
    .sort((left, right) => left.rate - right.rate)[0]
  if (weakest !== undefined) {
    const lead =
      busiest !== undefined && busiest[1] >= 3 && busiest[0] !== weakest.topic
        ? `You solved ${busiest[1]} ${humanTopic(busiest[0])} problems in the last 30 days, but your`
        : 'Your'
    insights.push({
      id: 'weak-accuracy',
      tone: 'warning',
      text: `${lead} first-try accuracy on ${humanTopic(weakest.topic)} is ${percent(weakest.rate)}. Put your next practice problems on ${humanTopic(weakest.topic)}.`,
      link: { target: 'recommendations', label: 'Get practice problems' },
    })
  }
  const stale = input.roadmapTopics
    .filter(
      (topic) =>
        (topic.lane === 'current_focus' ||
          topic.lane === 'needs_more_practice') &&
        topic.evidence.recentDays >= 14,
    )
    .sort(
      (left, right) => right.evidence.recentDays - left.evidence.recentDays,
    )[0]
  if (stale !== undefined) {
    insights.push({
      id: 'stale-topic',
      tone: 'warning',
      text: `You have not practiced ${stale.name} in ${stale.evidence.recentDays} days. A revision session is recommended before your next contest.`,
      link: { target: 'recommendations', label: 'Get practice problems' },
    })
  }
  const recentAccuracy = accuracy.slice(-4)
  const priorAccuracy = accuracy.slice(-8, -4)
  const sum = (items: typeof accuracy, key: 'attempted' | 'firstTryAccepted') =>
    items.reduce((total, item) => total + item[key], 0)
  const recentAttempted = sum(recentAccuracy, 'attempted')
  const priorAttempted = sum(priorAccuracy, 'attempted')
  if (recentAttempted >= 5 && priorAttempted >= 5) {
    const recentRate = sum(recentAccuracy, 'firstTryAccepted') / recentAttempted
    const priorRate = sum(priorAccuracy, 'firstTryAccepted') / priorAttempted
    const delta = recentRate - priorRate
    if (Math.abs(delta) >= 0.05) {
      insights.push({
        id: 'accuracy-trend',
        tone: delta > 0 ? 'positive' : 'warning',
        text: `Your first-attempt acceptance rate ${delta > 0 ? 'improved' : 'dropped'} from ${percent(priorRate)} to ${percent(recentRate)} over the last 4 weeks.`,
      })
    }
  }
  const contestSolves = input.contests
    .filter((contest) => contest.submissionCount > 0)
    .map((contest) => contest.solvedCount)
  const lastFour = mean(contestSolves.slice(0, 4))
  const previousFour = mean(contestSolves.slice(4, 8))
  if (
    contestSolves.length >= 6 &&
    lastFour !== null &&
    previousFour !== null &&
    previousFour > 0
  ) {
    const change = (lastFour - previousFour) / previousFour
    if (Math.abs(change) >= 0.1) {
      insights.push({
        id: 'contest-solve-rate',
        tone: change > 0 ? 'positive' : 'warning',
        text: `Your contest solve rate ${change > 0 ? 'improved' : 'fell'} by ${Math.round(Math.abs(change) * 100)}% over your last 4 contests (${lastFour.toFixed(1)} vs ${previousFour.toFixed(1)} problems per contest).`,
        link: { target: 'contest_analysis', label: 'See contest analysis' },
      })
    }
  }
  const mainTrend = ratingTrend[0]
  if (
    mainTrend?.changePerContest !== null &&
    mainTrend?.changePerContest !== undefined &&
    mainTrend.projection90d !== null &&
    Math.abs(mainTrend.changePerContest) >= 3
  ) {
    const name = providerNames[mainTrend.provider]
    insights.push(
      mainTrend.changePerContest > 0
        ? {
            id: 'rating-projection',
            tone: 'positive',
            text: `At your recent pace (+${Math.round(mainTrend.changePerContest)} per contest), your ${name} rating could reach about ${mainTrend.projection90d} in 90 days. This is an estimate, not a promise.`,
          }
        : {
            id: 'rating-projection',
            tone: 'warning',
            text: `Your ${name} rating has been falling by about ${Math.abs(Math.round(mainTrend.changePerContest))} per contest recently. Contest analysis can show what is driving it.`,
            link: { target: 'contest_analysis', label: 'Analyze contests' },
          },
    )
  }
  if (trend === 'falling' || trend === 'rising') {
    insights.push({
      id: 'hint-dependency',
      tone: trend === 'falling' ? 'positive' : 'warning',
      text:
        trend === 'falling'
          ? `You are relying on fewer hints: your average Doubt Helper hint level fell from ${earlier?.toFixed(1)} to ${later?.toFixed(1)}.`
          : `You are leaning on more hints lately (average level ${earlier?.toFixed(1)} → ${later?.toFixed(1)}). Try spending 10 more minutes before asking for the next one.`,
      link: { target: 'doubt_helper', label: 'Open Doubt Helper' },
    })
  }
  if (input.upsolvePending > 0) {
    insights.push({
      id: 'upsolve-pending',
      tone: 'neutral',
      text: `${input.upsolvePending} contest ${input.upsolvePending === 1 ? 'problem is' : 'problems are'} waiting in your upsolve queue.`,
      link: { target: 'upsolve', label: 'Open upsolve queue' },
    })
  }
  if (input.revisionsDue > 0) {
    insights.push({
      id: 'revisions-due',
      tone: 'neutral',
      text: `${input.revisionsDue} ${input.revisionsDue === 1 ? 'revision is' : 'revisions are'} due. Revisit ${input.revisionsDue === 1 ? 'it' : 'them'} to make the learning stick.`,
      link: { target: 'upsolve', label: 'Open upsolve queue' },
    })
  }
  if (currentStreak >= 3) {
    insights.push({
      id: 'streak',
      tone: 'positive',
      text: `You are on a ${currentStreak}-day practice streak. Keep it going.`,
    })
  } else if (lastActive !== undefined && todayNumber - lastActive >= 5) {
    insights.push({
      id: 'inactive',
      tone: 'warning',
      text: `No practice activity in the last ${todayNumber - lastActive} days. A short session today rebuilds momentum.`,
      link: { target: 'recommendations', label: "See today's problems" },
    })
  }

  return ProgressReportSchema.parse({
    generatedAt: now.toISOString(),
    topicProgress,
    ratingTrend,
    accuracy,
    consistency,
    solvingSpeed,
    hintDependency,
    insights: insights.slice(0, 8),
  })
}
