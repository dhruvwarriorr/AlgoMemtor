import {
  type ExternalProblemSummary,
  type ExperienceLevel,
  type LearnerProfile,
} from '@algomemtor/shared-contracts'

import type { ProblemActionRecord } from '../repositories/problem-action-repository.js'

export const DETERMINISTIC_RANKING_VERSION = 'deterministic-v1'
export const RECOMMENDATION_BATCH_SIZE = 10

const SCORE_WEIGHTS = {
  topic: 0.35,
  difficulty: 0.3,
  provider: 0.15,
  revision: 0.1,
  diversity: 0.1,
} as const

type RatingBand = {
  min: number
  max: number
}

export type NormalizedRankingProfile = {
  focusTopics: string[]
  preferredTopics: string[]
  ratingBand: RatingBand
  providerPreferred: boolean
  profileSource: 'profile' | 'cold_start'
  recommendationPreference?: string
}

export type RecommendationHistory = {
  attemptedProblemIds: ReadonlySet<string>
  attemptedTopics: ReadonlySet<string>
  solvedProblemIds: ReadonlySet<string>
  dismissedProblemIds: ReadonlySet<string>
  recentRecommendationIds: ReadonlySet<string>
}

export type RankedRecommendation = {
  problem: ExternalProblemSummary
  score: number
  reason: string
}

const experienceBands: Record<ExperienceLevel, RatingBand> = {
  complete_beginner: { min: 800, max: 900 },
  beginner: { min: 800, max: 1100 },
  intermediate: { min: 1100, max: 1500 },
  advanced: { min: 1500, max: 1900 },
  expert: { min: 1900, max: 2400 },
}

const suggestedTopics: Record<ExperienceLevel, string[]> = {
  complete_beginner: ['implementation', 'math', 'sorting', 'strings'],
  beginner: ['implementation', 'math', 'sorting', 'strings', 'greedy'],
  intermediate: [
    'binary-search',
    'two-pointers',
    'prefix-sums',
    'greedy',
    'graphs',
  ],
  advanced: [
    'graphs',
    'dynamic-programming',
    'shortest-paths',
    'number-theory',
    'disjoint-set-union',
  ],
  expert: [
    'advanced-dynamic-programming',
    'combinatorics',
    'geometry',
    'segment-trees',
    'number-theory',
  ],
}

const problemIdentity = (
  problem: Pick<ExternalProblemSummary, 'provider' | 'externalId'>,
) => `${problem.provider}:${problem.externalId}`

const actionIdentity = (
  action: Pick<ProblemActionRecord, 'provider' | 'externalId'>,
) => `${action.provider}:${action.externalId}`

const unique = (values: readonly string[]) => [...new Set(values)]

export const deriveRankingProfile = (
  profile: LearnerProfile | null,
): NormalizedRankingProfile => {
  if (profile === null) {
    return {
      focusTopics: suggestedTopics.complete_beginner,
      preferredTopics: [],
      ratingBand: { min: 800, max: 1000 },
      providerPreferred: true,
      profileSource: 'cold_start',
    }
  }

  const experienceBand = experienceBands[profile.experience]
  const codeforcesStanding = profile.platformPreferences.standings.find(
    (standing) =>
      standing.platform === 'codeforces' && standing.metric === 'rating',
  )
  const explicitRange =
    profile.ratingComfortRange?.platform === 'codeforces'
      ? profile.ratingComfortRange
      : undefined

  let ratingBand = explicitRange
    ? { min: explicitRange.min, max: explicitRange.max }
    : experienceBand

  if (
    explicitRange === undefined &&
    profile.difficultyComfort === 'new_to_rated_problems'
  ) {
    ratingBand = { min: 800, max: 900 }
  } else if (
    explicitRange === undefined &&
    profile.difficultyComfort === 'introductory'
  ) {
    ratingBand = { min: 800, max: 1100 }
  } else if (
    explicitRange === undefined &&
    profile.difficultyComfort === 'medium'
  ) {
    ratingBand = { min: 1100, max: 1500 }
  } else if (
    explicitRange === undefined &&
    profile.difficultyComfort === 'challenging'
  ) {
    ratingBand = { min: 1500, max: 1900 }
  } else if (
    explicitRange === undefined &&
    profile.difficultyComfort === 'let_algomemtor_decide' &&
    codeforcesStanding !== undefined
  ) {
    const minimum = Math.max(800, codeforcesStanding.value - 100)

    ratingBand = {
      min: minimum,
      max: Math.max(minimum, codeforcesStanding.value + 200),
    }
  }

  const focusTopics =
    profile.topicPreference.mode === 'selected'
      ? profile.topicPreference.topics
      : suggestedTopics[profile.experience]

  return {
    focusTopics: unique(focusTopics),
    preferredTopics: unique(profile.preferredTopics),
    ratingBand,
    providerPreferred:
      profile.platformPreferences.platforms.length === 0 ||
      profile.platformPreferences.platforms.includes('codeforces'),
    profileSource: 'profile',
    ...(profile.recommendationPreference === undefined
      ? {}
      : { recommendationPreference: profile.recommendationPreference }),
  }
}

