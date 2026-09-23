import type {
  CoachManualTopicStatus,
  ImprovementRoadmap,
  ProviderRatingChange,
} from '@algomemtor/shared-contracts'

import { canonicalCoachTopic } from './coach-service.js'
import type { RecommendationTopicEvidence } from './recommendation-topic-evidence.js'

// Deterministic learner signals that steer recommendations: the learner's
// current plan, where attempts keep failing, where practice is thin, and how
// recent contests went. They are computed from the learner's own stored
// evidence and roadmap, and are bounded so the AI payload stays small.

export const SIGNAL_TOPIC_LIMIT = 8
const CONTEST_WINDOW_MS = 90 * 86_400_000
const TREND_THRESHOLD = 25

export type ContestSummary = {
  contestsLast90Days: number
  currentRating?: number
  ratingChange90Days?: number
  trend?: 'rising' | 'steady' | 'falling'
}

export type RecommendationSignals = {
  roadmapFocusTopics: string[]
  weakTopics: string[]
  underPracticedTopics: string[]
  contestSummary?: ContestSummary
  observedCodeforcesRating?: number
}

const bounded = (topics: readonly string[], blocked: ReadonlySet<string>) => {
  const result: string[] = []
  for (const topic of topics.map(canonicalCoachTopic)) {
    if (blocked.has(topic) || result.includes(topic)) continue
    result.push(topic)
    if (result.length === SIGNAL_TOPIC_LIMIT) break
  }
  return result
}

const summarizeContests = (
  changes: readonly ProviderRatingChange[],
  now: Date,
): Pick<
  RecommendationSignals,
  'contestSummary' | 'observedCodeforcesRating'
> => {
  if (changes.length === 0) return {}
  const ordered = changes
    .slice()
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    )
  const windowStart = now.getTime() - CONTEST_WINDOW_MS
  const recent = ordered.filter(
    (change) => new Date(change.occurredAt).getTime() >= windowStart,
  )
  const latest = ordered[0]
  const latestCodeforces = ordered.find(
    (change) => change.provider === 'codeforces',
  )
  const summary: ContestSummary = { contestsLast90Days: recent.length }
  if (latest !== undefined) {
    const sameProvider = recent.filter(
      (change) => change.provider === latest.provider,
    )
    summary.currentRating = Math.round(latest.newRating)
    if (sameProvider.length > 0) {
      const delta = Math.round(
        sameProvider.reduce((total, change) => total + change.delta, 0),
      )
      summary.ratingChange90Days = delta
      summary.trend =
        delta > TREND_THRESHOLD
          ? 'rising'
          : delta < -TREND_THRESHOLD
            ? 'falling'
            : 'steady'
    }
  }
  return {
    contestSummary: summary,
    ...(latestCodeforces === undefined
      ? {}
      : { observedCodeforcesRating: Math.round(latestCodeforces.newRating) }),
  }
}

export const deriveRecommendationSignals = ({
  roadmap,
  topicStatuses,
  topicEvidence,
  ratingChanges,
  excludedTopics,
  now,
}: {
  roadmap: ImprovementRoadmap | null
  topicStatuses: Readonly<Record<string, CoachManualTopicStatus>>
  topicEvidence: readonly RecommendationTopicEvidence[]
  ratingChanges: readonly ProviderRatingChange[]
  excludedTopics: readonly string[]
  now: Date
}): RecommendationSignals => {
  const blocked = new Set(excludedTopics.map(canonicalCoachTopic))
  Object.entries(topicStatuses).forEach(([topic, status]) => {
    if (status === 'skip_for_now' || status === 'completed') {
      blocked.add(canonicalCoachTopic(topic))
    }
  })
  const topics = roadmap?.topics ?? []

  // The plan: what the learner chose to work on, then what the roadmap puts
  // in focus, then topics due for review.
  const roadmapFocusTopics = bounded(
    [
      ...Object.entries(topicStatuses)
        .filter(([, status]) => status === 'working_on')
        .map(([topic]) => topic),
      ...topics
        .filter((topic) => topic.lane === 'current_focus')
        .map((topic) => topic.topic),
      ...Object.entries(topicStatuses)
        .filter(([, status]) => status === 'revisit')
        .map(([topic]) => topic),
      ...topics
        .filter((topic) => topic.lane === 'revisit_later')
        .map((topic) => topic.topic),
    ],
    blocked,
  )
  const planned = new Set([...blocked, ...roadmapFocusTopics])

  // Weak: the roadmap's own assessment first, then topics where the learner's
  // observed attempts mostly did not end in a solve.
  const failingFromEvidence = topicEvidence
    .filter(
      (item) =>
        item.observedAttemptedProblems >= 2 &&
        item.observedSolvedProblems <= item.observedAttemptedProblems / 2,
    )
    .sort(
      (left, right) =>
        right.observedAttemptedProblems -
          right.observedSolvedProblems -
          (left.observedAttemptedProblems - left.observedSolvedProblems) ||
        left.topic.localeCompare(right.topic),
    )
    .map((item) => item.topic)
  const weakTopics = bounded(
    [
      ...topics
        .filter(
          (topic) =>
            topic.assessment === 'needs_practice' ||
            topic.lane === 'needs_more_practice',
        )
        .sort((left, right) => left.score - right.score)
        .map((topic) => topic.topic),
      ...failingFromEvidence,
    ],
    planned,
  )

  // Under-practiced: next-up topics the learner has too little evidence in.
  const covered = new Set([...planned, ...weakTopics])
  const underPracticedTopics = bounded(
    topics
      .filter(
        (topic) =>
          topic.assessment === 'insufficient_evidence' &&
          (topic.lane === 'recommended_next' ||
            topic.lane === 'current_focus' ||
            topic.lane === 'needs_more_practice'),
      )
      .map((topic) => topic.topic),
    covered,
  )

  return {
    roadmapFocusTopics,
    weakTopics,
    underPracticedTopics,
    ...summarizeContests(ratingChanges, now),
  }
}

// Calendar day in the learner's time zone; recommendations rotate daily.
export const learnerDayKey = (date: Date, timeZone: string) => {
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
