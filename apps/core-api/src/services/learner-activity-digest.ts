import { createHash } from 'node:crypto'

import {
  LEARNER_ACTIVITY_DIGEST_VERSION,
  LearnerActivityDigestSchema,
  programmingLanguageFamily,
  type ContestParticipation,
  type LearnerActivityDigest,
  type ProviderKey,
  type ProviderSolvedProblem,
  type ProviderSubmission,
  type VerdictGroup,
} from '@algomemtor/shared-contracts'

import { verdictGroup } from './coach-workspace.js'

export type DigestAccount = {
  provider: ProviderKey
  handle: string
  verified: boolean
  historyComplete: boolean
  platformSolvedCount?: number
  rating?: number
  maxRating?: number
}

export type DigestCatalogEntry = {
  title?: string
  rating?: number
  topics: readonly string[]
}

export type DigestInput = {
  now: Date
  accounts: readonly DigestAccount[]
  submissions: readonly ProviderSubmission[]
  solved: readonly ProviderSolvedProblem[]
  contests: readonly ContestParticipation[]
  // Catalog metadata keyed by `provider:externalId`.
  catalog: ReadonlyMap<string, DigestCatalogEntry>
}

const DAY_MS = 86_400_000
// Tags that name a source rather than a technique.
const NON_TOPICS = new Set(['cses', 'codeforces', 'codechef', 'leetcode'])
// A topic needs this many solves to count as a strength, and this many
// failures or open attempts to count as a weakness.
const MIN_STRENGTH_SOLVES = 3
const MIN_WEAKNESS_FAILURES = 3
const MIN_WEAKNESS_SUBMISSIONS = 4

const identity = (provider: string, externalId: string) =>
  `${provider}:${externalId}`

const round1 = (value: number) => Math.round(value * 10) / 10
const pct = (part: number, whole: number) =>
  whole === 0 ? undefined : round1((part / whole) * 100)