const sortActions = (actions: readonly ProblemActionRecord[]) =>
  actions.slice().sort((left, right) => {
    const timeDifference =
      left.occurredAt.getTime() - right.occurredAt.getTime()

    return timeDifference === 0
      ? left.id.localeCompare(right.id)
      : timeDifference
  })

export const deriveRecommendationHistory = (
  actions: readonly ProblemActionRecord[],
  batches: readonly {
    items: readonly { provider: 'codeforces'; externalId: string }[]
  }[],
  problems: readonly ExternalProblemSummary[],
): RecommendationHistory => {
  const latestStatus = new Map<string, ProblemActionRecord>()
  const latestDismissal = new Map<string, ProblemActionRecord>()

  for (const action of sortActions(actions)) {
    const identity = actionIdentity(action)

    if (action.actionType === 'status_changed') {
      latestStatus.set(identity, action)
    }

    if (
      action.actionType === 'dismissed' ||
      action.actionType === 'dismissal_restored'
    ) {
      latestDismissal.set(identity, action)
    }
  }

  const problemByIdentity = new Map(
    problems.map((problem) => [problemIdentity(problem), problem]),
  )
  const attemptedProblemIds = new Set<string>()
  const attemptedTopics = new Set<string>()
  const solvedProblemIds = new Set<string>()
  const dismissedProblemIds = new Set<string>()

  for (const [identity, action] of latestStatus) {
    if (action.learnerStatus === 'solved') {
      solvedProblemIds.add(identity)
    }

    if (action.learnerStatus === 'attempted') {
      attemptedProblemIds.add(identity)
      problemByIdentity
        .get(identity)
        ?.topics.forEach((topic) => attemptedTopics.add(topic))
    }
  }

  for (const [identity, action] of latestDismissal) {
    if (action.actionType === 'dismissed') {
      dismissedProblemIds.add(identity)
    }
  }

  const recentRecommendationIds = new Set(
    batches
      .slice(0, 3)
      .flatMap((batch) =>
        batch.items.map((item) => `${item.provider}:${item.externalId}`),
      ),
  )

  return {
    attemptedProblemIds,
    attemptedTopics,
    solvedProblemIds,
    dismissedProblemIds,
    recentRecommendationIds,
  }
}

const topicMatch = (
  problem: ExternalProblemSummary,
  profile: NormalizedRankingProfile,
) => {
  const weakMatch = problem.topics.some((topic) =>
    profile.focusTopics.includes(topic),
  )
  const preferredMatch = problem.topics.some((topic) =>
    profile.preferredTopics.includes(topic),
  )

  if (weakMatch) {
    return 1
  }

  if (preferredMatch) {
    return 0.75
  }

  return 0
}

const difficultyMatch = (
  problem: ExternalProblemSummary,
  profile: NormalizedRankingProfile,
) => {
  if (typeof problem.providerDifficulty !== 'number') {
    return 0
  }

  if (
    problem.providerDifficulty >= profile.ratingBand.min &&
    problem.providerDifficulty <= profile.ratingBand.max
  ) {
    return 1
  }

  const distance =
    problem.providerDifficulty < profile.ratingBand.min
      ? profile.ratingBand.min - problem.providerDifficulty
      : problem.providerDifficulty - profile.ratingBand.max

  return distance <= 100 ? 0.5 : 0
}

const revisionMatch = (
  problem: ExternalProblemSummary,
  history: RecommendationHistory,
) => {
  const identity = problemIdentity(problem)

  if (history.attemptedProblemIds.has(identity)) {
    return 1
  }

  if (problem.topics.some((topic) => history.attemptedTopics.has(topic))) {
    return 0.5
  }

  return 0
}

const diversityMatch = (
  problem: ExternalProblemSummary,
  profile: NormalizedRankingProfile,
  selected: readonly ExternalProblemSummary[],
) => {
  const selectedTopics = new Set(selected.flatMap((item) => item.topics))

  if (
    problem.topics.some(
      (topic) =>
        profile.focusTopics.includes(topic) && !selectedTopics.has(topic),
    )
  ) {
    return 1
  }

  const selectedDifficulties = new Set(
    selected.flatMap((item) =>
      item.normalizedDifficulty === undefined
        ? []
        : [item.normalizedDifficulty],
    ),
  )

  return problem.normalizedDifficulty !== undefined &&
    !selectedDifficulties.has(problem.normalizedDifficulty)
    ? 0.5
    : 0
}

const baseScore = (
  problem: ExternalProblemSummary,
  profile: NormalizedRankingProfile,
  history: RecommendationHistory,
) => {
  const topic = topicMatch(problem, profile)
  const difficulty = difficultyMatch(problem, profile)
  const provider = profile.providerPreferred ? 1 : 0
  const revision = revisionMatch(problem, history)

  return (
    topic * SCORE_WEIGHTS.topic +
    difficulty * SCORE_WEIGHTS.difficulty +
    provider * SCORE_WEIGHTS.provider +
    revision * SCORE_WEIGHTS.revision
  )
}

