import {
  languageFamilyCounts,
  programmingLanguageFamily,
  type ContestParticipation,
  type ExternalProblemSummary,
  type ImprovementRoadmap,
  type LearnerProblemStatus,
  type ProviderKey,
  type ProviderProfile,
  type ProviderRatingChange,
  type ProviderSolvedProblem,
  type ProviderSubmission,
} from '@algomemtor/shared-contracts'

// The coach workspace is the learner's complete, owner-scoped data set for a
// single coaching turn. FastAPI keeps it out of the prompt and exposes it to
// the model only through bounded, read-only query tools, so the coach can
// answer "how many 1600 DP problems did I solve?" from real rows instead of a
// 50-item recent window. It never contains URLs, credentials, source code, or
// problem statements.

export const COACH_WORKSPACE_VERSION = 'coach-workspace-v1'

const MAX_SOLVED = 5_000
const MAX_SUBMISSIONS = 2_500
const MAX_ATTEMPTED = 400
const MAX_CONTESTS = 400
const MAX_RATINGS = 400
const MAX_POOL = 360

export type CoachWorkspaceProblem = {
  id: string
  provider: ProviderKey
  externalId: string
  title?: string
  rating?: number
  difficulty?: 'easy' | 'medium' | 'hard'
  tags: string[]
  topics: string[]
}

export type CoachWorkspace = {
  version: typeof COACH_WORKSPACE_VERSION
  generatedAt: string
  timezone: string
  accounts: Array<{
    provider: ProviderKey
    handle: string
    rank?: string
    rating?: number
    maxRating?: number
    globalRank?: number
    platformSolvedCount?: number
    acceptanceRate?: number
    ratedContests: number
    languages: Record<string, number>
    badges: string[]
    completeness: string
    fetchedAt: string
    stale: boolean
  }>
  solved: Array<
    CoachWorkspaceProblem & { solvedAt?: string; source: 'provider' | 'manual' }
  >
  attempted: Array<
    CoachWorkspaceProblem & {
      failedSubmissions: number
      lastVerdict?: string
      lastAttemptAt?: string
    }
  >
  submissions: Array<{
    id: string
    provider: ProviderKey
    externalId: string
    title?: string
    verdict: string
    accepted: boolean
    language?: string
    at?: string
    rating?: number
    tags: string[]
  }>
  contests: Array<{
    provider: ProviderKey
    contestId: string
    name?: string
    rank?: number
    score?: number
    delta?: number
    oldRating?: number
    newRating?: number
    at?: string
  }>
  ratings: Array<{
    provider: ProviderKey
    contestName?: string
    at: string
    oldRating: number
    newRating: number
    delta: number
    percentile?: number
  }>
  practicePool: Array<CoachWorkspaceProblem & { solvedCount?: number }>
  topics: Array<{
    topic: string
    name: string
    lane: string
    assessment: string
    score: number
    confidence: number
    manualStatus?: string
  }>
  bookmarks: Array<{ id: string; title?: string }>
  digest: CoachProfileDigest
  dataNote: string
  submissionNote: string
}

export type CoachProfileDigest = ReturnType<typeof buildDigest>

export type CoachWorkspaceInput = {
  now: Date
  timezone: string
  providerProfiles: readonly ProviderProfile[]
  solved: readonly ProviderSolvedProblem[]
  submissions: readonly ProviderSubmission[]
  ratings: readonly ProviderRatingChange[]
  contests: readonly ContestParticipation[]
  catalog: readonly ExternalProblemSummary[]
  roadmap: ImprovementRoadmap
  statuses: ReadonlyMap<string, LearnerProblemStatus>
  manualSolvedAt: ReadonlyMap<string, Date>
  dismissed: ReadonlySet<string>
  bookmarks: ReadonlyArray<{ provider: ProviderKey; externalId: string }>
  excludedTopics: readonly string[]
  canonicalTopic: (value: string) => string
  difficultyComfort?: string
}

const identity = (provider: string, externalId: string) =>
  `${provider}:${externalId}`

const byDateDesc = (left?: string, right?: string) =>
  (right ?? '').localeCompare(left ?? '')