const median = (values: readonly number[]) => {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const increment = <K>(counts: Map<K, number>, key: K, by = 1) =>
  counts.set(key, (counts.get(key) ?? 0) + by)

type ProblemFacts = {
  provider: ProviderKey
  externalId: string
  title?: string
  rating?: number
  topics: string[]
  submissions: ProviderSubmission[]
  solved: boolean
  solvedAt?: string
}

export const computeLearnerActivityDigest = (
  input: DigestInput,
): LearnerActivityDigest => {
  const now = input.now.getTime()
  const problems = new Map<string, ProblemFacts>()
  const problemFor = (provider: ProviderKey, externalId: string) => {
    const key = identity(provider, externalId)
    let facts = problems.get(key)
    if (facts === undefined) {
      const catalog = input.catalog.get(key)
      facts = {
        provider,
        externalId,
        ...(catalog?.title === undefined ? {} : { title: catalog.title }),
        ...(catalog?.rating === undefined ? {} : { rating: catalog.rating }),
        topics: [...(catalog?.topics ?? [])],
        submissions: [],
        solved: false,
      }
      problems.set(key, facts)
    }
    return facts
  }

  for (const observation of input.solved) {
    const facts = problemFor(observation.provider, observation.externalId)
    facts.solved = true
    if (observation.occurredAt !== null) facts.solvedAt = observation.occurredAt
    for (const topic of observation.topics ?? []) {
      if (!facts.topics.includes(topic)) facts.topics.push(topic)
    }
  }
  for (const submission of input.submissions) {
    const facts = problemFor(submission.provider, submission.externalId)
    facts.submissions.push(submission)
    if (facts.title === undefined && submission.problemTitle !== undefined)
      facts.title = submission.problemTitle
    if (submission.isAccepted) {
      facts.solved = true
      if (
        submission.occurredAt !== undefined &&
        (facts.solvedAt === undefined || submission.occurredAt < facts.solvedAt)
      ) {
        facts.solvedAt = submission.occurredAt
      }
    }
  }
  for (const facts of problems.values()) {
    facts.topics = facts.topics.filter((topic) => !NON_TOPICS.has(topic))
    facts.submissions.sort((left, right) =>
      (left.occurredAt ?? '').localeCompare(right.occurredAt ?? ''),
    )
  }

  const all = [...problems.values()]
  const solved = all.filter((facts) => facts.solved)
  const attempted = all.filter(
    (facts) => !facts.solved && facts.submissions.length > 0,
  )
  const solvedWithHistory = solved.filter(
    (facts) => facts.submissions.length > 0,
  )
  const firstTry = solvedWithHistory.filter(
    (facts) => facts.submissions[0]?.isAccepted === true,
  ).length

  // Verdicts and failure patterns.
  const verdicts = new Map<VerdictGroup, number>()
  const failureTopics = new Map<VerdictGroup, Map<string, number>>()
  for (const facts of all) {
    for (const submission of facts.submissions) {
      const group = verdictGroup(submission.verdict, submission.isAccepted)
      increment(verdicts, group)
      if (group === 'accepted') continue
      const topics = failureTopics.get(group) ?? new Map<string, number>()
      facts.topics.forEach((topic) => increment(topics, topic))
      failureTopics.set(group, topics)
    }
  }
  const failures = [...verdicts.entries()]
    .filter(([group]) => group !== 'accepted')
    .reduce((sum, [, value]) => sum + value, 0)
  const failurePatterns = [...verdicts.entries()]
    .filter(([group, value]) => group !== 'accepted' && value > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([group, value]) => ({
      verdict: group,
      count: value,
      shareOfFailures: pct(value, failures) ?? 0,
      topics: [...(failureTopics.get(group) ?? new Map()).entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([topic]) => topic),
    }))

  // Topic strengths and weaknesses.
  type TopicStats = {
    solved: number
    attemptedUnsolved: number
    failed: number
    submissions: number
    firstTry: number
    solvedWithHistory: number
  }
  const topics = new Map<string, TopicStats>()
  for (const facts of all) {
    const failed = facts.submissions.filter((row) => !row.isAccepted).length
    for (const topic of facts.topics) {
      const stats = topics.get(topic) ?? {
        solved: 0,
        attemptedUnsolved: 0,
        failed: 0,
        submissions: 0,
        firstTry: 0,
        solvedWithHistory: 0,
      }
      if (facts.solved) stats.solved += 1
      else if (facts.submissions.length > 0) stats.attemptedUnsolved += 1
      stats.failed += failed
      stats.submissions += facts.submissions.length
      if (facts.solved && facts.submissions.length > 0) {
        stats.solvedWithHistory += 1
        if (facts.submissions[0]?.isAccepted === true) stats.firstTry += 1
      }
      topics.set(topic, stats)
    }
  }
  const topicEntries = [...topics.entries()]
  const strengths = topicEntries
    .filter(([, stats]) => stats.solved >= MIN_STRENGTH_SOLVES)
    .sort(
      (left, right) =>
        right[1].solved - left[1].solved ||
        (pct(right[1].firstTry, right[1].solvedWithHistory) ?? 0) -
          (pct(left[1].firstTry, left[1].solvedWithHistory) ?? 0),
    )
    .slice(0, 8)
    .map(([topic, stats]) => {
      const firstTryRate = pct(stats.firstTry, stats.solvedWithHistory)
      return {
        topic,
        solved: stats.solved,
        ...(firstTryRate === undefined ? {} : { firstTryRate }),
      }
    })
  // A weakness fails noticeably more often than this learner usually does, so
  // high-volume topics are not flagged just for having many attempts.
  const overallFailureRate = pct(failures, input.submissions.length) ?? 0
  const weaknesses = topicEntries
    .map(([topic, stats]) => ({
      topic,
      solved: stats.solved,
      attemptedUnsolved: stats.attemptedUnsolved,
      failedSubmissions: stats.failed,
      failureRate: pct(stats.failed, stats.submissions) ?? 0,
      submissions: stats.submissions,
    }))
    .filter(
      (item) =>
        item.submissions >= MIN_WEAKNESS_SUBMISSIONS &&
        (item.failedSubmissions >= MIN_WEAKNESS_FAILURES ||
          item.attemptedUnsolved >= 2) &&
        (item.failureRate > overallFailureRate || item.attemptedUnsolved >= 2),
    )
    // Weight the excess failure rate by volume so one bad attempt does not
    // dominate.
    .sort(
      (left, right) =>
        (right.failureRate - overallFailureRate) *
          Math.log2(2 + right.failedSubmissions + right.attemptedUnsolved) -
        (left.failureRate - overallFailureRate) *
          Math.log2(2 + left.failedSubmissions + left.attemptedUnsolved),
    )
    .slice(0, 8)
    .map(({ submissions: _submissions, ...item }) => item)

  // Difficulty by provider.
  const providers = [...new Set(all.map((facts) => facts.provider))]
  const difficulty = providers.flatMap((provider) => {
    const rated = solved
      .filter(
        (facts) => facts.provider === provider && facts.rating !== undefined,
      )
      .sort((left, right) =>
        (right.solvedAt ?? '').localeCompare(left.solvedAt ?? ''),
      )
    const ratings = rated.map((facts) => facts.rating as number)
    if (ratings.length === 0) return []
    const recent = median(ratings.slice(0, 20))
    const overall = median(ratings)
    return [
      {
        provider,
        ...(overall === undefined ? {} : { medianSolvedRating: overall }),
        ...(recent === undefined ? {} : { recentMedianSolvedRating: recent }),
        maxSolvedRating: Math.max(...ratings),
      },
    ]
  })

  // Activity.
  const submissionTimes = input.submissions
    .flatMap((row) =>
      row.occurredAt === undefined ? [] : [new Date(row.occurredAt).getTime()],
    )
    .filter(Number.isFinite)
  const solveTimes = solved
    .flatMap((facts) =>
      facts.solvedAt === undefined ? [] : [new Date(facts.solvedAt).getTime()],
    )
    .filter(Number.isFinite)
  const within = (times: number[], days: number) =>
    times.filter((time) => now - time <= days * DAY_MS && time <= now).length
  const activeDays = new Set(
    [...submissionTimes, ...solveTimes].map((time) =>
      new Date(time).toISOString().slice(0, 10),
    ),
  )
  let streak = 0
  let day = now
  if (!activeDays.has(new Date(day).toISOString().slice(0, 10))) day -= DAY_MS
  while (activeDays.has(new Date(day).toISOString().slice(0, 10))) {
    streak += 1
    day -= DAY_MS
  }
  const hours = new Map<number, number>()
  submissionTimes.forEach((time) =>
    increment(hours, new Date(time).getUTCHours()),
  )
  const busiestHour = [...hours.entries()].sort((a, b) => b[1] - a[1])[0]
  const lastActive = Math.max(...submissionTimes, ...solveTimes, -Infinity)

  const languages = new Map<string, number>()
  input.submissions.forEach((row) => {
    if (row.language !== undefined)
      increment(languages, programmingLanguageFamily(row.language))
  })

  const lastActivityFor = (provider: ProviderKey) => {
    const times = all
      .filter((facts) => facts.provider === provider)
      .flatMap((facts) => [
        ...facts.submissions.flatMap((row) =>
          row.occurredAt === undefined ? [] : [row.occurredAt],
        ),
        ...(facts.solvedAt === undefined ? [] : [facts.solvedAt]),
      ])
      .sort()
    return times.at(-1)
  }
  const acceptedSubmissions = verdicts.get('accepted') ?? 0
  const solvedSubmissions = solvedWithHistory.reduce(
    (sum, facts) => sum + facts.submissions.length,
    0,
  )
  const ref = (facts: ProblemFacts) => ({
    provider: facts.provider,
    externalId: facts.externalId,
    ...(facts.title === undefined ? {} : { title: facts.title.slice(0, 512) }),
    ...(facts.rating === undefined ? {} : { rating: facts.rating }),
    topics: facts.topics.slice(0, 12),
  })
  const acceptanceRate = pct(acceptedSubmissions, input.submissions.length)
  const firstTryRate = pct(firstTry, solvedWithHistory.length)

  return LearnerActivityDigestSchema.parse({
    version: LEARNER_ACTIVITY_DIGEST_VERSION,
    computedAt: input.now.toISOString(),
    totals: {
      solved: solved.length,
      attemptedUnsolved: attempted.length,
      submissions: input.submissions.length,
      acceptedSubmissions,
      ...(acceptanceRate === undefined ? {} : { acceptanceRate }),
      ...(firstTryRate === undefined ? {} : { firstTryRate }),
      ...(solvedWithHistory.length === 0
        ? {}
        : {
            submissionsPerSolve: round1(
              solvedSubmissions / solvedWithHistory.length,
            ),
          }),
    },
    providers: input.accounts.slice(0, 4).map((account) => {
      const own = all.filter((facts) => facts.provider === account.provider)
      const lastActivityAt = lastActivityFor(account.provider)
      return {
        provider: account.provider,
        handle: account.handle,
        verified: account.verified,
        historyComplete: account.historyComplete,
        viaConnector: input.submissions.some(
          (row) =>
            row.provider === account.provider &&
            row.provenance.extractionStrategy === 'authenticated_connector',
        ),
        ...(account.platformSolvedCount === undefined
          ? {}
          : { platformSolvedCount: account.platformSolvedCount }),
        solved: own.filter((facts) => facts.solved).length,
        attemptedUnsolved: own.filter(
          (facts) => !facts.solved && facts.submissions.length > 0,
        ).length,
        submissions: own.reduce(
          (sum, facts) => sum + facts.submissions.length,
          0,
        ),
        ...(account.rating === undefined ? {} : { rating: account.rating }),
        ...(account.maxRating === undefined
          ? {}
          : { maxRating: account.maxRating }),
        ...(lastActivityAt === undefined
          ? {}
          : { lastActivityAt: new Date(lastActivityAt).toISOString() }),
      }
    }),
    verdicts: Object.fromEntries(verdicts),
    failurePatterns: failurePatterns.slice(0, 6),
    topics: { strengths, weaknesses },
    difficulty: difficulty.slice(0, 4),
    activity: {
      solvedLast7Days: within(solveTimes, 7),
      solvedLast30Days: within(solveTimes, 30),
      solvedLast90Days: within(solveTimes, 90),
      submissionsLast30Days: within(submissionTimes, 30),
      activeDaysLast30: [...activeDays].filter(
        (value) => now - Date.parse(`${value}T00:00:00Z`) <= 30 * DAY_MS,
      ).length,
      currentStreakDays: streak,
      ...(Number.isFinite(lastActive)
        ? { lastActiveAt: new Date(lastActive).toISOString() }
        : {}),
      ...(busiestHour === undefined ? {} : { busiestHourUtc: busiestHour[0] }),
    },
    contests: {
      total: input.contests.length,
      recent: [...input.contests]
        .sort((left, right) =>
          (right.attendedAt ?? '').localeCompare(left.attendedAt ?? ''),
        )
        .slice(0, 5)
        .map((contest) => ({
          provider: contest.provider,
          ...(contest.contestName === undefined
            ? {}
            : { name: contest.contestName.slice(0, 512) }),
          ...(contest.rank === undefined ? {} : { rank: contest.rank }),
          ...(contest.ratingChange === undefined
            ? {}
            : { delta: contest.ratingChange }),
          ...(contest.attendedAt === undefined
            ? {}
            : { at: new Date(contest.attendedAt).toISOString() }),
        })),
    },
    languages: Object.fromEntries(
      [...languages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    ),
    recentSolves: solved
      .filter((facts) => facts.solvedAt !== undefined)
      .sort((left, right) =>
        (right.solvedAt ?? '').localeCompare(left.solvedAt ?? ''),
      )
      .slice(0, 10)
      .map((facts) => ({
        ...ref(facts),
        ...(facts.solvedAt === undefined
          ? {}
          : { solvedAt: new Date(facts.solvedAt).toISOString() }),
      })),
    openAttempts: attempted
      .map((facts) => {
        const last = facts.submissions.at(-1)
        return {
          ...ref(facts),
          failedSubmissions: facts.submissions.length,
          lastVerdict: verdictGroup(last?.verdict ?? '', false),
          ...(last?.occurredAt === undefined
            ? {}
            : { lastAttemptAt: new Date(last.occurredAt).toISOString() }),
        }
      })
      .sort((left, right) =>
        (right.lastAttemptAt ?? '').localeCompare(left.lastAttemptAt ?? ''),
      )
      .slice(0, 10),
  })
}

// Identifies a digest's content independent of when it was computed.
export const digestSourceHash = (digest: LearnerActivityDigest) => {
  const { computedAt: _computedAt, activity, ...rest } = digest
  // Time-window counts drift daily without new data; hash the data itself.
  const {
    solvedLast7Days: _7,
    solvedLast30Days: _30,
    solvedLast90Days: _90,
    submissionsLast30Days: _s30,
    activeDaysLast30: _a30,
    currentStreakDays: _streak,
    ...stable
  } = activity
  return createHash('sha256')
    .update(JSON.stringify({ ...rest, activity: stable }))
    .digest('hex')
}

const verdictLabel: Record<VerdictGroup, string> = {
  accepted: 'accepted',
  wrong_answer: 'wrong answer',
  time_limit: 'time limit exceeded',
  memory_limit: 'memory limit exceeded',
  runtime_error: 'runtime error',
  compile_error: 'compilation error',
  other: 'other failures',
}

const list = (values: readonly string[]) => values.slice(0, 5).join(', ')

// A short factual note about what changed, for the memory service. It avoids
// handles, IDs, and URLs; problem titles and topics are the evidence.
export const describeActivityChange = (
  previous: LearnerActivityDigest | null,
  next: LearnerActivityDigest,
): string | null => {
  const parts: string[] = []
  if (previous === null) {
    const { totals } = next
    if (totals.solved === 0 && totals.submissions === 0) return null
    parts.push(
      `Synced platform history: ${totals.solved} problems solved, ${totals.attemptedUnsolved} attempted but unsolved, ${totals.submissions} submissions${totals.acceptanceRate === undefined ? '' : ` (${totals.acceptanceRate}% accepted)`}${totals.firstTryRate === undefined ? '' : `, ${totals.firstTryRate}% of solves accepted on the first try`}.`,
    )
    if (next.topics.strengths.length > 0)
      parts.push(
        `Most-solved topics: ${list(next.topics.strengths.map((item) => `${item.topic} (${item.solved})`))}.`,
      )
    if (next.topics.weaknesses.length > 0)
      parts.push(
        `Topics with the most failed submissions: ${list(next.topics.weaknesses.map((item) => `${item.topic} (${item.failureRate}% of submissions failed)`))}.`,
      )
    const pattern = next.failurePatterns[0]
    if (pattern !== undefined)
      parts.push(
        `Most common failure: ${verdictLabel[pattern.verdict]} (${pattern.shareOfFailures}% of failures${pattern.topics.length === 0 ? '' : `, often in ${list(pattern.topics)}`}).`,
      )
    for (const item of next.difficulty)
      if (item.recentMedianSolvedRating !== undefined)
        parts.push(
          `Recent ${item.provider} solves are typically rated ${item.recentMedianSolvedRating} (hardest ${item.maxSolvedRating}).`,
        )
  } else {
    const newSolved = next.totals.solved - previous.totals.solved
    const newSubmissions = next.totals.submissions - previous.totals.submissions
    const newAccepted =
      next.totals.acceptedSubmissions - previous.totals.acceptedSubmissions
    const newFailures = newSubmissions - newAccepted
    const knownSolves = new Set(
      previous.recentSolves.map(
        (item) => `${item.provider}:${item.externalId}`,
      ),
    )
    const fresh = next.recentSolves.filter(
      (item) => !knownSolves.has(`${item.provider}:${item.externalId}`),
    )
    if (newSolved > 0) {
      const described = fresh
        .slice(0, 5)
        .map(
          (item) =>
            `${item.title ?? item.provider}${item.rating === undefined ? '' : ` (rated ${item.rating})`}${item.topics.length === 0 ? '' : ` [${item.topics.slice(0, 3).join(', ')}]`}`,
        )
      parts.push(
        `Solved ${newSolved} new problem${newSolved === 1 ? '' : 's'}${described.length === 0 ? '' : `: ${described.join('; ')}`}.`,
      )
    }
    if (newFailures >= MIN_WEAKNESS_FAILURES) {
      const pattern = next.failurePatterns[0]
      parts.push(
        `Made ${newFailures} unsuccessful submissions${pattern === undefined ? '' : `; overall the most common failure is ${verdictLabel[pattern.verdict]}`}.`,
      )
    }
    const oldWeak = new Set(
      previous.topics.weaknesses.map((item) => item.topic),
    )
    const newWeak = next.topics.weaknesses.filter(
      (item) => !oldWeak.has(item.topic),
    )
    if (newWeak.length > 0)
      parts.push(
        `Newly struggling topics: ${list(newWeak.map((item) => `${item.topic} (${item.failedSubmissions} failed submissions)`))}.`,
      )
    const oldStrong = new Set(
      previous.topics.strengths.map((item) => item.topic),
    )
    const newStrong = next.topics.strengths.filter(
      (item) => !oldStrong.has(item.topic),
    )
    if (newStrong.length > 0)
      parts.push(
        `Newly strong topics: ${list(newStrong.map((item) => `${item.topic} (${item.solved} solved)`))}.`,
      )
    const knownContests = new Set(
      previous.contests.recent.map((item) => `${item.provider}:${item.at}`),
    )
    for (const contest of next.contests.recent) {
      if (knownContests.has(`${contest.provider}:${contest.at}`)) continue
      parts.push(
        `Took part in ${contest.name ?? `a ${contest.provider} contest`}${contest.rank === undefined ? '' : `, rank ${contest.rank}`}${contest.delta === undefined ? '' : `, rating ${contest.delta >= 0 ? '+' : ''}${contest.delta}`}.`,
      )
    }
  }
  if (parts.length === 0) return null
  // Learner-visible titles are evidence text, not instructions.
  return `Synced coding-platform activity (measured, not self-reported). ${parts.join(' ')}`.slice(
    0,
    1000,
  )
}