const reasonFor = (
  problem: ExternalProblemSummary,
  profile: NormalizedRankingProfile,
  history: RecommendationHistory,
  diversity: number,
) => {
  const reasons: string[] = []
  const topic = topicMatch(problem, profile)
  const difficulty = difficultyMatch(problem, profile)
  const revision = revisionMatch(problem, history)

  if (topic === 1) {
    const topic = problem.topics.find((item) =>
      profile.focusTopics.includes(item),
    )
    if (topic !== undefined) {
      reasons.push(`Practises your focus topic: ${topic}.`)
    }
  } else if (topic === 0.75) {
    const topic = problem.topics.find((item) =>
      profile.preferredTopics.includes(item),
    )
    if (topic !== undefined) {
      reasons.push(`Includes a topic you enjoy: ${topic}.`)
    }
  }

  if (difficulty === 1) {
    reasons.push(
      `Fits your ${profile.ratingBand.min}–${profile.ratingBand.max} rating range.`,
    )
  } else if (difficulty === 0.5) {
    reasons.push(
      'Sits just outside your target difficulty for a gentle stretch.',
    )
  }

  if (revision > 0) {
    reasons.push('Revisits a topic from a problem you have attempted.')
  }

  if (diversity > 0 && reasons.length < 2) {
    reasons.push('Adds variety to this recommendation set.')
  }

  if (reasons.length === 0) {
    reasons.push(
      profile.profileSource === 'cold_start'
        ? 'A safe foundation problem for starting your practice path.'
        : 'A balanced problem selected from your current preferences.',
    )
  }

  return reasons.slice(0, 2).join(' ')
}

const compareProblems = (
  left: ExternalProblemSummary,
  right: ExternalProblemSummary,
) => {
  const solvedCountDifference =
    (right.solvedCount ?? -1) - (left.solvedCount ?? -1)

  if (solvedCountDifference !== 0) {
    return solvedCountDifference
  }

  return problemIdentity(left).localeCompare(problemIdentity(right))
}

export const rankRecommendations = ({
  candidates,
  history,
  profile,
  preferNewItems = false,
  limit = RECOMMENDATION_BATCH_SIZE,
}: {
  candidates: readonly ExternalProblemSummary[]
  history: RecommendationHistory
  profile: NormalizedRankingProfile
  preferNewItems?: boolean
  limit?: number
}): RankedRecommendation[] => {
  const uniqueCandidates = new Map<string, ExternalProblemSummary>()

  for (const candidate of candidates) {
    const identity = problemIdentity(candidate)

    if (
      !history.solvedProblemIds.has(identity) &&
      !history.dismissedProblemIds.has(identity) &&
      !uniqueCandidates.has(identity)
    ) {
      uniqueCandidates.set(identity, candidate)
    }
  }

  const available = [...uniqueCandidates.values()]
  const scored = available.map((problem) => ({
    problem,
    base: baseScore(problem, profile, history),
    recent: history.recentRecommendationIds.has(problemIdentity(problem)),
  }))
  const newItems = preferNewItems
    ? scored.filter((item) => !item.recent)
    : scored
  const selected: ExternalProblemSummary[] = []
  const results: RankedRecommendation[] = []

  while (selected.length < limit && scored.length > 0) {
    const selectedIdentities = new Set(selected.map(problemIdentity))
    const priorityPool = preferNewItems
      ? newItems.some(
          (item) => !selectedIdentities.has(problemIdentity(item.problem)),
        )
        ? newItems
        : scored
      : scored
    const candidatesForRound = priorityPool
      .filter((item) => !selectedIdentities.has(problemIdentity(item.problem)))
      .map((item) => {
        const diversity = diversityMatch(item.problem, profile, selected)

        return {
          ...item,
          diversity,
          score: item.base + diversity * SCORE_WEIGHTS.diversity,
        }
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score
        }

        return compareProblems(left.problem, right.problem)
      })
    const next = candidatesForRound[0]

    if (next === undefined) {
      break
    }

    selected.push(next.problem)
    results.push({
      problem: next.problem,
      score: Number(next.score.toFixed(6)),
      reason: reasonFor(next.problem, profile, history, next.diversity),
    })
  }

  return results
}

export const latestRelevantActionAt = (
  actions: readonly ProblemActionRecord[],
) => {
  const relevant = actions.filter(
    (action) =>
      action.actionType === 'status_changed' ||
      action.actionType === 'dismissed' ||
      action.actionType === 'dismissal_restored',
  )

  return relevant.reduce<Date | undefined>(
    (latest, action) =>
      latest === undefined || action.occurredAt > latest
        ? action.occurredAt
        : latest,
    undefined,
  )
}