const median = (values: readonly number[]) => {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const numericRating = (problem?: ExternalProblemSummary) =>
  typeof problem?.providerDifficulty === 'number' &&
  Number.isFinite(problem.providerDifficulty) &&
  problem.providerDifficulty > 0
    ? Math.round(problem.providerDifficulty)
    : undefined

const localDate = (date: Date, timezone: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

const topCounts = (counts: Map<string, number>, limit: number) =>
  Object.fromEntries(
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit),
  )

const increment = (counts: Map<string, number>, key: string, by = 1) =>
  counts.set(key, (counts.get(key) ?? 0) + by)

export const verdictGroup = (verdict: string, accepted: boolean) => {
  if (accepted) return 'accepted'
  const text = verdict.toLowerCase().replace(/[_-]+/g, ' ')
  if (/^(wrong|wa\b)/.test(text)) return 'wrong_answer'
  if (/^(time|tle\b)/.test(text)) return 'time_limit'
  if (/^(memory|mle\b)/.test(text)) return 'memory_limit'
  if (/^(runtime|re\b)/.test(text)) return 'runtime_error'
  if (/^(compil|ce\b)/.test(text)) return 'compile_error'
  return 'other'
}

export function buildCoachWorkspace(input: CoachWorkspaceInput): {
  workspace: CoachWorkspace
  practiceProblems: Map<string, ExternalProblemSummary>
} {
  const excluded = new Set(input.excludedTopics)
  const allowedLabel = (label: string) =>
    !excluded.has(input.canonicalTopic(label))
  const catalogById = new Map<string, ExternalProblemSummary>()
  for (const problem of input.catalog) {
    const key = identity(problem.provider, problem.externalId)
    if (!catalogById.has(key)) catalogById.set(key, problem)
  }
  const describe = (
    provider: ProviderKey,
    externalId: string,
    fallback: {
      title?: string
      tags?: readonly string[]
      topics?: readonly string[]
    } = {},
  ): CoachWorkspaceProblem => {
    const id = identity(provider, externalId)
    const known = catalogById.get(id)
    const title = known?.title ?? fallback.title
    const rating = numericRating(known)
    const tags = [
      ...new Set(
        [...(known?.providerTags ?? []), ...(fallback.tags ?? [])].map((tag) =>
          tag.trim().toLowerCase(),
        ),
      ),
    ].filter((tag) => tag.length > 0 && allowedLabel(tag))
    const topics = [
      ...new Set([...(known?.topics ?? []), ...(fallback.topics ?? [])]),
    ].filter(allowedLabel)
    return {
      id,
      provider,
      externalId,
      ...(title === undefined ? {} : { title: title.slice(0, 160) }),
      ...(rating === undefined ? {} : { rating }),
      ...(known?.normalizedDifficulty === undefined
        ? {}
        : { difficulty: known.normalizedDifficulty }),
      tags,
      topics,
    }
  }

  // Titles from submissions fill gaps for providers whose catalog is partial.
  const submissionTitles = new Map<string, string>()
  for (const submission of input.submissions) {
    if (submission.problemTitle !== undefined) {
      submissionTitles.set(
        identity(submission.provider, submission.externalId),
        submission.problemTitle,
      )
    }
  }

  // Solved: provider observations, accepted submissions, and manual solves.
  const solved = new Map<string, CoachWorkspace['solved'][number]>()
  for (const problem of input.solved) {
    const id = identity(problem.provider, problem.externalId)
    if (input.statuses.get(id) === 'unsolved') continue
    const knownTitle = submissionTitles.get(id)
    const described = describe(problem.provider, problem.externalId, {
      ...(knownTitle === undefined ? {} : { title: knownTitle }),
      tags: problem.providerTags ?? [],
      topics: problem.topics ?? [],
    })
    const solvedAt = problem.occurredAt ?? undefined
    const previous = solved.get(id)
    if (
      previous === undefined ||
      (solvedAt !== undefined &&
        (previous.solvedAt === undefined || solvedAt < previous.solvedAt))
    ) {
      solved.set(id, {
        ...described,
        ...(solvedAt === undefined ? {} : { solvedAt }),
        source: 'provider',
      })
    }
  }
  for (const submission of input.submissions) {
    if (!submission.isAccepted) continue
    const id = identity(submission.provider, submission.externalId)
    if (input.statuses.get(id) === 'unsolved') continue
    const existing = solved.get(id)
    if (
      existing !== undefined &&
      (existing.solvedAt === undefined ||
        submission.occurredAt === undefined ||
        existing.solvedAt <= submission.occurredAt)
    ) {
      continue
    }
    solved.set(id, {
      ...(existing ??
        describe(submission.provider, submission.externalId, {
          ...(submission.problemTitle === undefined
            ? {}
            : { title: submission.problemTitle }),
        })),
      ...(submission.occurredAt === undefined
        ? {}
        : { solvedAt: submission.occurredAt }),
      source: 'provider',
    })
  }
  for (const [id, status] of input.statuses) {
    if (status !== 'solved' || solved.has(id)) continue
    const separator = id.indexOf(':')
    const provider = id.slice(0, separator) as ProviderKey
    const externalId = id.slice(separator + 1)
    const at = input.manualSolvedAt.get(id)
    solved.set(id, {
      ...describe(provider, externalId),
      ...(at === undefined ? {} : { solvedAt: at.toISOString() }),
      source: 'manual',
    })
  }
  const solvedRows = [...solved.values()]
    .sort((left, right) => byDateDesc(left.solvedAt, right.solvedAt))
    .slice(0, MAX_SOLVED)

  // Submissions, newest first, enriched with problem metadata.
  const submissionRows = [...input.submissions]
    .sort((left, right) => byDateDesc(left.occurredAt, right.occurredAt))
    .slice(0, MAX_SUBMISSIONS)
    .map((submission) => {
      const problem = describe(submission.provider, submission.externalId, {
        ...(submission.problemTitle === undefined
          ? {}
          : { title: submission.problemTitle }),
      })
      return {
        id: problem.id,
        provider: submission.provider,
        externalId: submission.externalId,
        ...(problem.title === undefined ? {} : { title: problem.title }),
        verdict: submission.verdict.slice(0, 60),
        accepted: submission.isAccepted,
        ...(submission.language === undefined
          ? {}
          : { language: submission.language.slice(0, 60) }),
        ...(submission.occurredAt === undefined
          ? {}
          : { at: submission.occurredAt }),
        ...(problem.rating === undefined ? {} : { rating: problem.rating }),
        tags: problem.tags,
      }
    })

  // Attempted but never solved: upsolving candidates.
  const attempted = new Map<string, CoachWorkspace['attempted'][number]>()
  for (const submission of submissionRows) {
    if (submission.accepted || solved.has(submission.id)) continue
    const existing = attempted.get(submission.id)
    if (existing === undefined) {
      attempted.set(submission.id, {
        ...describe(submission.provider, submission.externalId, {
          ...(submission.title === undefined
            ? {}
            : { title: submission.title }),
        }),
        failedSubmissions: 1,
        lastVerdict: submission.verdict,
        ...(submission.at === undefined
          ? {}
          : { lastAttemptAt: submission.at }),
      })
    } else {
      existing.failedSubmissions += 1
    }
  }
  for (const [id, status] of input.statuses) {
    if (status !== 'attempted' || solved.has(id) || attempted.has(id)) continue
    const separator = id.indexOf(':')
    attempted.set(id, {
      ...describe(
        id.slice(0, separator) as ProviderKey,
        id.slice(separator + 1),
      ),
      failedSubmissions: 0,
    })
  }

  const contests = [...input.contests]
    .sort((left, right) => byDateDesc(left.attendedAt, right.attendedAt))
    .slice(0, MAX_CONTESTS)
    .map((contest) => ({
      provider: contest.provider,
      contestId: contest.contestId,
      ...(contest.contestName === undefined
        ? {}
        : { name: contest.contestName.slice(0, 160) }),
      ...(contest.rank === undefined ? {} : { rank: contest.rank }),
      ...(contest.score === undefined ? {} : { score: contest.score }),
      ...(contest.ratingChange === undefined
        ? {}
        : { delta: contest.ratingChange }),
      ...(contest.oldRating === undefined
        ? {}
        : { oldRating: contest.oldRating }),
      ...(contest.newRating === undefined
        ? {}
        : { newRating: contest.newRating }),
      ...(contest.attendedAt === undefined ? {} : { at: contest.attendedAt }),
    }))
  const ratings = [...input.ratings]
    .sort((left, right) => byDateDesc(left.occurredAt, right.occurredAt))
    .slice(0, MAX_RATINGS)
    .map((rating) => ({
      provider: rating.provider,
      ...(rating.contestName === undefined
        ? {}
        : { contestName: rating.contestName.slice(0, 160) }),
      at: rating.occurredAt,
      oldRating: rating.oldRating,
      newRating: rating.newRating,
      delta: rating.delta,
      ...(rating.providerPercentile === undefined
        ? {}
        : { percentile: rating.providerPercentile }),
    }))

  const maxRatingByProvider = new Map<ProviderKey, number>()
  const ratedContestsByProvider = new Map<string, number>()
  for (const rating of input.ratings) {
    maxRatingByProvider.set(
      rating.provider,
      Math.max(maxRatingByProvider.get(rating.provider) ?? 0, rating.newRating),
    )
    increment(ratedContestsByProvider, rating.provider)
  }
  const accounts = input.providerProfiles.map((profile) => ({
    provider: profile.provider,
    handle: profile.handle,
    ...(profile.rank === undefined ? {} : { rank: profile.rank }),
    ...(profile.rating === undefined ? {} : { rating: profile.rating }),
    ...(maxRatingByProvider.has(profile.provider) ||
    profile.rating !== undefined
      ? {
          maxRating: Math.max(
            maxRatingByProvider.get(profile.provider) ?? 0,
            profile.rating ?? 0,
          ),
        }
      : {}),
    ...(profile.globalRank === undefined
      ? {}
      : { globalRank: profile.globalRank }),
    ...(profile.solvedCount === undefined
      ? {}
      : { platformSolvedCount: profile.solvedCount }),
    ...(profile.acceptanceRate === undefined
      ? {}
      : { acceptanceRate: profile.acceptanceRate }),
    ratedContests: ratedContestsByProvider.get(profile.provider) ?? 0,
    languages: topCounts(
      new Map(Object.entries(languageFamilyCounts(profile.languageCounts))),
      6,
    ),
    badges: profile.badges.slice(0, 10),
    completeness: profile.provenance.completeness,
    fetchedAt: profile.provenance.fetchedAt,
    stale: profile.provenance.stale,
  }))

  const { pool, practiceProblems } = buildPracticePool(
    input,
    catalogById,
    solved,
    allowedLabel,
  )
  const digest = buildDigest({
    input,
    accounts,
    solvedRows,
    submissionRows,
    attemptedCount: attempted.size,
    contests,
  })
  const partialProviders = [
    ...new Set(
      [
        ...input.providerProfiles.map((profile) => profile.provenance),
        ...input.solved.map((row) => row.provenance),
      ]
        .filter((provenance) => provenance.completeness !== 'complete')
        .map((provenance) => provenance.provider),
    ),
  ]

  return {
    workspace: {
      version: COACH_WORKSPACE_VERSION,
      generatedAt: input.now.toISOString(),
      timezone: input.timezone,
      accounts,
      solved: solvedRows,
      attempted: [...attempted.values()]
        .sort((left, right) =>
          byDateDesc(left.lastAttemptAt, right.lastAttemptAt),
        )
        .slice(0, MAX_ATTEMPTED),
      submissions: submissionRows,
      contests,
      ratings,
      practicePool: pool,
      topics: input.roadmap.topics
        .filter((topic) => allowedLabel(topic.topic))
        .map((topic) => ({
          topic: topic.topic,
          name: topic.name,
          lane: topic.lane,
          assessment: topic.assessment,
          score: Math.round(topic.score * 100) / 100,
          confidence: Math.round(topic.confidence * 100) / 100,
          ...(topic.manualStatus === undefined
            ? {}
            : { manualStatus: topic.manualStatus }),
        })),
      bookmarks: input.bookmarks.slice(0, 100).map((bookmark) => {
        const id = identity(bookmark.provider, bookmark.externalId)
        const title = catalogById.get(id)?.title
        return title === undefined ? { id } : { id, title }
      }),
      digest,
      dataNote:
        partialProviders.length === 0
          ? 'Provider history is complete for linked accounts.'
          : `History from ${partialProviders.join(', ')} is limited to public recent windows; counts there are lower bounds. Platform-reported totals are in accounts.platformSolvedCount.`,
      submissionNote:
        input.submissions.length > MAX_SUBMISSIONS
          ? `Only the latest ${MAX_SUBMISSIONS} of ${input.submissions.length} observed submissions are queryable.`
          : 'All observed submissions are queryable.',
    },
    practiceProblems,
  }
}

function buildPracticePool(
  input: CoachWorkspaceInput,
  catalogById: ReadonlyMap<string, ExternalProblemSummary>,
  solved: ReadonlyMap<string, unknown>,
  allowedLabel: (label: string) => boolean,
) {
  const practiceProblems = new Map<string, ExternalProblemSummary>()
  const usable = (problem: ExternalProblemSummary) => {
    const id = identity(problem.provider, problem.externalId)
    return (
      !solved.has(id) &&
      !input.dismissed.has(id) &&
      input.statuses.get(id) !== 'solved' &&
      problem.isPaidOnly !== true &&
      problem.topics.every(allowedLabel) &&
      problem.providerTags.every(allowedLabel)
    )
  }
  // Roadmap suggestions are always part of the trusted pool.
  for (const topic of input.roadmap.topics) {
    for (const suggestion of topic.suggestions) {
      const problem = suggestion.problem
      if (usable(problem)) {
        practiceProblems.set(
          identity(problem.provider, problem.externalId),
          problem,
        )
      }
    }
  }
  // Level: the current Codeforces rating, else the typical rating of recent
  // rated solves. Solves skew low (practice volume on easy problems), so
  // they only stand in when there is no rating.
  const recentRated = [...solved.values()]
    .map((row) => row as { rating?: number; provider: ProviderKey })
    .filter((row) => row.provider === 'codeforces' && row.rating !== undefined)
    .slice(0, 60)
    .map((row) => row.rating as number)
  const cfRating = input.providerProfiles.find(
    (profile) => profile.provider === 'codeforces',
  )?.rating
  const observedLevel = cfRating ?? median(recentRated)
  const level =
    observedLevel ??
    (input.difficultyComfort === 'challenging'
      ? 1600
      : input.difficultyComfort === 'medium'
        ? 1200
        : 1000)
  const target = Math.round((level + 200) / 100) * 100
  // Unrated problems (LeetCode, CSES) follow the observed level when there is
  // one: an onboarding "new to rated problems" should not keep a 1600-rated
  // learner on Easy problems.
  const targetDifficulties = new Set(
    observedLevel !== undefined
      ? observedLevel >= 1500
        ? ['medium', 'hard']
        : observedLevel >= 1100
          ? ['easy', 'medium', 'hard']
          : ['easy', 'medium']
      : input.difficultyComfort === 'challenging'
        ? ['medium', 'hard']
        : input.difficultyComfort === 'medium'
          ? ['easy', 'medium', 'hard']
          : ['easy', 'medium'],
  )
  const byProvider = new Map<ProviderKey, ExternalProblemSummary[]>()
  for (const problem of catalogById.values()) {
    if (!usable(problem)) continue
    const rating = numericRating(problem)
    const fits =
      rating !== undefined
        ? rating >= level - 200 && rating <= level + 600
        : problem.normalizedDifficulty !== undefined &&
          targetDifficulties.has(problem.normalizedDifficulty)
    if (!fits) continue
    const list = byProvider.get(problem.provider) ?? []
    list.push(problem)
    byProvider.set(problem.provider, list)
  }
  const quota: Record<ProviderKey, number> = {
    codeforces: 200,
    leetcode: 70,
    codechef: 50,
    cses: 40,
  }
  for (const [provider, problems] of byProvider) {
    problems.sort((left, right) => {
      const leftRating = numericRating(left)
      const rightRating = numericRating(right)
      const distance =
        (leftRating === undefined ? 0 : Math.abs(leftRating - target)) -
        (rightRating === undefined ? 0 : Math.abs(rightRating - target))
      return distance || (right.solvedCount ?? 0) - (left.solvedCount ?? 0)
    })
    // Round-robin across primary topics so one topic cannot fill the pool.
    const buckets = new Map<string, ExternalProblemSummary[]>()
    for (const problem of problems) {
      const key = problem.topics[0] ?? 'general'
      const bucket = buckets.get(key) ?? []
      bucket.push(problem)
      buckets.set(key, bucket)
    }
    let added = 0
    const limit = quota[provider]
    while (added < limit && buckets.size > 0) {
      for (const [key, bucket] of buckets) {
        const next = bucket.shift()
        if (next === undefined) {
          buckets.delete(key)
          continue
        }
        const id = identity(next.provider, next.externalId)
        if (!practiceProblems.has(id)) {
          practiceProblems.set(id, next)
          added += 1
        }
        if (added >= limit) break
      }
    }
  }
  const pool = [...practiceProblems.values()]
    .slice(0, MAX_POOL)
    .map((problem) => {
      const rating = numericRating(problem)
      return {
        id: identity(problem.provider, problem.externalId),
        provider: problem.provider,
        externalId: problem.externalId,
        title: problem.title.slice(0, 160),
        ...(rating === undefined ? {} : { rating }),
        ...(problem.normalizedDifficulty === undefined
          ? {}
          : { difficulty: problem.normalizedDifficulty }),
        tags: problem.providerTags.map((tag) => tag.toLowerCase()),
        topics: problem.topics,
        ...(problem.solvedCount === undefined
          ? {}
          : { solvedCount: problem.solvedCount }),
      }
    })
  for (const id of [...practiceProblems.keys()]) {
    if (!pool.some((problem) => problem.id === id)) practiceProblems.delete(id)
  }
  return { pool, practiceProblems }
}

function buildDigest({
  input,
  accounts,
  solvedRows,
  submissionRows,
  attemptedCount,
  contests,
}: {
  input: CoachWorkspaceInput
  accounts: CoachWorkspace['accounts']
  solvedRows: CoachWorkspace['solved']
  submissionRows: CoachWorkspace['submissions']
  attemptedCount: number
  contests: CoachWorkspace['contests']
}) {
  const now = input.now.getTime()
  const byProvider = new Map<string, number>()
  const tagSolved = new Map<string, number>()
  const tagFailed = new Map<string, number>()
  const difficulty = new Map<string, number>()
  const bands = new Map<string, Map<string, number>>()
  const solvedDays = new Set<string>()
  const weekday = new Map<string, number>()
  const windows = { last7: 0, last30: 0, last90: 0, last365: 0 }
  for (const row of solvedRows) {
    increment(byProvider, row.provider)
    row.tags.forEach((tag) => increment(tagSolved, tag))
    if (row.difficulty !== undefined) increment(difficulty, row.difficulty)
    if (row.rating !== undefined) {
      const low = Math.floor(row.rating / 200) * 200
      const providerBands = bands.get(row.provider) ?? new Map<string, number>()
      increment(providerBands, `${low}-${low + 199}`)
      bands.set(row.provider, providerBands)
    }
    if (row.solvedAt !== undefined) {
      const at = new Date(row.solvedAt)
      const age = (now - at.getTime()) / 86_400_000
      if (age <= 7) windows.last7 += 1
      if (age <= 30) windows.last30 += 1
      if (age <= 90) windows.last90 += 1
      if (age <= 365) windows.last365 += 1
      const day = localDate(at, input.timezone)
      solvedDays.add(day)
      increment(
        weekday,
        new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
          weekday: 'long',
          timeZone: 'UTC',
        }),
      )
    }
  }
  const verdicts = new Map<string, number>()
  const languages = new Map<string, number>()
  for (const submission of submissionRows) {
    increment(verdicts, verdictGroup(submission.verdict, submission.accepted))
    if (submission.language !== undefined)
      increment(languages, programmingLanguageFamily(submission.language))
    if (!submission.accepted)
      submission.tags.forEach((tag) => increment(tagFailed, tag))
  }
  if (languages.size === 0) {
    accounts.forEach((account) =>
      Object.entries(account.languages).forEach(([language, count]) =>
        increment(languages, programmingLanguageFamily(language), count),
      ),
    )
  }
  // Streaks over local calendar days with at least one dated solve.
  const sortedDays = [...solvedDays].sort()
  let longest = 0
  let run = 0
  let previous: number | undefined
  for (const day of sortedDays) {
    const value = Date.parse(`${day}T00:00:00Z`) / 86_400_000
    run = previous !== undefined && value - previous === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = value
  }
  const today = localDate(input.now, input.timezone)
  const yesterday = localDate(new Date(now - 86_400_000), input.timezone)
  let current = 0
  if (solvedDays.has(today) || solvedDays.has(yesterday)) {
    let cursor = Date.parse(
      `${solvedDays.has(today) ? today : yesterday}T00:00:00Z`,
    )
    while (solvedDays.has(new Date(cursor).toISOString().slice(0, 10))) {
      current += 1
      cursor -= 86_400_000
    }
  }
  const rated = solvedRows.filter((row) => row.rating !== undefined)
  const hardest = [...rated]
    .sort((left, right) => (right.rating ?? 0) - (left.rating ?? 0))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      ...(row.title === undefined ? {} : { title: row.title }),
      rating: row.rating,
      ...(row.solvedAt === undefined
        ? {}
        : { solvedAt: row.solvedAt.slice(0, 10) }),
    }))
  const recentRatedByProvider = Object.fromEntries(
    [...new Set(rated.map((row) => row.provider))].map((provider) => [
      provider,
      median(
        rated
          .filter((row) => row.provider === provider)
          .slice(0, 50)
          .map((row) => row.rating as number),
      ),
    ]),
  )
  const weakTags = [...tagFailed.entries()]
    .filter(([, failed]) => failed >= 3)
    .map(([tag, failed]) => ({
      tag,
      failedSubmissions: failed,
      solved: tagSolved.get(tag) ?? 0,
    }))
    .sort(
      (left, right) =>
        right.failedSubmissions / (right.solved + 1) -
        left.failedSubmissions / (left.solved + 1),
    )
    .slice(0, 6)
  const totalSubmissions = submissionRows.length
  const deltas = contests
    .map((contest) => contest.delta)
    .filter((value): value is number => value !== undefined)
  const ranks = contests
    .map((contest) => contest.rank)
    .filter((value): value is number => value !== undefined)
  const busiest = [...weekday.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    accounts: accounts.map((account) => ({
      provider: account.provider,
      handle: account.handle,
      ...(account.rank === undefined ? {} : { rank: account.rank }),
      ...(account.rating === undefined ? {} : { rating: account.rating }),
      ...(account.maxRating === undefined
        ? {}
        : { maxRating: account.maxRating }),
      ...(account.platformSolvedCount === undefined
        ? {}
        : { platformSolvedCount: account.platformSolvedCount }),
      ratedContests: account.ratedContests,
    })),
    solved: {
      uniqueObserved: solvedRows.length,
      byProvider: Object.fromEntries(byProvider),
      manualOnly: solvedRows.filter((row) => row.source === 'manual').length,
      attemptedNotSolved: attemptedCount,
      byDifficulty: Object.fromEntries(difficulty),
      ratingBands: Object.fromEntries(
        [...bands.entries()].map(([provider, counts]) => [
          provider,
          Object.fromEntries(
            [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
          ),
        ]),
      ),
      typicalRecentRating: recentRatedByProvider,
      hardest,
    },
    topTags: topCounts(tagSolved, 12),
    weakTags,
    submissions: {
      observed: totalSubmissions,
      verdicts: Object.fromEntries(verdicts),
      acceptanceRate:
        totalSubmissions === 0
          ? undefined
          : Math.round(
              ((verdicts.get('accepted') ?? 0) / totalSubmissions) * 1000,
            ) / 10,
    },
    languages: topCounts(languages, 5),
    activity: {
      solvedLast7Days: windows.last7,
      solvedLast30Days: windows.last30,
      solvedLast90Days: windows.last90,
      solvedLast365Days: windows.last365,
      activeSolveDays: solvedDays.size,
      currentStreakDays: current,
      longestStreakDays: longest,
      ...(sortedDays.length === 0
        ? {}
        : {
            firstSolveDay: sortedDays[0],
            lastSolveDay: sortedDays.at(-1),
          }),
      ...(busiest === undefined ? {} : { busiestWeekday: busiest[0] }),
    },
    contests: {
      total: contests.length,
      byProvider: Object.fromEntries(
        contests.reduce(
          (counts, contest) => increment(counts, contest.provider),
          new Map<string, number>(),
        ),
      ),
      ...(ranks.length === 0 ? {} : { bestRank: Math.min(...ranks) }),
      ...(deltas.length === 0
        ? {}
        : {
            averageDelta:
              Math.round(
                (deltas.reduce((sum, value) => sum + value, 0) /
                  deltas.length) *
                  10,
              ) / 10,
          }),
      recent: contests.slice(0, 5).map((contest) => ({
        provider: contest.provider,
        ...(contest.name === undefined ? {} : { name: contest.name }),
        ...(contest.rank === undefined ? {} : { rank: contest.rank }),
        ...(contest.delta === undefined ? {} : { delta: contest.delta }),
        ...(contest.at === undefined ? {} : { date: contest.at.slice(0, 10) }),
      })),
    },
  }
}
