import type {
  AnalyticsInsights,
  ContestParticipation,
  ExternalProblemSummary,
  ProviderKey,
  ProviderProfile,
  ProviderRatingChange,
  ProviderSubmission,
} from '@algomemtor/shared-contracts'

import { verdictKey } from './progress-window.js'

// All-time aggregates for the Insights page. Pure and bounded: the handler
// supplies owner-scoped rows and catalog metadata, this only counts.

type SolvedReference = {
  provider: ProviderKey
  externalId: string
  solvedAt?: string
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
}

const formatters = new Map<string, Intl.DateTimeFormat>()

// Formatter construction is expensive; one per timezone is reused across
// thousands of submissions.
function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone)
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      })
    } catch {
      formatter = formatterFor('UTC')
    }
    if (formatters.size > 64) formatters.clear()
    formatters.set(timezone, formatter)
  }
  return formatter
}

function localParts(date: Date, timezone: string) {
  const parts = Object.fromEntries(
    formatterFor(timezone)
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  return {
    weekday: WEEKDAY_INDEX[parts.weekday ?? ''] ?? 0,
    hour: Number.parseInt(parts.hour ?? '0', 10) % 24,
    month: `${parts.year}-${parts.month}`,
  }
}

const numericRating = (problem: ExternalProblemSummary | undefined) =>
  typeof problem?.providerDifficulty === 'number' &&
  Number.isFinite(problem.providerDifficulty) &&
  problem.providerDifficulty > 0
    ? problem.providerDifficulty
    : undefined

export function buildAnalyticsInsights(input: {
  timezone: string
  now: Date
  profiles: readonly ProviderProfile[]
  // Linked accounts with no profile snapshot (CSES has no public profile);
  // listed from their synced solved count.
  otherAccounts?: readonly {
    provider: ProviderKey
    handle: string
    solvedCount?: number
  }[]
  submissions: readonly ProviderSubmission[]
  solved: readonly SolvedReference[]
  ratingChanges: readonly ProviderRatingChange[]
  participations: readonly ContestParticipation[]
  metadata: ReadonlyMap<string, ExternalProblemSummary>
  normalizeTopic: (topic: string) => string | undefined
}): AnalyticsInsights {
  const key = (provider: string, externalId: string) =>
    `${provider}:${externalId}`
  const topicsOf = (provider: string, externalId: string) =>
    new Set(
      (input.metadata.get(key(provider, externalId))?.topics ?? [])
        .map(input.normalizeTopic)
        .filter((topic): topic is string => topic !== undefined),
    )

  // Accounts: rating, peak and contest record per linked platform.
  const syncedSolved = new Map(
    (input.otherAccounts ?? []).flatMap((account) =>
      account.solvedCount === undefined
        ? []
        : [[account.provider, account.solvedCount] as const],
    ),
  )
  const profiled = new Set(input.profiles.map((profile) => profile.provider))
  const otherAccounts = (input.otherAccounts ?? [])
    .filter((account) => !profiled.has(account.provider))
    .map((account) => ({
      provider: account.provider,
      handle: account.handle.slice(0, 120),
      ...(account.solvedCount === undefined
        ? {}
        : { solvedCount: account.solvedCount }),
      contests: input.participations.filter(
        (item) => item.provider === account.provider,
      ).length,
    }))
  const profileAccounts = input.profiles.slice(0, 8).map((profile) => {
    const ratings = input.ratingChanges.filter(
      (change) => change.provider === profile.provider,
    )
    const contests = input.participations.filter(
      (item) => item.provider === profile.provider,
    )
    const ranks = contests
      .map((item) => item.rank)
      .filter((rank): rank is number => rank !== undefined)
    const peak = Math.max(
      profile.rating ?? 0,
      ...ratings.map((change) => change.newRating),
    )
    return {
      provider: profile.provider,
      handle: profile.handle.slice(0, 120),
      ...(profile.rank === undefined
        ? {}
        : { rank: profile.rank.slice(0, 80) }),
      ...(profile.rating === undefined ? {} : { rating: profile.rating }),
      ...(peak > 0 ? { maxRating: peak } : {}),
      ...(profile.globalRank === undefined
        ? {}
        : { globalRank: profile.globalRank }),
      ...((profile.solvedCount ?? syncedSolved.get(profile.provider)) ===
      undefined
        ? {}
        : {
            solvedCount:
              profile.solvedCount ?? syncedSolved.get(profile.provider),
          }),
      contests: Math.max(contests.length, ratings.length),
      ...(ranks.length === 0 ? {} : { bestContestRank: Math.min(...ranks) }),
    }
  })
  const accounts = [...profileAccounts, ...otherAccounts].slice(0, 8)

  // Verdicts, punch card, and monthly submissions.
  const verdicts = {
    accepted: 0,
    wrongAnswer: 0,
    timeLimit: 0,
    memoryLimit: 0,
    runtimeError: 0,
    compileError: 0,
    other: 0,
  }
  const punchCard = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  )
  const months = new Map<
    string,
    { solved: number; submissions: number; accepted: number }
  >()
  const monthKeys: string[] = []
  for (let offset = 23; offset >= 0; offset -= 1) {
    const date = new Date(
      Date.UTC(
        input.now.getUTCFullYear(),
        input.now.getUTCMonth() - offset,
        15,
      ),
    )
    const month = date.toISOString().slice(0, 7)
    monthKeys.push(month)
    months.set(month, { solved: 0, submissions: 0, accepted: 0 })
  }
  let firstActivity: number | undefined
  const failedByTopic = new Map<string, number>()
  for (const submission of input.submissions) {
    verdicts[verdictKey(submission.verdict, submission.isAccepted)] += 1
    if (!submission.isAccepted) {
      for (const topic of topicsOf(
        submission.provider,
        submission.externalId,
      )) {
        failedByTopic.set(topic, (failedByTopic.get(topic) ?? 0) + 1)
      }
    }
    if (submission.occurredAt === undefined) continue
    const date = new Date(submission.occurredAt)
    if (Number.isNaN(date.getTime())) continue
    firstActivity = Math.min(firstActivity ?? date.getTime(), date.getTime())
    const parts = localParts(date, input.timezone)
    const row = punchCard[parts.weekday]
    if (row !== undefined) row[parts.hour] = (row[parts.hour] ?? 0) + 1
    const bucket = months.get(parts.month)
    if (bucket !== undefined) {
      bucket.submissions += 1
      if (submission.isAccepted) bucket.accepted += 1
    }
  }

  // Solved problems: rating bands per platform, topics, hardest, months.
  const bands = new Map<number, Record<ProviderKey, number>>()
  const solvedByTopic = new Map<string, { solved: number; ratings: number[] }>()
  const hardest: AnalyticsInsights['hardestSolved'] = []
  for (const reference of input.solved) {
    const problem = input.metadata.get(
      key(reference.provider, reference.externalId),
    )
    const rating = numericRating(problem)
    if (rating !== undefined) {
      const min = Math.floor(rating / 200) * 200
      const band = bands.get(min) ?? {
        codeforces: 0,
        codechef: 0,
        leetcode: 0,
        cses: 0,
      }
      band[reference.provider] += 1
      bands.set(min, band)
      if (problem !== undefined) {
        hardest.push({
          provider: reference.provider,
          externalId: reference.externalId,
          title: problem.title.slice(0, 200),
          rating,
          ...(reference.solvedAt === undefined
            ? {}
            : { solvedAt: reference.solvedAt }),
        })
      }
    }
    for (const topic of topicsOf(reference.provider, reference.externalId)) {
      const entry = solvedByTopic.get(topic) ?? { solved: 0, ratings: [] }
      entry.solved += 1
      if (rating !== undefined) entry.ratings.push(rating)
      solvedByTopic.set(topic, entry)
    }
    if (reference.solvedAt !== undefined) {
      const date = new Date(reference.solvedAt)
      if (!Number.isNaN(date.getTime())) {
        firstActivity = Math.min(
          firstActivity ?? date.getTime(),
          date.getTime(),
        )
        const bucket = months.get(localParts(date, input.timezone).month)
        if (bucket !== undefined) bucket.solved += 1
      }
    }
  }

  const topics = new Set([...solvedByTopic.keys(), ...failedByTopic.keys()])
  const topicStrength = [...topics]
    .map((topic) => {
      const solved = solvedByTopic.get(topic)
      const ratings = solved?.ratings ?? []
      return {
        topic,
        solved: solved?.solved ?? 0,
        failedSubmissions: failedByTopic.get(topic) ?? 0,
        ...(ratings.length === 0
          ? {}
          : {
              averageRating: Math.round(
                ratings.reduce((sum, value) => sum + value, 0) / ratings.length,
              ),
            }),
      }
    })
    .sort(
      (left, right) =>
        right.solved +
        right.failedSubmissions -
        (left.solved + left.failedSubmissions),
    )
    .slice(0, 24)

  return {
    timezone: input.timezone,
    accounts,
    verdicts,
    ratingBands: [...bands.entries()]
      .sort((left, right) => left[0] - right[0])
      .slice(-24)
      .map(([min, counts]) => ({ min, max: min + 199, ...counts })),
    punchCard,
    monthly: monthKeys.map((month) => ({
      month,
      ...(months.get(month) ?? { solved: 0, submissions: 0, accepted: 0 }),
    })),
    topicStrength,
    hardestSolved: hardest
      .sort((left, right) => right.rating - left.rating)
      .slice(0, 8),
    ...(firstActivity === undefined
      ? {}
      : { firstActivityAt: new Date(firstActivity).toISOString() }),
    totalSubmissions: input.submissions.length,
  }
}
