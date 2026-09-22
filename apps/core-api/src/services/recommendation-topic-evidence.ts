import type {
  ExternalProblemSummary,
  ProviderSolvedProblem,
  ProviderSubmission,
} from '@algomemtor/shared-contracts'

import type { ProblemActionRecord } from '../repositories/problem-action-repository.js'
import { canonicalCoachTopic } from './coach-service.js'

export type RecommendationTopicEvidence = {
  topic: string
  observedAttemptedProblems: number
  observedSolvedProblems: number
}

type TopicProblem = Pick<
  ExternalProblemSummary,
  'provider' | 'externalId' | 'topics'
>
type TopicAction = Pick<
  ProblemActionRecord,
  | 'id'
  | 'provider'
  | 'externalId'
  | 'actionType'
  | 'learnerStatus'
  | 'evidenceSource'
  | 'occurredAt'
>
type TopicSubmission = Pick<
  ProviderSubmission,
  'provider' | 'externalId' | 'isAccepted'
>
type TopicSolve = Pick<
  ProviderSolvedProblem,
  'provider' | 'externalId' | 'topics'
>

const identity = (provider: string, externalId: string) =>
  `${provider}:${externalId}`

export const deriveRecommendationTopicEvidence = (
  problems: readonly TopicProblem[],
  actions: readonly TopicAction[],
  submissions: readonly TopicSubmission[],
  solved: readonly TopicSolve[],
  excludedTopics: readonly string[],
): RecommendationTopicEvidence[] => {
  const topicsByProblem = new Map(
    problems.map((problem) => [
      identity(problem.provider, problem.externalId),
      problem.topics,
    ]),
  )
  const allowedTopics = new Set(problems.flatMap((problem) => problem.topics))
  const providerStatus = new Map<string, 'attempted' | 'solved'>()

  for (const submission of submissions) {
    const key = identity(submission.provider, submission.externalId)
    if (submission.isAccepted) providerStatus.set(key, 'solved')
    else if (!providerStatus.has(key)) providerStatus.set(key, 'attempted')
  }
  for (const observation of solved) {
    const key = identity(observation.provider, observation.externalId)
    providerStatus.set(key, 'solved')
    if (!topicsByProblem.has(key) && observation.topics !== undefined) {
      topicsByProblem.set(key, observation.topics.map(canonicalCoachTopic))
    }
  }

  const latestStatus = new Map<string, TopicAction[]>()
  for (const action of actions
    .filter((item) => item.actionType === 'status_changed')
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )) {
    const key = identity(action.provider, action.externalId)
    const statuses = latestStatus.get(key) ?? []
    statuses.push(action)
    latestStatus.set(key, statuses)
  }

  for (const [key, statuses] of latestStatus) {
    const manual = statuses.filter(
      (status) => status.evidenceSource === 'manual',
    )
    const current = manual.at(-1) ?? statuses.at(-1)
    if (current?.learnerStatus === 'solved') providerStatus.set(key, 'solved')
    else if (current?.learnerStatus === 'attempted')
      providerStatus.set(key, 'attempted')
    else providerStatus.delete(key)
  }

  const counts = new Map<string, RecommendationTopicEvidence>()
  for (const [key, status] of providerStatus) {
    for (const topic of new Set(topicsByProblem.get(key) ?? [])) {
      if (!allowedTopics.has(topic) || excludedTopics.includes(topic)) continue
      const count = counts.get(topic) ?? {
        topic,
        observedAttemptedProblems: 0,
        observedSolvedProblems: 0,
      }
      if (status === 'solved') count.observedSolvedProblems += 1
      else count.observedAttemptedProblems += 1
      counts.set(topic, count)
    }
  }
  return [...counts.values()]
    .sort(
      (left, right) =>
        right.observedAttemptedProblems +
          right.observedSolvedProblems -
          (left.observedAttemptedProblems + left.observedSolvedProblems) ||
        left.topic.localeCompare(right.topic),
    )
    .slice(0, 25)
}
