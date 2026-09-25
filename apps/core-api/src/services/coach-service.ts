import { createHash, randomUUID } from 'node:crypto'

import {
  CoachMessageSchema,
  CoachRichContentSchema,
  CoachResponseSchema,
  ImprovementRoadmapSchema,
  isSafeCoachPublicUrl,
  type CoachActionProposal,
  type CoachConversation,
  type CoachConversationResponse,
  type CoachEvidenceReference,
  type CoachCitation,
  type CoachManualTopicStatus,
  type CoachMessage,
  type CoachRichContent,
  type CoachResponse,
  type CreateCoachConversationRequest,
  type ImprovementRoadmap,
  type ImprovementTopic,
  type SendCoachMessageRequest,
} from '@algomemtor/shared-contracts'
import type {
  ExternalProblemSummary,
  LearnerActivityDigest,
  LearnerProblemStatus,
  ProviderKey,
  ProviderSubmission,
  ProviderSolvedProblem,
  ProviderRatingChange,
  ContestParticipation,
  ProviderProfile,
  ProblemContent,
  ProblemTimerSession,
  RoadmapRefreshReason,
} from '@algomemtor/shared-contracts'

import {
  AiCoachClientError,
  type AiCoachClient,
  type AiCoachRequest,
  type AiCoachResult,
} from '../integrations/ai/ai-coach-client.js'
import type {
  AiMemoryClient,
  AiMemoryRecord,
} from '../integrations/ai/ai-memory-client.js'
import type { AiRoadmapNoteClient } from '../integrations/ai/ai-roadmap-note-client.js'
import type { ProblemProvider } from '../integrations/providers/problem-provider.js'
import type { LearnerProfileRepository } from '../repositories/learner-profile-repository.js'
import type {
  ProblemActionRecord,
  ProblemActionRepository,
} from '../repositories/problem-action-repository.js'
import type { ProgressRepository } from '../repositories/progress-repository.js'
import type { ProviderDataRepository } from '../repositories/provider-data-repository.js'
import type { ProviderProfileRepository } from '../repositories/provider-profile-repository.js'
import type { BookmarkRepository } from '../repositories/bookmark-repository.js'
import type { CoachRepository } from '../repositories/coach-repository.js'
import type { RecommendationRepository } from '../repositories/recommendation-repository.js'
import type { StructuredLogger } from '../utils/structured-logger.js'
import type { ProgressService } from './progress-service.js'
import { isCoachSmallTalk } from './coach-intent.js'
import {
  coachFeatureRedirect,
  routeCoachFeature,
  type CoachFeatureRoute,
} from './coach-feature-routing.js'
import {
  allowedCoachAnswerUrl,
  extractCoachUrls,
  leetcodeIdForSlug,
  linkedProblemFromContent,
  providerProblemFromUrl,
  type LinkedProblem,
} from './coach-links.js'
import {
  buildCoachWorkspace,
  type CoachProfileDigest,
  type CoachWorkspace,
} from './coach-workspace.js'

export const COACH_POLICY_VERSION = 'personalized-coaching-rag-v2'
export const TOPIC_ASSESSMENT_VERSION = 'topic-assessment-v1'

export class CoachConsentRequiredError extends Error {
  readonly code = 'COACH_CONSENT_REQUIRED'

  constructor() {
    super('Personalized coaching requires AI consent.')
    this.name = 'CoachConsentRequiredError'
  }
}

export class CoachConversationNotFoundError extends Error {
  readonly code = 'COACH_CONVERSATION_NOT_FOUND'

  constructor() {
    super('The coaching conversation could not be found.')
    this.name = 'CoachConversationNotFoundError'
  }
}

export class CoachProposalNotFoundError extends Error {
  readonly code = 'COACH_PROPOSAL_NOT_FOUND'

  constructor() {
    super('The coaching action proposal could not be found.')
    this.name = 'CoachProposalNotFoundError'
  }
}

export class CoachProposalStateError extends Error {
  readonly code = 'COACH_PROPOSAL_STATE'

  constructor() {
    super('The coaching action proposal is no longer actionable.')
    this.name = 'CoachProposalStateError'
  }
}

export class CoachMemoryUnavailableError extends Error {
  readonly code = 'COACH_MEMORY_UNAVAILABLE'

  constructor() {
    super('The learner memory service is temporarily unavailable.')
    this.name = 'CoachMemoryUnavailableError'
  }
}

export class CoachUnknownTopicError extends Error {
  readonly code = 'COACH_UNKNOWN_TOPIC'

  constructor() {
    super('The roadmap topic is not part of the canonical taxonomy.')
    this.name = 'CoachUnknownTopicError'
  }
}

type TopicDefinition = {
  slug: string
  name: string
  prerequisites: readonly string[]
}

const topicDefinitions: readonly TopicDefinition[] = [
  { slug: 'implementation', name: 'Implementation', prerequisites: [] },
  { slug: 'arrays', name: 'Arrays', prerequisites: ['implementation'] },
  { slug: 'math', name: 'Math', prerequisites: ['implementation'] },
  { slug: 'strings', name: 'Strings', prerequisites: ['implementation'] },
  {
    slug: 'linked-lists',
    name: 'Linked Lists',
    prerequisites: ['implementation'],
  },
  { slug: 'sorting', name: 'Sorting', prerequisites: ['arrays'] },
  { slug: 'hashing', name: 'Hashing', prerequisites: ['strings'] },
  { slug: 'prefix-sums', name: 'Prefix Sums', prerequisites: ['arrays'] },
  { slug: 'two-pointers', name: 'Two Pointers', prerequisites: ['arrays'] },
  {
    slug: 'sliding-window',
    name: 'Sliding Window',
    prerequisites: ['arrays'],
  },
  {
    slug: 'binary-search',
    name: 'Binary Search',
    prerequisites: ['sorting', 'arrays'],
  },
  { slug: 'greedy', name: 'Greedy', prerequisites: ['sorting'] },
  { slug: 'number-theory', name: 'Number Theory', prerequisites: ['math'] },
  { slug: 'combinatorics', name: 'Combinatorics', prerequisites: ['math'] },
  { slug: 'geometry', name: 'Geometry', prerequisites: ['math'] },
  {
    slug: 'stacks-and-queues',
    name: 'Stacks and Queues',
    prerequisites: ['arrays'],
  },
  {
    slug: 'heaps-and-priority-queues',
    name: 'Heaps and Priority Queues',
    prerequisites: ['trees'],
  },
  {
    slug: 'recursion-and-backtracking',
    name: 'Recursion and Backtracking',
    prerequisites: ['implementation'],
  },
  {
    slug: 'trees',
    name: 'Trees',
    prerequisites: ['recursion-and-backtracking'],
  },
  { slug: 'tries', name: 'Tries', prerequisites: ['strings'] },
  {
    slug: 'graphs',
    name: 'Graphs',
    prerequisites: ['recursion-and-backtracking'],
  },
  {
    slug: 'bfs-and-dfs',
    name: 'BFS and DFS',
    prerequisites: ['graphs', 'stacks-and-queues'],
  },
  {
    slug: 'disjoint-set-union',
    name: 'Disjoint Set Union',
    prerequisites: ['graphs', 'bfs-and-dfs'],
  },
  {
    slug: 'shortest-paths',
    name: 'Shortest Paths',
    prerequisites: ['graphs', 'bfs-and-dfs'],
  },
  {
    slug: 'topological-sort',
    name: 'Topological Sort',
    prerequisites: ['graphs', 'bfs-and-dfs'],
  },
  {
    slug: 'minimum-spanning-trees',
    name: 'Minimum Spanning Trees',
    prerequisites: ['disjoint-set-union', 'shortest-paths'],
  },
  {
    slug: 'dynamic-programming',
    name: 'Dynamic Programming',
    prerequisites: ['recursion-and-backtracking'],
  },
  {
    slug: 'advanced-dynamic-programming',
    name: 'Advanced Dynamic Programming',
    prerequisites: ['dynamic-programming'],
  },
  {
    slug: 'bit-manipulation',
    name: 'Bit Manipulation',
    prerequisites: ['implementation'],
  },
  { slug: 'segment-trees', name: 'Segment Trees', prerequisites: ['trees'] },
  { slug: 'fenwick-trees', name: 'Fenwick Trees', prerequisites: ['trees'] },
]

const definitionBySlug = new Map(
  topicDefinitions.map((item) => [item.slug, item]),
)

const identity = (provider: string, externalId: string) =>
  `${provider}:${externalId}`

/**
 * Provider activity does not always use the same identifier as the canonical
 * problem catalog.  LeetCode, for example, may expose a title slug when its
 * public question-detail lookup is unavailable while the catalog uses the
 * numeric question id.  Canonical URLs are the stable join key in that case.
 */
const canonicalUrlIdentity = (value: string) => {
  try {
    const url = new URL(value)
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return value
      .trim()
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .toLowerCase()
  }
}

const stableUuid = (value: string) => {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hex.slice(18, 20)}-${hex.slice(20)}`
}

const canonicalTopicAliases: Readonly<Record<string, string>> = {
  array: 'arrays',
  arrays: 'arrays',
  'array-and-hashing': 'hashing',
  'hash-table': 'hashing',
  'hash-tables': 'hashing',
  hashtable: 'hashing',
  hashtables: 'hashing',
  backtracking: 'recursion-and-backtracking',
  binarysearch: 'binary-search',
  'bfs-dfs': 'bfs-and-dfs',
  bfs: 'bfs-and-dfs',
  'breadth-first-search': 'bfs-and-dfs',
  'depth-first-search': 'bfs-and-dfs',
  'disjoint-set': 'disjoint-set-union',
  dfs: 'bfs-and-dfs',
  dp: 'dynamic-programming',
  graph: 'graphs',
  heap: 'heaps-and-priority-queues',
  'heap-and-priority-queue': 'heaps-and-priority-queues',
  'heaps-and-priority-queue': 'heaps-and-priority-queues',
  heaps: 'heaps-and-priority-queues',
  'linked-list': 'linked-lists',
  linkedlist: 'linked-lists',
  'linked-lists': 'linked-lists',
  'minimum-spanning-tree': 'minimum-spanning-trees',
  'prefix-sum': 'prefix-sums',
  priorityqueue: 'heaps-and-priority-queues',
  'priority-queue': 'heaps-and-priority-queues',
  'priority-queues': 'heaps-and-priority-queues',
  recursion: 'recursion-and-backtracking',
  'shortest-path': 'shortest-paths',
  slidingwindow: 'sliding-window',
  string: 'strings',
  stacks: 'stacks-and-queues',
  queues: 'stacks-and-queues',
  'topological-sorting': 'topological-sort',
  sortings: 'sorting',
  tree: 'trees',
  'two-pointer': 'two-pointers',
  'union-find': 'disjoint-set-union',
  'sliding-window': 'sliding-window',
  stack: 'stacks-and-queues',
  'stack-and-queue': 'stacks-and-queues',
  queue: 'stacks-and-queues',
  'segment-tree': 'segment-trees',
  'fenwick-tree': 'fenwick-trees',
  trie: 'tries',
  tries: 'tries',
}

const canonicalTopic = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
  return canonicalTopicAliases[normalized] ?? normalized
}

export const canonicalCoachTopic = canonicalTopic

const normalizedPreferenceText = (value: string) =>
  ` ${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

const topicPreferenceVariants = (topic: TopicDefinition) => {
  const variants = new Set<string>([
    topic.slug.replace(/-/g, ' '),
    topic.name.toLowerCase(),
  ])
  Object.entries(canonicalTopicAliases).forEach(([alias, canonical]) => {
    if (canonical === topic.slug) variants.add(alias.replace(/-/g, ' '))
  })
  return [...variants].sort((left, right) => right.length - left.length)
}

const negativeTopicPreferencePattern =
  /\b(?:avoid|skip|never|without|exclude|excluded|omit|omitted|no|dont|don t|do not|not mention|not include|not recommend|not want|not interested)\b/

const topicIsExplicitlyExcluded = (text: string, topic: TopicDefinition) => {
  const normalized = normalizedPreferenceText(text)
  return topicPreferenceVariants(topic).some((variant) => {
    const marker = ` ${variant} `
    let offset = normalized.indexOf(marker)
    while (offset >= 0) {
      const contextStart = Math.max(0, offset - 96)
      const contextEnd = Math.min(
        normalized.length,
        offset + marker.length + 96,
      )
      if (
        negativeTopicPreferencePattern.test(
          normalized.slice(contextStart, contextEnd),
        )
      ) {
        return true
      }
      offset = normalized.indexOf(marker, offset + marker.length)
    }
    return false
  })
}

export const extractCoachTopicExclusions = (preference?: string) => {
  if (preference === undefined || preference.trim() === '') return []
  return topicDefinitions
    .filter((topic) => topicIsExplicitlyExcluded(preference, topic))
    .map((topic) => topic.slug)
}

const containsExcludedCoachTopic = (
  value: string,
  excludedTopics: readonly string[],
) => {
  if (excludedTopics.length === 0) return false
  const normalized = normalizedPreferenceText(value)
  return excludedTopics.some((slug) => {
    const definition = definitionBySlug.get(slug)
    return (
      definition !== undefined &&
      topicPreferenceVariants(definition).some((variant) =>
        normalized.includes(` ${variant} `),
      )
    )
  })
}

const redactExcludedCoachTopics = (
  value: string,
  excludedTopics: readonly string[],
) => {
  if (excludedTopics.length === 0) return value
  return topicDefinitions.reduce((current, topic) => {
    if (!excludedTopics.includes(topic.slug)) return current
    return topicPreferenceVariants(topic).reduce(
      (text, variant) =>
        text.replace(
          new RegExp(`\\b${variant.replace(/ /g, '[\\s-]+')}\\b`, 'gi'),
          '[topic omitted by learner]',
        ),
      current,
    )
  }, value)
}

// Answers drop whole lines that mention an excluded topic. Replacing the
// words inside a line mangled problem titles ("Remove [topic omitted by
// learner] Elements") and left sentences that no longer made sense.
const withoutExcludedTopicLines = (
  value: string,
  excludedTopics: readonly string[],
) => {
  if (excludedTopics.length === 0) return value
  let inCode = false
  const kept = value.split('\n').filter((line) => {
    if (line.trimStart().startsWith('```')) {
      inCode = !inCode
      return true
    }
    return inCode || !containsExcludedCoachTopic(line, excludedTopics)
  })
  const text = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return text === '' ? redactExcludedCoachTopics(value, excludedTopics) : text
}

export const CoachTopicDefinitions = topicDefinitions

export function validateCoachPrerequisiteGraph(
  definitions: readonly TopicDefinition[] = topicDefinitions,
) {
  const definitionsBySlug = new Map(
    definitions.map((item) => [item.slug, item]),
  )
  if (definitionsBySlug.size !== definitions.length) {
    throw new Error('Duplicate coach topic definition.')
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (topic: string) => {
    if (visiting.has(topic)) {
      throw new Error(`Cycle in coach topic prerequisites: ${topic}`)
    }
    if (visited.has(topic)) return
    const definition = definitionsBySlug.get(topic)
    if (definition === undefined) {
      throw new Error(`Unknown coach prerequisite topic: ${topic}`)
    }
    visiting.add(topic)
    definition.prerequisites.forEach(visit)
    visiting.delete(topic)
    visited.add(topic)
  }
  definitions.forEach(({ slug }) => visit(slug))
  return true
}

validateCoachPrerequisiteGraph()

const statusByIdentity = (actions: readonly ProblemActionRecord[]) => {
  const sorted = actions
    .filter(
      (action) =>
        action.actionType === 'status_changed' &&
        action.learnerStatus !== undefined,
    )
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )
  const grouped = new Map<string, ProblemActionRecord[]>()
  for (const action of sorted) {
    const key = identity(action.provider, action.externalId)
    const values = grouped.get(key) ?? []
    values.push(action)
    grouped.set(key, values)
  }
  const result = new Map<string, LearnerProblemStatus>()
  for (const [key, values] of grouped) {
    const manual = values.filter((value) => value.evidenceSource === 'manual')
    const latest = manual.at(-1) ?? values.at(-1)
    if (latest?.learnerStatus !== undefined)
      result.set(key, latest.learnerStatus as LearnerProblemStatus)
  }
  return result
}

const dismissalByIdentity = (actions: readonly ProblemActionRecord[]) => {
  const sorted = actions
    .filter(
      (action) =>
        action.actionType === 'dismissed' ||
        action.actionType === 'dismissal_restored',
    )
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )
  const result = new Set<string>()
  for (const action of sorted) {
    const key = identity(action.provider, action.externalId)
    if (action.actionType === 'dismissed') result.add(key)
    else result.delete(key)
  }
  return result
}

const currentDismissalRecords = (actions: readonly ProblemActionRecord[]) => {
  const latest = new Map<string, ProblemActionRecord>()
  for (const action of actions
    .filter(
      (item) =>
        item.actionType === 'dismissed' ||
        item.actionType === 'dismissal_restored',
    )
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )) {
    latest.set(identity(action.provider, action.externalId), action)
  }
  return [...latest.values()]
    .filter((action) => action.actionType === 'dismissed')
    .sort(
      (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
    )
}

const combinedCompleteness = (
  values: readonly ('complete' | 'partial' | 'unknown')[],
): 'complete' | 'partial' | 'unknown' =>
  values.includes('complete') &&
  !values.includes('partial') &&
  !values.includes('unknown')
    ? 'complete'
    : values.includes('partial')
      ? 'partial'
      : 'unknown'

const dayDifference = (date: Date | undefined, now: Date) =>
  date === undefined
    ? undefined
    : Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000))

const descendingIsoDate = (
  left: string | null | undefined,
  right: string | null | undefined,
) => Date.parse(right ?? '') - Date.parse(left ?? '')

const localDateParts = (date: Date, timezone: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date)
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    )
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
      values.weekday ?? '',
    )
    return {
      weekday: weekday < 0 ? 0 : weekday,
      date: `${values.year}-${values.month}-${values.day}`,
      time: `${values.hour === '24' ? '00' : values.hour}:${values.minute}`,
    }
  } catch {
    return {
      weekday: date.getUTCDay(),
      date: date.toISOString().slice(0, 10),
      time: date.toISOString().slice(11, 16),
    }
  }
}

const coachActivityTrends = (
  actions: readonly ProblemActionRecord[],
  submissions: readonly ProviderSubmission[],
  solvedProblems: readonly ProviderSolvedProblem[],
  timezone: string,
  now: Date,
): CoachContextSnapshot['activityTrends'] => {
  const attemptedByDate = new Map<string, Set<string>>()
  const solvedByDate = new Map<string, Set<string>>()
  let hasEvidence = false
  const add = (date: Date | undefined, key: string, solved: boolean) => {
    if (date === undefined || Number.isNaN(date.getTime())) return
    hasEvidence = true
    const dateKey = localDateParts(date, timezone).date
    const attempted = attemptedByDate.get(dateKey) ?? new Set<string>()
    attempted.add(key)
    attemptedByDate.set(dateKey, attempted)
    if (solved) {
      const solvedSet = solvedByDate.get(dateKey) ?? new Set<string>()
      solvedSet.add(key)
      solvedByDate.set(dateKey, solvedSet)
    }
  }
  actions.forEach((action) => {
    if (
      action.actionType !== 'status_changed' ||
      (action.learnerStatus !== 'attempted' &&
        action.learnerStatus !== 'solved')
    )
      return
    add(
      action.occurredAt,
      identity(action.provider, action.externalId),
      action.learnerStatus === 'solved',
    )
  })
  submissions.forEach((submission) => {
    if (submission.occurredAt === undefined) return
    add(
      new Date(submission.occurredAt),
      identity(submission.provider, submission.externalId),
      submission.isAccepted,
    )
  })
  solvedProblems.forEach((problem) => {
    const occurredAt =
      problem.occurredAt ?? problem.lastObservedAt ?? problem.firstObservedAt
    add(
      occurredAt === undefined || occurredAt === null
        ? undefined
        : new Date(occurredAt),
      identity(problem.provider, problem.externalId),
      true,
    )
  })
  if (!hasEvidence) return []
  return ([30, 90] as const).map((windowDays) => {
    const points = Array.from({ length: windowDays }, (_, index) => {
      const date = new Date(
        now.getTime() - (windowDays - 1 - index) * 86_400_000,
      )
      const key = localDateParts(date, timezone).date
      return {
        date: key,
        attempted: attemptedByDate.get(key)?.size ?? 0,
        solved: solvedByDate.get(key)?.size ?? 0,
      }
    })
    return { windowDays, points }
  })
}

const coachMomentum = (trends: CoachContextSnapshot['activityTrends']) => {
  const points = trends.find((trend) => trend.windowDays === 30)?.points ?? []
  const recent = points.slice(-7)
  const prior = points.slice(-14, -7)
  const average = (values: typeof points) =>
    values.length === 0
      ? 0
      : values.reduce((sum, point) => sum + point.solved, 0) / values.length
  const recentAverage = average(recent)
  const priorAverage = average(prior)
  const state:
    'accelerating' | 'steady' | 'plateauing' | 'declining' | 'inactive' =
    recentAverage === 0 && priorAverage === 0
      ? 'inactive'
      : priorAverage > 0 && recentAverage < priorAverage * 0.6
        ? 'declining'
        : priorAverage > 0 && recentAverage > priorAverage * 1.3
          ? 'accelerating'
          : recentAverage < priorAverage * 0.9
            ? 'plateauing'
            : 'steady'
  return { state, recentAverage, priorAverage }
}

const CODE_LINE_PATTERN =
  /(?:#include\s*[<"]|\busing\s+namespace\b|^\s*(?:const|let|var|int|long\s+long|bool|string|vector|auto|char|double|float|ll)\b[\w<>:,\s*&]*?\s[\w*&]+\s*(?:=|\[|;|\()|^\s*(?:void|int|long\s+long|bool|string|vector|auto)\s+\w+\s*\([^)]*\)\s*[{;]?\s*$|^\s*(?:for|while|if|else\s+if)\s*\(.*\)\s*\{?\s*$|^\s*[{}]+\s*$|[;{]\s*$|^\s*(?:def|class)\s+\w+.*:\s*$|^\s*return\b.*;\s*$)/
const PROBLEM_MARKER_PATTERN =
  /\b(?:problem\s+statement|input\s+(?:format|description)?|output\s+(?:format|description)?|constraints?|sample\s+(?:input|output|tests?)|examples?)\b/gi

// Learner-supplied code and copied problem statements are transient: they
// reach the model for the current turn but are never stored. Only the lines
// that look like code are replaced, so the surrounding question survives
// ("why does this give WA? [code omitted] it fails on n = 1").
const omitCodeAndProblemText = (content: string) => {
  const withoutFences = content.replace(/```[\s\S]*?```/g, '\n[code omitted]\n')
  const withoutInlineCode = withoutFences
    .replace(/<code>[\s\S]*?<\/code>/gi, '[code omitted]')
    .replace(/`[^`\n]*`/g, '[code omitted]')
  const lines: string[] = []
  for (const line of withoutInlineCode.split('\n')) {
    const isCode = CODE_LINE_PATTERN.test(line)
    if (!isCode) {
      lines.push(line)
    } else if (lines.at(-1)?.trim() !== '[code omitted]') {
      lines.push('[code omitted]')
    }
  }
  const text = lines
    .join('\n')
    .replace(/(?:\[code omitted\]\s*){2,}/g, '[code omitted]\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\s*\n(?=\[code omitted\])/g, '\n')
    .trim()
  const problemMarkers = text.match(PROBLEM_MARKER_PATTERN)
  if (
    text.length >= 120 &&
    new Set(problemMarkers?.map((marker) => marker.toLowerCase()) ?? []).size >=
      2
  ) {
    return '[problem context omitted]'
  }
  return text
}

// Markdown links keep their target only when it is a safe public link.
const keepSafeMarkdownLinks = (
  content: string,
  allowedUrls?: ReadonlySet<string>,
) =>
  content
    .split(/(```[\s\S]*?```)/)
    .map((part) =>
      part.startsWith('```')
        ? part
        : part.replace(
            /(?<!!)\[([^\]\n]{1,200})\]\(([^)\s]{0,2048})\)/g,
            (match, text: string, target: string) =>
              allowedCoachAnswerUrl(target, allowedUrls) ? match : text,
          ),
    )
    .join('')

const redactCoachLinksAndSecrets = (
  content: string,
  allowedUrls?: ReadonlySet<string>,
) =>
  // Safe public https links stay clickable (only `allowedUrls` when given);
  // any other link is reduced to its site name.
  keepSafeMarkdownLinks(content, allowedUrls)
    .replace(/(?:https?:\/\/|www\.)[^\s)\]>"'`]+/gi, (match) => {
      const url = match.replace(/[.,;:!?]+$/, '')
      if (allowedCoachAnswerUrl(url, allowedUrls)) return match
      try {
        return new URL(
          /^https?:/i.test(match) ? match : `https://${match}`,
        ).hostname.replace(/^www\./, '')
      } catch {
        return '[link removed]'
      }
    })
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[contact removed]')
    .replace(
      /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}|\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+/gi,
      '[secret removed]',
    )
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      '[id removed]',
    )

// Coach-authored answers keep their Markdown and code examples: a CP coach
// that cannot show code is not useful. Links and secrets are redacted rather
// than failing the whole turn; sources are attached separately as citations.
const sanitizeAssistantAnswer = (
  content: string,
  allowedUrls?: ReadonlySet<string>,
) => redactCoachLinksAndSecrets(content, allowedUrls).trim().slice(0, 12_000)

// Public https links stay in learner text so the coach (and the saved
// thread) can see what was pasted; query strings that look like secrets and
// any embedded credentials are dropped.
const keepPublicLink = (match: string) => {
  const trailing = /[.,;:!?]+$/.exec(match)?.[0] ?? ''
  const raw = match.slice(0, match.length - trailing.length)
  try {
    const url = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`)
    url.username = ''
    url.password = ''
    url.hash = ''
    if (
      /(?:token|key|auth|session|sig|secret|password|code)=/i.test(url.search)
    ) {
      url.search = ''
    }
    const text = url.toString()
    return isSafeCoachPublicUrl(text) ? text + trailing : '[link omitted]'
  } catch {
    return '[link omitted]'
  }
}

const omitGeneratedCodeAndProblemText = (content: string) =>
  redactCoachLinksAndSecrets(
    content
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/<code>([\s\S]*?)<\/code>/gi, '$1')
      .replace(/`([^`\n]*)`/g, '$1'),
  )
    .replace(/\s+/g, ' ')
    .trim()

const redactCoachContextText = (content: string, maxLength: number) =>
  omitCodeAndProblemText(content)
    .replace(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi, keepPublicLink)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[contact omitted]')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      '[id omitted]',
    )
    .replace(
      /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}|\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+/gi,
      '[secret omitted]',
    )
    .slice(0, maxLength)
    .trim()

// The model context stays small: the stored activity digest carries the
// learner's measured history, detailed rows are fetched through agent tools,
// and heavy fields used only for server-built charts are left out. A large
// context was the main cause of slow, generic, and timed-out coach turns.
const coachContextForAi = ({
  workspace: _workspace,
  practiceProblems: _practiceProblems,
  analytics: _analytics,
  profileDigest,
  providerProfiles,
  recentSubmissions,
  recentSolved,
  recentTimers,
  dismissedProblems,
  activityTrends,
  ...context
}: CoachContextSnapshot) => ({
  ...context,
  // Fall back to the per-request digest until a stored one exists.
  ...(context.activityDigest === undefined && profileDigest !== undefined
    ? { profileDigest }
    : {}),
  providerProfiles: providerProfiles.map(
    ({ topicCounts: _topicCounts, ...profile }) => profile,
  ),
  recentSubmissions: recentSubmissions.slice(0, 8),
  recentSolved: recentSolved.slice(0, 8),
  recentTimers: recentTimers.slice(0, 5),
  dismissedProblems: dismissedProblems.slice(0, 10),
  availablePresentationDatasets: [
    {
      id: 'learner-summary',
      description: 'A compact summary of current focus and observed activity.',
    },
    ...(context.roadmap.topics.length >= 2
      ? [
          {
            id: 'topic-assessments',
            description:
              'A chart comparing topic assessment, attempts, accuracy, and recency.',
          },
          {
            id: 'topic-comparison',
            description: 'A concise table explaining topic priority signals.',
          },
        ]
      : []),
    ...(activityTrends.length > 0
      ? [
          {
            id: 'practice-trend-30d',
            description: 'A chart of recent attempted and solved activity.',
          },
        ]
      : []),
    ...(context.recentRatings.length > 0 || context.recentContests.length > 0
      ? [
          {
            id: 'contest-rating-history',
            description: 'Recent contest and rating history.',
          },
        ]
      : []),
    ...(context.roadmap.topics.some((topic) => topic.suggestions.length > 0)
      ? [
          {
            id: 'trusted-problems',
            description: 'Up to five trusted problems from the current plan.',
          },
        ]
      : []),
  ],
  availablePresentationProblems: context.roadmap.topics
    .filter(
      (topic) => !context.excludedTopics.includes(canonicalTopic(topic.topic)),
    )
    .flatMap((topic) =>
      topic.suggestions.map((suggestion) => ({
        id: identity(
          suggestion.problem.provider,
          suggestion.problem.externalId,
        ),
        topic: topic.topic,
        title: suggestion.problem.title,
        provider: suggestion.problem.provider,
        difficulty: suggestion.problem.normalizedDifficulty,
      })),
    )
    .filter(
      (problem, index, problems) =>
        problems.findIndex((candidate) => candidate.id === problem.id) ===
        index,
    )
    .slice(0, 20),
  userInstructions: [
    ...(() => {
      const profile = asRecord(context.profile)
      return [
        profile?.recommendationPreference,
        profile?.additionalConsiderations,
      ].filter((value): value is string => typeof value === 'string')
    })(),
    ...context.memories
      .filter(
        (memory) =>
          memory.category === 'user_instruction' ||
          memory.category === 'preference',
      )
      .map((memory) => memory.statement),
  ].slice(0, 12),
  // Canonical links are owned by Express and rendered only after the learner
  // receives a validated response. The model gets each topic's assessment and
  // the IDs of its trusted suggestions; `availablePresentationProblems` holds
  // their titles.
  roadmap: {
    dataCompleteness: context.roadmap.dataCompleteness,
    staleProviders: context.roadmap.staleProviders,
    generatedAt: context.roadmap.generatedAt,
    ...(context.roadmap.refreshHint?.suggested === true
      ? { refreshSuggested: context.roadmap.refreshHint.reasons }
      : {}),
    topics: context.roadmap.topics.map((topic) => ({
      topic: topic.topic,
      name: topic.name,
      lane: topic.lane,
      ...(topic.manualStatus === undefined
        ? {}
        : { manualStatus: topic.manualStatus }),
      assessment: topic.assessment,
      score: Math.round(topic.score * 100) / 100,
      confidence: Math.round(topic.confidence * 100) / 100,
      reason: topic.reason,
      evidence: {
        solved: topic.evidence.solvedProblems,
        attempted: topic.evidence.attemptedProblems,
        submissions: topic.evidence.totalSubmissions,
        accepted: topic.evidence.acceptedSubmissions,
        ...(topic.evidence.lastEvidenceAt === undefined
          ? {}
          : { lastEvidenceAt: topic.evidence.lastEvidenceAt }),
      },
      ...(topic.prerequisites.length === 0
        ? {}
        : { prerequisites: topic.prerequisites }),
      suggestionIds: topic.suggestions.map((suggestion) =>
        identity(suggestion.problem.provider, suggestion.problem.externalId),
      ),
    })),
  },
})

const safeLearnerProfile = (
  profile: Awaited<ReturnType<LearnerProfileRepository['findByAuthUserId']>>,
  excludedTopics: readonly string[] = [],
) => {
  if (profile === null) return null
  const visibleTopic = (topic: string) =>
    !excludedTopics.includes(canonicalTopic(topic))
  return {
    ...profile,
    topicPreference:
      profile.topicPreference.mode === 'selected'
        ? {
            ...profile.topicPreference,
            topics: profile.topicPreference.topics.filter(visibleTopic),
          }
        : profile.topicPreference,
    preferredTopics: profile.preferredTopics.filter(visibleTopic),
    ...(profile.additionalConsiderations === undefined
      ? {}
      : {
          additionalConsiderations: redactCoachContextText(
            redactExcludedCoachTopics(
              profile.additionalConsiderations,
              excludedTopics,
            ),
            1_000,
          ),
        }),
    ...(profile.recommendationPreference === undefined
      ? {}
      : {
          recommendationPreference: redactCoachContextText(
            redactExcludedCoachTopics(
              profile.recommendationPreference,
              excludedTopics,
            ),
            500,
          ),
        }),
  }
}

const unsafeCoachTextPatterns = [
  /(?:https?:\/\/|www\.)\S+/i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}|\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
]

const isSafeCoachText = (value: string) =>
  !unsafeCoachTextPatterns.some((pattern) => pattern.test(value))

const targetDifficulty = (
  profile: Awaited<ReturnType<LearnerProfileRepository['findByAuthUserId']>>,
) => {
  if (profile?.difficultyComfort === 'challenging') return 'hard'
  if (profile?.difficultyComfort === 'medium') return 'medium'
  return 'easy'
}

const difficultyWeight = (
  difficulty: ExternalProblemSummary['normalizedDifficulty'],
) => (difficulty === 'hard' ? 1 : difficulty === 'medium' ? 0.67 : 0.33)

const targetWeight = (
  difficulty: ExternalProblemSummary['normalizedDifficulty'],
  target: string,
) => {
  if (difficulty === undefined) return 0.5
  if (difficulty === target) return 1
  if (target === 'easy' && difficulty === 'medium') return 0.8
  if (target === 'hard' && difficulty === 'medium') return 0.8
  return 0.45
}

const fallbackEvidence = (
  source: CoachEvidenceReference['source'],
  detail: string,
  completeness: 'complete' | 'partial' | 'unknown' = 'partial',
  stale = completeness !== 'complete',
): CoachEvidenceReference => ({
  source,
  label: {
    activity: 'Your provider activity',
    analytics: 'Your learning analytics',
    contest: 'Your contest history',
    memory: 'Your approved learner memories',
    profile: 'Your connected provider profiles',
    progress: 'Your recorded progress',
    roadmap: 'Your AlgoMemtor roadmap',
    recommendations: 'Your recommendation history',
  }[source],
  detail,
  completeness,
  stale,
})

const comparableTopic = (topic: ImprovementTopic) => ({
  ...topic,
  updatedAt: undefined,
  suggestions: topic.suggestions.map((suggestion) => ({
    ...suggestion,
    createdAt: undefined,
  })),
})

const comparableRoadmap = (roadmap: ImprovementRoadmap) =>
  JSON.stringify({
    ...roadmap,
    id: undefined,
    version: undefined,
    generatedAt: undefined,
    lastRefreshedAt: undefined,
    refreshHint: undefined,
    topics: roadmap.topics.map(comparableTopic),
  })

// A plan that has not changed or been refreshed for this long is worth
// rebuilding from fresh platform data.
export const ROADMAP_REFRESH_AFTER_MS = 7 * 86_400_000

const withoutRefreshHint = ({
  refreshHint: _refreshHint,
  ...roadmap
}: ImprovementRoadmap): ImprovementRoadmap => roadmap

export type CoachContextSnapshot = {
  // Today's AlgoMemtor recommendation feed, as the learner sees it.
  currentRecommendations?: {
    position: number
    provider: ProviderKey
    externalId: string
    title?: string
    rating?: number
    reason: string
  }[]
  learnerId: string
  excludedTopics: string[]
  profile: Awaited<ReturnType<LearnerProfileRepository['findByAuthUserId']>>
  roadmap: ImprovementRoadmap
  roadmapTransitions?: Array<{
    version: number
    generatedAt: string
    changedTopics: string[]
  }>
  analytics: unknown
  providerProfiles: Array<
    Pick<
      ProviderProfile,
      | 'provider'
      | 'rating'
      | 'solvedCount'
      | 'acceptanceRate'
      | 'topicCounts'
      | 'completeness'
    > & {
      provenance: Pick<
        ProviderProfile['provenance'],
        'completeness' | 'extractionStrategy' | 'fetchedAt' | 'stale'
      >
    }
  >
  memories: Array<Pick<AiMemoryRecord, 'category' | 'statement' | 'confidence'>>
  recentSubmissions: Array<
    Pick<
      ProviderSubmission,
      | 'provider'
      | 'externalId'
      | 'verdict'
      | 'occurredAt'
      | 'isAccepted'
      | 'problemTitle'
      | 'language'
    >
  >
  recentSolved: Array<
    Pick<
      ProviderSolvedProblem,
      'provider' | 'externalId' | 'topics' | 'providerTags' | 'occurredAt'
    >
  >
  recentRatings: Array<
    Pick<
      ProviderRatingChange,
      | 'provider'
      | 'occurredAt'
      | 'oldRating'
      | 'newRating'
      | 'delta'
      | 'contestName'
    >
  >
  recentContests: Array<
    Pick<
      ContestParticipation,
      | 'provider'
      | 'contestId'
      | 'contestName'
      | 'rank'
      | 'score'
      | 'ratingChange'
      | 'attendedAt'
    >
  >
  recentProgress: Array<{
    provider: ProviderKey
    externalId: string
    learnerStatus: LearnerProblemStatus
    evidenceSource: string
    occurredAt: string
  }>
  bookmarks: Array<{ provider: ProviderKey; externalId: string }>
  recommendationFeedback: Array<{
    usefulness?: 'useful' | 'not_useful'
    perceivedDifficulty?: 'too_easy' | 'about_right' | 'too_hard'
    note?: string
    createdAt: string
  }>
  dismissedProblems: Array<{
    provider: ProviderKey
    externalId: string
    occurredAt: string
  }>
  reflections: Array<{
    provider: ProviderKey
    externalId: string
    perceivedDifficulty: string
    note?: string
    createdAt: string
  }>
  recentTimers: Array<
    Pick<
      ProblemTimerSession,
      'problem' | 'state' | 'durationSeconds' | 'completedAt' | 'createdAt'
    >
  >
  activityTrends: Array<{
    windowDays: 30 | 90
    points: Array<{ date: string; attempted: number; solved: number }>
  }>
  momentum: {
    state: 'accelerating' | 'steady' | 'plateauing' | 'declining' | 'inactive'
    recentAverage: number
    priorAverage: number
  }
  conversationSummary?: string
  recentTurns: Array<{ role: 'user' | 'assistant'; content: string }>
  dataCompleteness: 'complete' | 'partial' | 'unknown'
  // Complete-profile digest that is always in the prompt; the workspace and
  // trusted practice problems are queried through agent tools and never
  // spread into the prompt context.
  profileDigest?: CoachProfileDigest
  // Stored summary of all synced platform activity, refreshed after syncs.
  activityDigest?: LearnerActivityDigest
  workspace?: CoachWorkspace
  practiceProblems?: Map<string, ExternalProblemSummary>
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const providerFromCoachQuestion = (
  question: string,
): ProviderKey | undefined => {
  const lower = question.toLowerCase()
  if (/\b(codeforces|codeforces\s+rating|\bcf\b)/i.test(lower)) {
    return 'codeforces'
  }
  if (/\b(codechef|codechef\s+rating)/i.test(lower)) return 'codechef'
  if (/\b(leetcode|leetcode\s+rating|\blc\b)/i.test(lower)) {
    return 'leetcode'
  }
  if (/\b(cses)\b/i.test(lower)) return 'cses'
  return undefined
}

const isRatingOrContestQuestion = (question: string) =>
  /\b(contest|rating|candidate\s+master|pupil|specialist|expert|master)\b/i.test(
    question,
  )

const richCitation = (
  id: string,
  source: CoachCitation['source'],
  title: string,
  retrievedAt: string,
  stale: boolean,
  detail?: string,
): CoachCitation => ({
  id,
  source,
  title,
  ...(detail === undefined ? {} : { detail }),
  retrievedAt,
  stale,
})

const coachRichContentForContext = (
  question: string,
  context: CoachContextSnapshot,
  now = new Date(),
  presentation?: AiCoachResult['presentation'],
): CoachRichContent => {
  const generatedAt = now.toISOString()
  const stale = context.dataCompleteness !== 'complete'
  const lower = question.toLowerCase()
  const selectedDatasets = new Set(presentation?.datasetIds ?? [])
  const requestsChart =
    /\b(chart|charts|graph|graphs|plot|plots|visuali[sz]e|visuali[sz]ation|trend|trends)\b/i.test(
      question,
    )
  const requestsTimeline = /\b(timeline|timelines)\b/i.test(question)
  const requestsTable = /\b(table|tables)\b/i.test(question)
  const requestsMetrics = /\b(metric|metrics|dashboard)\b/i.test(question)
  const requestsProblems =
    /\b(problem|problems|question|questions|practice|next|recommend|suggest)\b/i.test(
      question,
    )
  // Any explicit ask to see data. The model chooses which dataset fits; this
  // guard only stops visuals on questions that did not ask to see anything.
  const requestsAnyVisual =
    /\b(show|display|visuali[sz]e|plot|chart|graph|trend|over\s+time|history|progress|compare|comparison|breakdown|table|timeline|dashboard|metrics?|stats|statistics)\b/i.test(
      question,
    )
  const wantsDataset = (
    id: NonNullable<AiCoachResult['presentation']>['datasetIds'][number],
    legacyDecision: boolean,
  ) => {
    if (presentation !== undefined) {
      return (
        selectedDatasets.has(id) &&
        (id === 'trusted-problems' ? true : requestsAnyVisual)
      )
    }
    const requested =
      id === 'trusted-problems'
        ? requestsProblems
        : id === 'learner-summary'
          ? requestsMetrics
          : id === 'contest-rating-history'
            ? requestsTimeline
            : id === 'topic-comparison'
              ? requestsTable
              : requestsChart
    return requested && legacyDecision
  }
  const requestedProvider = providerFromCoachQuestion(question)
  const focus = context.roadmap.topics.filter(
    (topic) =>
      topic.lane === 'current_focus' &&
      !context.excludedTopics.includes(canonicalTopic(topic.topic)),
  )
  const needs = context.roadmap.topics.filter(
    (topic) =>
      topic.lane === 'needs_more_practice' &&
      !context.excludedTopics.includes(canonicalTopic(topic.topic)),
  )
  const topicCandidates = [...focus, ...needs].slice(0, 6)
  const planningQuestion =
    /\b(next|practice|weak|improve|roadmap|focus)\b/.test(lower)
  const analytics = asRecord(context.analytics)
  const dataAsOf =
    [
      context.roadmap.generatedAt,
      typeof analytics?.generatedAt === 'string' ? analytics.generatedAt : null,
      ...context.providerProfiles.map(
        (profile) => profile.provenance.fetchedAt,
      ),
    ]
      .filter((value): value is string => typeof value === 'string')
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ??
    generatedAt
  const hasProviderActivityCitation =
    context.providerProfiles.length > 0 ||
    context.recentSolved.length > 0 ||
    context.recentSubmissions.length > 0 ||
    context.recentRatings.length > 0 ||
    context.recentContests.length > 0
  const hasAnalyticsCitation = context.analytics !== null
  const citations: CoachCitation[] = [
    richCitation(
      'roadmap-assessment',
      'learner',
      'Roadmap assessment',
      generatedAt,
      stale,
      `topic-assessment-v1 roadmap version ${context.roadmap.version}`,
    ),
  ]
  if (hasProviderActivityCitation) {
    citations.push(
      richCitation(
        'provider-activity',
        'provider',
        'Observed provider activity',
        generatedAt,
        stale,
        `${context.recentSolved.length} solved observations and ${context.recentSubmissions.length} recent submissions`,
      ),
    )
  }
  const inventory = asRecord(analytics?.inventory)
  const trend = Array.isArray(analytics?.trend)
    ? analytics.trend.filter((point): point is Record<string, unknown> => {
        const value = asRecord(point)
        return (
          value !== null &&
          typeof value.date === 'string' &&
          finiteNumber(value.attempted) !== null &&
          finiteNumber(value.solved) !== null
        )
      })
    : []
  if (trend.length > 0 || context.activityTrends.length > 0) {
    citations.push(
      richCitation(
        'practice-analytics',
        'learner',
        'Practice analytics',
        generatedAt,
        stale,
        'Recorded activity in the current analytics window',
      ),
    )
  }
  const blocks: CoachRichContent['blocks'] = []
  const solvedCount = finiteNumber(inventory?.solved)
  const attemptedCount = finiteNumber(inventory?.attempted)
  const completionRate = finiteNumber(analytics?.completionRate)
  const providerSolvedTotals = context.providerProfiles.reduce(
    (total, profile) => total + (profile.solvedCount ?? 0),
    0,
  )
  if (
    wantsDataset(
      'learner-summary',
      lower.includes('next') ||
        lower.includes('practice') ||
        lower.includes('weak') ||
        lower.includes('improve') ||
        planningQuestion,
    )
  ) {
    blocks.push({
      type: 'metric_grid',
      title: 'Your current signal',
      metrics: [
        {
          label: 'Current focus',
          value:
            focus.length > 0
              ? focus
                  .slice(0, 2)
                  .map((topic) => topic.name)
                  .join(' · ')
              : 'Gathering evidence',
          detail: 'Manual roadmap statuses remain authoritative.',
          citationIds: ['roadmap-assessment'],
        },
        {
          label: 'Observed solves',
          value: solvedCount ?? context.recentSolved.length,
          detail: 'Observed records, not an assumed complete history.',
          citationIds: hasProviderActivityCitation
            ? ['provider-activity']
            : ['roadmap-assessment'],
        },
        {
          label: 'Observed attempts',
          value: attemptedCount ?? context.recentSubmissions.length,
          detail:
            completionRate === null
              ? 'Submission history is bounded.'
              : `${Math.round(completionRate * 100)}% recorded completion rate`,
          citationIds: hasAnalyticsCitation
            ? ['practice-analytics']
            : ['roadmap-assessment'],
        },
        ...(context.providerProfiles.length === 0
          ? []
          : [
              {
                label: 'Connected profiles',
                value: context.providerProfiles.length,
                detail: 'Public profile snapshots available to the coach.',
                citationIds: ['provider-activity'],
              },
              ...(providerSolvedTotals > 0
                ? [
                    {
                      label: 'Profile solve totals',
                      value: providerSolvedTotals,
                      detail:
                        'Aggregate exposure across providers, not proof of specific topic solves.',
                      citationIds: ['provider-activity'],
                    },
                  ]
                : []),
            ]),
      ],
    })
  }
  if (
    wantsDataset(
      'topic-assessments',
      planningQuestion || /\b(topic|topics|readiness)\b/.test(lower),
    ) &&
    topicCandidates.length > 0
  ) {
    blocks.push({
      type: 'chart',
      datasetId: 'topic-assessments',
      chartType: 'bar',
      title: 'Topic readiness comparison',
      summary:
        'Compare your current readiness, attempts, accuracy, and recent practice across focus topics.',
      series: [
        { key: 'score', label: 'Assessment score' },
        { key: 'attempts', label: 'Observed attempts' },
        { key: 'accuracy', label: 'Recent accuracy' },
        { key: 'recency', label: 'Practice recency' },
      ],
      points: topicCandidates.map((topic) => {
        const evidence = topic.evidence
        const accuracy =
          evidence.totalSubmissions === 0
            ? 0
            : Math.round(
                (evidence.acceptedSubmissions / evidence.totalSubmissions) *
                  100,
              )
        const recency =
          evidence.uniqueProblems === 0
            ? 0
            : Math.round(100 - Math.min(100, (evidence.recentDays / 90) * 100))
        return {
          label: topic.name,
          values: {
            score: Math.round(topic.score * 100),
            attempts: evidence.attemptedProblems,
            accuracy,
            recency,
          },
        }
      }),
      citationIds: ['roadmap-assessment'],
    })
  }
  const activityTrend30 = context.activityTrends.find(
    (item) => item.windowDays === 30,
  )
  const activityTrendPoints = activityTrend30?.points ?? trend
  if (
    activityTrendPoints.length > 0 &&
    wantsDataset(
      'practice-trend-30d',
      lower.includes('history') ||
        lower.includes('progress') ||
        lower.includes('practice') ||
        lower.includes('next') ||
        lower.includes('contest'),
    )
  ) {
    blocks.push({
      type: 'chart',
      datasetId: 'practice-trend-30d',
      chartType: 'stacked_bar',
      title: 'Recent practice activity',
      summary: 'Your recent attempted and solved practice activity.',
      series: [
        { key: 'attempted', label: 'Attempted' },
        { key: 'solved', label: 'Solved' },
      ],
      points: activityTrendPoints.slice(-30).map((point) => ({
        label: point.date as string,
        values: {
          attempted: finiteNumber(point.attempted) ?? 0,
          solved: finiteNumber(point.solved) ?? 0,
        },
      })),
      citationIds: hasAnalyticsCitation
        ? ['practice-analytics']
        : ['roadmap-assessment'],
    })
  }
  if (
    wantsDataset(
      'contest-rating-history',
      isRatingOrContestQuestion(question),
    ) &&
    (context.recentRatings.length > 0 || context.recentContests.length > 0)
  ) {
    const ratings = requestedProvider
      ? context.recentRatings.filter(
          (rating) => rating.provider === requestedProvider,
        )
      : context.recentRatings
    const contests = requestedProvider
      ? context.recentContests.filter(
          (contest) => contest.provider === requestedProvider,
        )
      : context.recentContests
    const entries = [
      ...ratings.slice(0, 12).map((rating) => ({
        date: rating.occurredAt,
        label: `${rating.provider.charAt(0).toUpperCase()}${rating.provider.slice(1)} rating change`,
        value: Math.round(rating.delta * 10) / 10,
        detail: `${Math.round(rating.oldRating)} → ${Math.round(rating.newRating)}`,
        citationIds: hasProviderActivityCitation
          ? ['provider-activity']
          : ['roadmap-assessment'],
      })),
      ...contests.slice(0, 12).map((contest) => ({
        date: contest.attendedAt,
        label: `${contest.provider.charAt(0).toUpperCase()}${contest.provider.slice(1)} contest`,
        ...(contest.ratingChange === undefined
          ? {}
          : { value: contest.ratingChange }),
        ...(contest.rank === undefined
          ? {}
          : { detail: `Rank ${contest.rank}` }),
        citationIds: hasProviderActivityCitation
          ? ['provider-activity']
          : ['roadmap-assessment'],
      })),
    ]
      .filter((entry) => entry.date !== undefined)
      .map((entry) => ({ ...entry, date: entry.date as string }))
      .sort((left, right) => right.date.localeCompare(left.date))
    if (entries.length > 0) {
      blocks.push({
        type: 'timeline',
        title: 'Contest and rating history',
        entries: entries.slice(0, 20),
      })
    }
  }
  const allSuggestions = topicCandidates
    .flatMap((topic) => topic.suggestions)
    .filter((suggestion, index, values) => {
      const key = `${suggestion.problem.provider}:${suggestion.problem.externalId}`
      return (
        values.findIndex(
          (candidate) =>
            `${candidate.problem.provider}:${candidate.problem.externalId}` ===
            key,
        ) === index
      )
    })
  // Problems the model selected are hydrated from trusted records only: any
  // roadmap suggestion or the validated practice pool. Order follows the
  // model's selection; unknown IDs are ignored.
  const trustedProblems = new Map<string, ExternalProblemSummary>()
  context.roadmap.topics
    .filter(
      (topic) => !context.excludedTopics.includes(canonicalTopic(topic.topic)),
    )
    .forEach((topic) =>
      topic.suggestions.forEach((suggestion) =>
        trustedProblems.set(
          identity(suggestion.problem.provider, suggestion.problem.externalId),
          suggestion.problem,
        ),
      ),
    )
  context.practiceProblems?.forEach((problem, key) => {
    if (!trustedProblems.has(key)) trustedProblems.set(key, problem)
  })
  const selectedProblems =
    presentation === undefined
      ? allSuggestions.map((suggestion) => suggestion.problem)
      : (presentation.problemIds ?? []).flatMap((problemId) => {
          const problem = trustedProblems.get(problemId)
          return problem === undefined ? [] : [problem]
        })
  const problemsToShow = selectedProblems.slice(0, 5)
  const modelSelectedProblems =
    presentation !== undefined && problemsToShow.length > 0
  if (
    problemsToShow.length > 0 &&
    (modelSelectedProblems ||
      wantsDataset('trusted-problems', requestsProblems))
  ) {
    blocks.push({
      type: 'problem_list',
      title: 'Problems picked for you',
      reason:
        "Chosen by your coach from your roadmap and AlgoMemtor's validated catalog, excluding problems you already solved.",
      problems: problemsToShow,
    })
  }
  if (
    topicCandidates.length >= 2 &&
    wantsDataset(
      'topic-comparison',
      lower.includes('weak') || lower.includes('next'),
    )
  ) {
    blocks.push({
      type: 'comparison_table',
      title: 'Why these topics are prioritized',
      columns: [
        'Topic',
        'Score',
        'Confidence',
        'Attempts',
        'Accuracy',
        'Recent practice',
      ],
      rows: topicCandidates
        .slice(0, 4)
        .map((topic) => [
          topic.name,
          `${Math.round(topic.score * 100)}%`,
          `${Math.round(topic.confidence * 100)}%`,
          topic.evidence.attemptedProblems,
          topic.evidence.totalSubmissions === 0
            ? 'Not observed'
            : `${Math.round((topic.evidence.acceptedSubmissions / topic.evidence.totalSubmissions) * 100)}%`,
          topic.evidence.uniqueProblems === 0
            ? 'Not observed'
            : `${topic.evidence.recentDays}d ago`,
        ]),
      citationIds: ['roadmap-assessment'],
    })
  }
  const suggestedQuestions = presentation?.suggestedQuestions.length
    ? presentation.suggestedQuestions
    : [
        focus[0] === undefined
          ? 'Help me choose a first topic from my roadmap.'
          : `Explain the next skill I should build in ${focus[0].name}.`,
        'Turn this into a focused 30-minute practice plan.',
        'What evidence would make you move this topic to comfortable?',
        'Review my latest failed attempts and identify the pattern.',
      ]
  return CoachRichContentSchema.parse({
    version: 'coach-rich-v2',
    blocks: blocks.slice(0, 8),
    citations: citations.slice(0, 8),
    suggestedQuestions: suggestedQuestions.slice(0, 4),
    generatedAt,
    dataAsOf,
    completeness: context.dataCompleteness,
    stale,
  })
}

const safePublicCitation = (citation: CoachCitation) => {
  return (
    citation.source !== 'web' ||
    (citation.url !== undefined && isSafeCoachPublicUrl(citation.url))
  )
}

const MEMORY_RETRIEVAL_BUDGET_MS = 3_000
const LINKED_PROBLEM_BUDGET_MS = 10_000

// Rejects when `promise` has not settled within `ms`; the underlying request
// still finishes (or times out) on its own.
const withinBudget = <T>(promise: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Budget exceeded.')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error('Request failed.'))
      },
    )
  })

export type CoachServiceOptions = {
  repository: CoachRepository
  learnerProfileRepository: LearnerProfileRepository
  problemActionRepository: ProblemActionRepository
  progressRepository: ProgressRepository
  providerDataRepository: ProviderDataRepository
  providerProfileRepository?: ProviderProfileRepository
  bookmarkRepository: BookmarkRepository
  recommendationRepository?: RecommendationRepository
  providers: readonly ProblemProvider[]
  progressService: ProgressService
  aiMemoryClient: AiMemoryClient
  aiCoachClient: AiCoachClient
  aiRoadmapNoteClient: AiRoadmapNoteClient
  logger: StructuredLogger
  memoryGenerationEnabled?: boolean
  // The stored synced-activity summary: the coach's first source of facts.
  activityDigest?: (authUserId: string) => Promise<LearnerActivityDigest | null>
  // Public statement of a catalog problem, read through its provider adapter.
  problemContent?: (
    provider: ProviderKey,
    externalId: string,
  ) => Promise<ProblemContent | null>
  // Point feature requests (problem hints, solutions, upsolving, contest
  // analysis and progress reports) to their dedicated sections.
  featureRouting?: boolean
  now?: () => Date
}

export class CoachService {
  private readonly proposalConfirmations = new Map<
    string,
    Promise<CoachActionProposal>
  >()

  constructor(private readonly options: CoachServiceOptions) {}

  private now() {
    return new Date(this.options.now?.() ?? new Date())
  }

  async listConversations(userId: string) {
    return this.options.repository.listConversations(userId)
  }

  async createConversation(
    userId: string,
    input: CreateCoachConversationRequest = {},
  ) {
    return this.options.repository.createConversation(userId, input.title)
  }

  async renameConversation(userId: string, id: string, title: string) {
    const conversation = await this.options.repository.renameConversation(
      userId,
      id,
      title,
    )
    if (conversation === null) throw new CoachConversationNotFoundError()
    return conversation
  }

  async getConversation(
    userId: string,
    id: string,
  ): Promise<CoachConversationResponse> {
    const conversation = await this.options.repository.getConversation(
      userId,
      id,
    )
    if (conversation === null) throw new CoachConversationNotFoundError()
    return conversation
  }

  async deleteConversation(userId: string, id: string) {
    const deleted = await this.options.repository.deleteConversation(userId, id)
    if (!deleted) throw new CoachConversationNotFoundError()
    if (this.options.aiCoachClient.deleteConversation !== undefined) {
      try {
        await this.options.aiCoachClient.deleteConversation(userId, id)
      } catch {
        try {
          await this.options.progressRepository.enqueueJob({
            authUserId: userId,
            jobType: 'coach_conversation_audit_deletion',
            evidenceType: 'coach_audit',
            evidenceId: id,
            idempotencyKey: `coach-audit-delete:${userId}:${id}`,
          })
        } catch {
          // The user-visible conversation is already deleted. The AI service
          // has no raw transcript, and the durable outbox will retry audit
          // cleanup when it is available.
          this.options.logger.warn('coach_audit_cleanup_enqueue_failed', {
            errorCode: 'OUTBOX_UNAVAILABLE',
          })
        }
        this.options.logger.warn('coach_audit_cleanup_failed', {
          errorCode: 'AI_COACH_DELETE_UNAVAILABLE',
        })
      }
    }
  }

  async clearDerivedConversationSummaries(userId: string) {
    await this.options.repository.clearConversationSummaries?.(userId)
  }
  async setTopicStatus(
    userId: string,
    topic: string,
    status: CoachManualTopicStatus | null,
  ) {
    const canonical = canonicalTopic(topic)
    if (!definitionBySlug.has(canonical)) throw new CoachUnknownTopicError()
    if (status === null) {
      if (this.options.repository.clearTopicStatus === undefined) {
        throw new CoachProposalStateError()
      }
      await this.options.repository.clearTopicStatus(userId, canonical)
    } else {
      await this.options.repository.setTopicStatus(userId, canonical, status)
    }
    return this.getRoadmap(userId)
  }

  async submitRoadmapNote(userId: string, note: string) {
    const consent = await this.options.progressRepository.getConsent(userId)
    if (
      consent?.enabled !== true ||
      consent.policyVersion !== COACH_POLICY_VERSION
    ) {
      throw new CoachConsentRequiredError()
    }

    const safeNote = redactCoachContextText(note, 500)
    const statuses = await this.options.repository.getTopicStatuses(userId)
    const candidateTopics = topicDefinitions.map((definition) => ({
      slug: definition.slug,
      name: definition.name,
      currentStatus: statuses[definition.slug] ?? null,
    }))

    let classification
    try {
      classification = await this.options.aiRoadmapNoteClient.classify({
        topics: candidateTopics,
        note: safeNote,
      })
    } catch {
      classification = {
        topic: null as string | null,
        status: 'no_change' as const,
        rationale:
          'AI status suggestions are unavailable right now; your note was saved.',
      }
    }

    if (
      classification.topic === null ||
      !definitionBySlug.has(classification.topic)
    ) {
      return {
        topic: null,
        note: safeNote,
        previousStatus: null,
        status: null,
        statusChanged: false,
        rationale: classification.rationale,
        createdAt: this.now().toISOString(),
      }
    }

    const canonical = classification.topic
    const previousStatus = statuses[canonical] ?? null
    const suggestedStatus = classification.status
    let nextStatus = previousStatus
    let statusChanged = false
    if (suggestedStatus !== 'no_change' && suggestedStatus !== previousStatus) {
      await this.options.repository.setTopicStatus(
        userId,
        canonical,
        suggestedStatus,
      )
      nextStatus = suggestedStatus
      statusChanged = true
    }

    const event = await this.options.repository.recordTopicNote(
      userId,
      canonical,
      safeNote,
      nextStatus,
      'ai_note',
    )

    if (this.options.memoryGenerationEnabled !== false) {
      try {
        await this.options.progressRepository.enqueueJob({
          authUserId: userId,
          jobType: 'memory_generation',
          evidenceType: 'topic_note',
          evidenceId: event.id,
          idempotencyKey: `memory:topic_note:${event.id}`,
        })
      } catch {
        this.options.logger.warn('coach_topic_note_memory_enqueue_failed', {
          errorCode: 'OUTBOX_UNAVAILABLE',
        })
      }
    }

    return {
      topic: canonical,
      note: safeNote,
      previousStatus,
      status: nextStatus,
      statusChanged,
      rationale: classification.rationale,
      createdAt: event.occurredAt.toISOString(),
    }
  }

  // Attach a refresh suggestion when platform data is stale or the plan has
  // not moved for a week. The hint is computed on read and never stored.
  private withRefreshHint(roadmap: ImprovementRoadmap): ImprovementRoadmap {
    const plan = withoutRefreshHint(roadmap)
    const reasons: RoadmapRefreshReason[] = []
    if (plan.staleProviders.length > 0) reasons.push('stale_platform_data')
    const anchor = Math.max(
      Date.parse(plan.generatedAt),
      plan.lastRefreshedAt === undefined ? 0 : Date.parse(plan.lastRefreshedAt),
    )
    if (this.now().getTime() - anchor > ROADMAP_REFRESH_AFTER_MS) {
      reasons.push('plan_unchanged')
    }
    return { ...plan, refreshHint: { suggested: reasons.length > 0, reasons } }
  }

  // Rebuild the plan now (callers pull fresh platform data first) and record
  // when the learner last refreshed it.
  async refreshRoadmap(userId: string) {
    const current = withoutRefreshHint(await this.getRoadmap(userId))
    const saved = await this.options.repository.saveRoadmap(userId, {
      ...current,
      lastRefreshedAt: this.now().toISOString(),
    })
    return this.withRefreshHint(saved)
  }

  async getRoadmap(userId: string) {
    return this.withRefreshHint(await this.buildAndSaveRoadmap(userId))
  }

  // The saved plan when one exists; building it only when none was saved.
  // Readers that just need topic context avoid a full rebuild.
  async getStoredRoadmap(userId: string) {
    const stored = await this.options.repository
      .getRoadmap(userId)
      .catch(() => null)
    return stored === null
      ? this.getRoadmap(userId)
      : this.withRefreshHint(stored)
  }

  private async buildAndSaveRoadmap(userId: string) {
    const roadmap = await this.buildRoadmap(userId)
    const existing = await this.options.repository.getRoadmap(userId)
    const normalizedTopics = roadmap.topics.map((topic) => {
      const prior = existing?.topics.find((item) => item.topic === topic.topic)
      return prior !== undefined &&
        JSON.stringify(comparableTopic(prior)) ===
          JSON.stringify(comparableTopic(topic))
        ? { ...topic, updatedAt: prior.updatedAt }
        : { ...topic, updatedAt: this.now().toISOString() }
    })
    const candidate = {
      ...withoutRefreshHint(roadmap),
      topics: normalizedTopics,
      ...(existing?.lastRefreshedAt === undefined
        ? {}
        : { lastRefreshedAt: existing.lastRefreshedAt }),
    }
    if (
      existing !== null &&
      comparableRoadmap(existing) === comparableRoadmap(candidate)
    ) {
      return withoutRefreshHint(existing)
    }
    const saved = await this.options.repository.saveRoadmap(userId, {
      ...candidate,
      id: existing?.id ?? randomUUID(),
      version: existing === null ? 1 : existing.version + 1,
      generatedAt: this.now().toISOString(),
    })
    return saved
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    input: SendCoachMessageRequest,
  ): Promise<CoachResponse> {
    const consent = await this.options.progressRepository.getConsent(userId)
    if (
      consent?.enabled !== true ||
      consent.policyVersion !== COACH_POLICY_VERSION
    ) {
      throw new CoachConsentRequiredError()
    }
    const conversation = await this.options.repository.getConversation(
      userId,
      conversationId,
    )
    if (conversation === null) throw new CoachConversationNotFoundError()
    const safeContent = redactCoachContextText(input.content, 12_000)
    const transientValue = input.transientContext?.trim()
    const transient = transientValue || undefined
    const transientMedia = input.transientMedia
    const omittedUserContext = safeContent !== input.content.trim()
    const userMessage = await this.options.repository.appendMessage(
      userId,
      conversationId,
      {
        role: 'user',
        content:
          safeContent || 'The learner sent transient code or problem context.',
        ...(transient === undefined &&
        transientMedia === undefined &&
        !omittedUserContext
          ? {}
          : { transientContextOmitted: true }),
        evidence: [],
        proposals: [],
      },
    )
    if (userMessage === null) throw new CoachConversationNotFoundError()
    const featureRoute =
      this.options.featureRouting === true
        ? routeCoachFeature(input.content)
        : null
    if (featureRoute !== null) {
      return this.respondWithFeatureRedirect(
        userId,
        conversationId,
        conversation.messages,
        userMessage,
        featureRoute,
      )
    }
    if (
      transient === undefined &&
      transientMedia === undefined &&
      !omittedUserContext &&
      isCoachSmallTalk(input.content)
    ) {
      return this.respondToSmallTalk(
        userId,
        conversationId,
        conversation.messages,
        userMessage,
        input.content,
      )
    }
    const pastedUrls = extractCoachUrls(input.content)
    const [context, linkedProblems] = await Promise.all([
      this.buildContext(userId, conversationId, input.content),
      this.resolveLinkedProblems(pastedUrls),
    ])
    const request: AiCoachRequest = {
      requestId: randomUUID(),
      learnerId: userId,
      conversationId,
      question: input.content,
      ...(transient === undefined ? {} : { transientContext: transient }),
      ...(transientMedia === undefined ? {} : { transientMedia }),
      context: {
        ...coachContextForAi(context),
        ...(pastedUrls.length === 0 ? {} : { pastedUrls }),
        // Transient: statements reach the model for this turn only.
        ...(linkedProblems.length === 0 ? {} : { linkedProblems }),
      },
      ...(context.workspace === undefined
        ? {}
        : { workspace: context.workspace }),
    }
    let result: AiCoachResult
    try {
      result = await this.options.aiCoachClient.respond(request)
      result = result.fallback
        ? this.unavailableResponse()
        : this.sanitizeAiResult(result, context, {
            // A proposal derived from transient code/problem context would turn
            // one-request data into durable learner memory. Keep memory
            // proposals disabled whenever either input field contained content
            // that was omitted from saved history.
            allowMemoryProposals:
              transient === undefined &&
              transientMedia === undefined &&
              !omittedUserContext,
          })
    } catch (error) {
      this.options.logger.warn('coach_ai_unavailable', {
        errorCode:
          error instanceof AiCoachClientError
            ? error.code
            : error instanceof Error &&
                error.message === 'The AI coach returned unsafe text.'
              ? 'AI_COACH_UNSAFE_OUTPUT'
              : 'AI_COACH_RESPONSE_REJECTED',
      })
      result = this.unavailableResponse(
        error instanceof AiCoachClientError &&
          error.code === 'AI_COACH_RATE_LIMITED',
      )
    }
    if (result.fallback) {
      const message = CoachMessageSchema.parse({
        id: randomUUID(),
        role: 'assistant',
        content: result.answer,
        evidence: [],
        proposals: [],
        fallback: true,
        createdAt: this.now().toISOString(),
      })
      const savedAssistant = await this.options.repository.appendMessage(
        userId,
        conversationId,
        message,
      )
      if (savedAssistant === null) throw new CoachConversationNotFoundError()
      await this.options.repository.updateSummary(
        userId,
        conversationId,
        this.summaryForConversation(
          [...conversation.messages, userMessage],
          message,
        ),
      )
      return CoachResponseSchema.parse({
        message: savedAssistant,
        roadmap: context.roadmap,
      })
    }
    const savedAnswer = sanitizeAssistantAnswer(result.answer)
    const baseRichContent = coachRichContentForContext(
      input.content,
      context,
      this.now(),
      result.presentation,
    )
    const seenCitationIds = new Set(
      baseRichContent.citations.map((citation) => citation.id),
    )
    const safeModelCitations = (result.citations ?? []).filter((citation) => {
      if (!safePublicCitation(citation) || seenCitationIds.has(citation.id)) {
        return false
      }
      seenCitationIds.add(citation.id)
      return true
    })
    const selectedWebProblemIds = new Set(
      /\b(problem|problems|question|questions|practice|next|recommend|suggest)\b/i.test(
        input.content,
      )
        ? (result.presentation?.webProblemCitationIds ?? [])
        : [],
    )
    const selectedWebProblems = safeModelCitations.filter(
      (citation) =>
        citation.source === 'web' &&
        citation.url !== undefined &&
        selectedWebProblemIds.has(citation.id),
    )
    const orderedModelCitations = [
      ...selectedWebProblems,
      ...safeModelCitations.filter(
        (citation) => !selectedWebProblemIds.has(citation.id),
      ),
    ]
    const finalCitations = [
      ...baseRichContent.citations,
      ...orderedModelCitations,
    ].slice(0, 8)
    const includedCitationIds = new Set(
      finalCitations.map((citation) => citation.id),
    )
    const includedWebProblems = selectedWebProblems.filter((citation) =>
      includedCitationIds.has(citation.id),
    )
    const webProblemBlock: CoachRichContent['blocks'] =
      includedWebProblems.length === 0
        ? []
        : [
            {
              type: 'web_problem_list',
              title: 'Problems found for this question',
              reason:
                'Discovered with public web grounding and linked through verified search-source metadata.',
              problems: includedWebProblems.map((citation) => ({
                citationId: citation.id,
                title: citation.title,
                url: citation.url as string,
                ...(citation.publisher === undefined
                  ? {}
                  : { publisher: citation.publisher }),
              })),
            },
          ]
    const richContent = CoachRichContentSchema.parse({
      ...baseRichContent,
      blocks: [...webProblemBlock, ...baseRichContent.blocks].slice(0, 8),
      citations: finalCitations,
    })
    const message = CoachMessageSchema.parse({
      id: randomUUID(),
      role: 'assistant',
      content: savedAnswer || 'The coach returned transient-only content.',
      evidence: result.evidence,
      proposals: result.proposals,
      richContent,
      ...(result.fallback ? { fallback: true } : {}),
      createdAt: this.now().toISOString(),
    })
    const savedAssistant = await this.options.repository.appendMessage(
      userId,
      conversationId,
      message,
    )
    if (savedAssistant === null) throw new CoachConversationNotFoundError()
    for (const proposal of message.proposals) {
      await this.options.repository.saveProposal(
        userId,
        conversationId,
        proposal,
      )
    }
    await this.options.repository.updateSummary(
      userId,
      conversationId,
      this.summaryForConversation(
        [...conversation.messages, userMessage],
        message,
      ),
    )
    if (this.options.memoryGenerationEnabled !== false) {
      try {
        await this.options.progressRepository.enqueueJob({
          authUserId: userId,
          jobType: 'memory_generation',
          evidenceType: 'coach_conversation',
          evidenceId: conversationId,
          idempotencyKey: `memory:coach_conversation:${conversationId}:${savedAssistant.id}`,
        })
      } catch {
        this.options.logger.warn('coach_conversation_memory_enqueue_failed', {
          errorCode: 'OUTBOX_UNAVAILABLE',
        })
      }
    }
    return CoachResponseSchema.parse({
      message: savedAssistant,
      roadmap: context.roadmap,
    })
  }

  // A request that belongs to a dedicated section gets a deterministic pointer
  // to it. No model call, provider history or memory retrieval is needed.
  private async respondWithFeatureRedirect(
    userId: string,
    conversationId: string,
    previousMessages: readonly CoachMessage[],
    userMessage: CoachMessage,
    route: CoachFeatureRoute,
  ): Promise<CoachResponse> {
    const storedRoadmap = await this.options.repository
      .getRoadmap(userId)
      .catch(() => null)
    const roadmap =
      storedRoadmap === null
        ? await this.getRoadmap(userId)
        : this.withRefreshHint(storedRoadmap)
    const now = this.now().toISOString()
    const redirect = coachFeatureRedirect(route)
    const message = CoachMessageSchema.parse({
      id: randomUUID(),
      role: 'assistant',
      content: redirect.answer,
      evidence: [],
      proposals: [],
      richContent: CoachRichContentSchema.parse({
        version: 'coach-rich-v2',
        blocks: [redirect.block],
        citations: [],
        suggestedQuestions: [],
        generatedAt: now,
        dataAsOf: roadmap.generatedAt,
        completeness: roadmap.dataCompleteness,
        stale: roadmap.dataCompleteness !== 'complete',
      }),
      createdAt: now,
    })
    const savedAssistant = await this.options.repository.appendMessage(
      userId,
      conversationId,
      message,
    )
    if (savedAssistant === null) throw new CoachConversationNotFoundError()
    await this.options.repository.updateSummary(
      userId,
      conversationId,
      this.summaryForConversation([...previousMessages, userMessage], message),
    )
    return CoachResponseSchema.parse({ message: savedAssistant, roadmap })
  }

  // Greetings and thanks get one quick reply from a light context: the stored
  // plan's focus names and the last few turns. No roadmap rebuild, provider
  // history, memory retrieval, or data-backed claims.
  private async respondToSmallTalk(
    userId: string,
    conversationId: string,
    previousMessages: readonly CoachMessage[],
    userMessage: CoachMessage,
    question: string,
  ): Promise<CoachResponse> {
    const [profile, storedRoadmap] = await Promise.all([
      this.options.learnerProfileRepository.findByAuthUserId(userId),
      this.options.repository.getRoadmap(userId).catch(() => null),
    ])
    const roadmap =
      storedRoadmap === null
        ? await this.getRoadmap(userId)
        : this.withRefreshHint(storedRoadmap)
    const excludedTopics = [
      ...new Set([
        ...extractCoachTopicExclusions(
          [profile?.recommendationPreference, profile?.additionalConsiderations]
            .filter((value): value is string => value !== undefined)
            .join('\n'),
        ),
        ...roadmap.topics
          .filter((topic) => topic.manualStatus === 'skip_for_now')
          .map((topic) => topic.topic),
      ]),
    ]
    const recentTurns = previousMessages
      .filter((message) => message.fallback !== true)
      .slice(-4)
      .map((message) => ({
        role: message.role,
        content: redactExcludedCoachTopics(
          message.role === 'assistant'
            ? redactCoachLinksAndSecrets(message.content).slice(0, 300)
            : redactCoachContextText(message.content, 300),
          excludedTopics,
        ),
      }))
    const focusTopics = roadmap.topics
      .filter(
        (topic) =>
          topic.lane === 'current_focus' &&
          !excludedTopics.includes(canonicalTopic(topic.topic)),
      )
      .slice(0, 3)
      .map((topic) => topic.name)
    let result: AiCoachResult
    try {
      result = await this.options.aiCoachClient.respond({
        requestId: randomUUID(),
        learnerId: userId,
        conversationId,
        question,
        context: {
          turnKind: 'smalltalk',
          excludedTopics,
          focusTopics,
          recentTurns,
        },
      })
    } catch (error) {
      this.options.logger.warn('coach_ai_unavailable', {
        errorCode:
          error instanceof AiCoachClientError
            ? error.code
            : 'AI_COACH_RESPONSE_REJECTED',
      })
      result = this.unavailableResponse(
        error instanceof AiCoachClientError &&
          error.code === 'AI_COACH_RATE_LIMITED',
      )
    }
    const now = this.now().toISOString()
    const answer = withoutExcludedTopicLines(
      sanitizeAssistantAnswer(result.answer),
      excludedTopics,
    )
    const message = CoachMessageSchema.parse({
      id: randomUUID(),
      role: 'assistant',
      content: answer || 'Hi! How can I help with your practice today?',
      evidence: [],
      proposals: [],
      ...(result.fallback
        ? { fallback: true }
        : {
            richContent: CoachRichContentSchema.parse({
              version: 'coach-rich-v2',
              blocks: [],
              citations: [],
              suggestedQuestions: (
                result.presentation?.suggestedQuestions ?? []
              )
                .map((item) => redactExcludedCoachTopics(item, excludedTopics))
                .slice(0, 4),
              generatedAt: now,
              dataAsOf: roadmap.generatedAt,
              completeness: roadmap.dataCompleteness,
              stale: roadmap.dataCompleteness !== 'complete',
            }),
          }),
      createdAt: now,
    })
    const savedAssistant = await this.options.repository.appendMessage(
      userId,
      conversationId,
      message,
    )
    if (savedAssistant === null) throw new CoachConversationNotFoundError()
    await this.options.repository.updateSummary(
      userId,
      conversationId,
      this.summaryForConversation([...previousMessages, userMessage], message),
    )
    return CoachResponseSchema.parse({ message: savedAssistant, roadmap })
  }

  // Platform problem links the learner pasted, read through the provider
  // adapters within a short budget. Unresolvable links are left for the AI
  // service's own public page reader.
  private async resolveLinkedProblems(
    urls: readonly string[],
  ): Promise<LinkedProblem[]> {
    const read = this.options.problemContent
    if (read === undefined || urls.length === 0) return []
    const references = urls.flatMap((url) => {
      const reference = providerProblemFromUrl(url)
      return reference === null ? [] : [reference]
    })
    if (references.length === 0) return []
    const leetcodeCatalog = references.some(
      (reference) => reference.leetcodeSlug !== undefined,
    )
      ? await Promise.all(
          this.options.providers
            .filter((provider) => provider.key === 'leetcode')
            .map((provider) =>
              provider.search({}).then(
                (result) => result.problems,
                () => [],
              ),
            ),
        ).then((lists) => lists.flat())
      : []
    const results = await Promise.all(
      references.map(async (reference) => {
        const externalId =
          reference.externalId ??
          (reference.leetcodeSlug === undefined
            ? undefined
            : leetcodeIdForSlug(reference.leetcodeSlug, leetcodeCatalog))
        if (externalId === undefined) return null
        try {
          const content = await withinBudget(
            read(reference.provider, externalId),
            LINKED_PROBLEM_BUDGET_MS,
          )
          return content === null ? null : linkedProblemFromContent(content)
        } catch {
          this.options.logger.warn('coach_linked_problem_unavailable', {
            provider: reference.provider,
          })
          return null
        }
      }),
    )
    return results.filter((item): item is LinkedProblem => item !== null)
  }

  async confirmProposal(userId: string, proposalId: string) {
    const key = `${userId}:${proposalId}`
    const inFlight = this.proposalConfirmations.get(key)
    if (inFlight !== undefined) return inFlight
    const pending = this.confirmProposalOnce(userId, proposalId).finally(() => {
      this.proposalConfirmations.delete(key)
    })
    this.proposalConfirmations.set(key, pending)
    return pending
  }

  private async confirmProposalOnce(userId: string, proposalId: string) {
    const stored = await this.options.repository.getProposal(userId, proposalId)
    if (stored === null) throw new CoachProposalNotFoundError()
    if (stored.proposal.status === 'confirmed') return stored.proposal
    if (stored.proposal.status !== 'proposed')
      throw new CoachProposalStateError()
    const consent = await this.options.progressRepository.getConsent(userId)
    if (
      consent?.enabled !== true ||
      consent.policyVersion !== COACH_POLICY_VERSION
    ) {
      throw new CoachConsentRequiredError()
    }
    const proposal = stored.proposal
    if (proposal.problem !== undefined) {
      const problemKey = identity(
        proposal.problem.provider,
        proposal.problem.externalId,
      )
      if (!(await this.isKnownProblem(userId, problemKey))) {
        throw new CoachProposalStateError()
      }
    }
    if (
      proposal.actionType === 'set_topic_status' &&
      proposal.topic !== undefined &&
      proposal.topicStatus !== undefined
    ) {
      await this.setTopicStatus(userId, proposal.topic, proposal.topicStatus)
    } else if (
      proposal.actionType === 'set_problem_status' &&
      proposal.problem !== undefined &&
      proposal.learnerStatus !== undefined
    ) {
      const actions =
        await this.options.problemActionRepository.listByAuthUserId(userId)
      const current = statusByIdentity(actions).get(
        identity(proposal.problem.provider, proposal.problem.externalId),
      )
      if (current !== proposal.learnerStatus) {
        await this.options.problemActionRepository.appendByAuthUserId(userId, {
          ...proposal.problem,
          actionType: 'status_changed',
          learnerStatus: proposal.learnerStatus,
          evidenceSource: 'manual',
          sourceContext: 'coach',
        })
      }
    } else if (
      proposal.actionType === 'bookmark_problem' &&
      proposal.problem !== undefined
    ) {
      await this.options.bookmarkRepository.saveByAuthUserId(
        userId,
        proposal.problem,
      )
    } else if (
      proposal.actionType === 'mark_problem_solved' &&
      proposal.problem !== undefined
    ) {
      const actions =
        await this.options.problemActionRepository.listByAuthUserId(userId)
      const current = statusByIdentity(actions).get(
        identity(proposal.problem.provider, proposal.problem.externalId),
      )
      if (current !== 'solved') {
        await this.options.problemActionRepository.appendByAuthUserId(userId, {
          ...proposal.problem,
          actionType: 'status_changed',
          learnerStatus: 'solved',
          evidenceSource: 'manual',
          sourceContext: 'coach',
        })
      }
    } else if (
      proposal.actionType === 'request_next_hint' &&
      proposal.problem !== undefined
    ) {
      // Confirmation records progression through the hint ladder. The next
      // message asks the model for the next validated hint.
    } else if (
      proposal.actionType === 'save_memory' &&
      proposal.memoryText !== undefined &&
      proposal.memoryCategory !== undefined
    ) {
      const consent = await this.options.progressRepository.getConsent(userId)
      if (
        consent?.enabled !== true ||
        consent.policyVersion !== COACH_POLICY_VERSION
      ) {
        throw new CoachConsentRequiredError()
      }
      const proposeMemory = this.options.aiMemoryClient.proposeMemory
      if (proposeMemory === undefined) throw new CoachMemoryUnavailableError()
      try {
        await proposeMemory(userId, proposal.id, {
          statement: proposal.memoryText,
          category: proposal.memoryCategory,
        })
      } catch {
        throw new CoachMemoryUnavailableError()
      }
    } else {
      throw new CoachProposalStateError()
    }
    const updated = await this.options.repository.updateProposal(
      userId,
      proposalId,
      'confirmed',
    )
    if (updated === null) throw new CoachProposalNotFoundError()
    return updated
  }

  // A proposal may be confirmed after the roadmap has moved on, so validity
  // is "a real problem AlgoMemtor knows about", not "still suggested".
  private async isKnownProblem(userId: string, problemKey: string) {
    const roadmap = await this.getRoadmap(userId)
    if (
      roadmap.topics.some((topic) =>
        topic.suggestions.some(
          (suggestion) =>
            identity(
              suggestion.problem.provider,
              suggestion.problem.externalId,
            ) === problemKey,
        ),
      )
    ) {
      return true
    }
    const catalogs = await Promise.allSettled(
      this.options.providers.map((provider) => provider.search({})),
    )
    if (
      catalogs.some(
        (result) =>
          result.status === 'fulfilled' &&
          result.value.problems.some(
            (problem) =>
              identity(problem.provider, problem.externalId) === problemKey,
          ),
      )
    ) {
      return true
    }
    const [submissions, solved] = await Promise.all([
      this.options.providerDataRepository
        .listSubmissions(userId)
        .catch(() => []),
      this.options.providerDataRepository
        .listSolvedProblems(userId)
        .catch(() => []),
    ])
    return [...submissions, ...solved].some(
      (record) => identity(record.provider, record.externalId) === problemKey,
    )
  }

  private summaryForConversation(
    messages: readonly CoachMessage[],
    assistant: CoachMessage,
  ) {
    const recent = [...messages, assistant]
      .slice(-6)
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n')
    return recent.slice(-1_000)
  }

  private sanitizeAiResult(
    result: AiCoachResult,
    context: CoachContextSnapshot,
    options: {
      allowMemoryProposals: boolean
      allowedUrls?: ReadonlySet<string>
    } = { allowMemoryProposals: true },
  ): AiCoachResult {
    const redactedEvidence = result.evidence.map((item) => ({
      ...item,
      label: redactExcludedCoachTopics(item.label, context.excludedTopics),
      detail: redactExcludedCoachTopics(item.detail, context.excludedTopics),
    }))
    const proposalsWithRedactedText = result.proposals.map((proposal) => ({
      ...proposal,
      label: redactExcludedCoachTopics(proposal.label, context.excludedTopics),
      reason: redactExcludedCoachTopics(
        proposal.reason,
        context.excludedTopics,
      ),
      ...(proposal.memoryText === undefined
        ? {}
        : {
            memoryText: redactExcludedCoachTopics(
              proposal.memoryText,
              context.excludedTopics,
            ),
          }),
    }))
    const citations = (result.citations ?? []).map((citation) => ({
      ...citation,
      title: redactExcludedCoachTopics(citation.title, context.excludedTopics),
      ...(citation.detail === undefined
        ? {}
        : {
            detail: redactExcludedCoachTopics(
              citation.detail,
              context.excludedTopics,
            ),
          }),
      ...(citation.publisher === undefined
        ? {}
        : {
            publisher: redactExcludedCoachTopics(
              citation.publisher,
              context.excludedTopics,
            ),
          }),
    }))
    const presentation =
      result.presentation === undefined
        ? undefined
        : {
            ...result.presentation,
            suggestedQuestions: result.presentation.suggestedQuestions.map(
              (question) =>
                redactExcludedCoachTopics(question, context.excludedTopics),
            ),
          }
    const redactedResult: AiCoachResult = {
      ...result,
      answer: withoutExcludedTopicLines(result.answer, context.excludedTopics),
      evidence: redactedEvidence,
      proposals: proposalsWithRedactedText,
      citations,
      ...(presentation === undefined ? {} : { presentation }),
    }
    // Links and secrets are redacted field by field. An unsafe fragment in
    // one evidence item or proposal drops only that item instead of turning
    // the entire turn into "Coach is unavailable".
    const cleanText = (value: string) => omitGeneratedCodeAndProblemText(value)
    const safeEvidenceItems = redactedEvidence
      .map((item) => ({
        ...item,
        label: cleanText(item.label).slice(0, 160),
        detail: cleanText(item.detail).slice(0, 500),
      }))
      .filter(
        (item) =>
          item.label.length > 0 &&
          item.detail.length > 0 &&
          isSafeCoachText(item.label) &&
          isSafeCoachText(item.detail),
      )
    const safeProposalItems = proposalsWithRedactedText.filter(
      (item) =>
        isSafeCoachText(item.label) &&
        isSafeCoachText(item.reason) &&
        (item.memoryText === undefined || isSafeCoachText(item.memoryText)),
    )
    const safeCitations = citations.filter(
      (citation) =>
        isSafeCoachText(citation.title) &&
        (citation.detail === undefined || isSafeCoachText(citation.detail)) &&
        (citation.publisher === undefined ||
          isSafeCoachText(citation.publisher)),
    )
    const safePresentation =
      presentation === undefined
        ? undefined
        : {
            ...presentation,
            suggestedQuestions: presentation.suggestedQuestions
              .map((question) => redactCoachLinksAndSecrets(question))
              .filter(
                (question) =>
                  isSafeCoachText(question) && !question.includes('removed]'),
              ),
          }
    const safeAnswer = sanitizeAssistantAnswer(
      redactedResult.answer,
      options.allowedUrls,
    )
    if (safeAnswer.length === 0) {
      throw new Error('The AI coach returned an empty answer.')
    }
    if (
      safeEvidenceItems.length !== redactedEvidence.length ||
      safeProposalItems.length !== proposalsWithRedactedText.length ||
      safeCitations.length !== citations.length
    ) {
      this.options.logger.warn('coach_unsafe_output_items_dropped', {
        errorCode: 'AI_COACH_UNSAFE_OUTPUT',
      })
    }
    // Actions may target trusted catalog problems (roadmap and practice pool)
    // or problems already present in the learner's own history.
    const allowedProblems = new Set([
      ...context.roadmap.topics.flatMap((topic) =>
        topic.suggestions.map((suggestion) =>
          identity(suggestion.problem.provider, suggestion.problem.externalId),
        ),
      ),
      ...(context.practiceProblems?.keys() ?? []),
      ...(context.workspace?.solved.map((problem) => problem.id) ?? []),
      ...(context.workspace?.attempted.map((problem) => problem.id) ?? []),
    ])
    const proposals = safeProposalItems.flatMap((proposal) => {
      if (proposal.actionType === 'set_topic_status') {
        const topic =
          proposal.topic === undefined
            ? undefined
            : canonicalTopic(proposal.topic)
        return topic !== undefined &&
          definitionBySlug.has(topic) &&
          !context.excludedTopics.includes(topic) &&
          proposal.topicStatus !== undefined
          ? [{ ...proposal, topic }]
          : []
      }
      if (
        proposal.actionType === 'set_problem_status' ||
        proposal.actionType === 'bookmark_problem' ||
        proposal.actionType === 'request_next_hint' ||
        proposal.actionType === 'mark_problem_solved'
      ) {
        return proposal.problem !== undefined &&
          allowedProblems.has(
            identity(proposal.problem.provider, proposal.problem.externalId),
          ) &&
          (proposal.actionType === 'bookmark_problem' ||
            proposal.actionType === 'request_next_hint' ||
            proposal.actionType === 'mark_problem_solved' ||
            proposal.learnerStatus !== undefined)
          ? [proposal]
          : []
      }
      if (proposal.actionType === 'save_memory') {
        return options.allowMemoryProposals &&
          proposal.memoryText !== undefined &&
          proposal.memoryCategory !== undefined &&
          !/[`<>]/.test(proposal.memoryText) &&
          omitCodeAndProblemText(proposal.memoryText) === proposal.memoryText
          ? [proposal]
          : []
      }
      return []
    })
    if (proposals.length !== result.proposals.length) {
      this.options.logger.warn('coach_invalid_proposals_dropped', {
        dropped: result.proposals.length - proposals.length,
      })
    }
    const safeEvidence =
      safeEvidenceItems.length > 0
        ? safeEvidenceItems
        : [
            fallbackEvidence(
              'roadmap',
              `Roadmap version ${context.roadmap.version} uses ${TOPIC_ASSESSMENT_VERSION}.`,
              context.dataCompleteness,
              context.roadmap.staleProviders.length > 0,
            ),
          ]
    return {
      ...redactedResult,
      answer: safeAnswer,
      citations: safeCitations,
      ...(safePresentation === undefined
        ? {}
        : { presentation: safePresentation }),
      evidence: safeEvidence,
      proposals: proposals.map((proposal) => ({
        ...proposal,
        // The AI service may only create new proposals.  Never trust a model
        // response that claims an action was already confirmed or rejected;
        // confirmation is an owner-authenticated core-service transition.
        status: 'proposed' as const,
        label: cleanText(proposal.label).slice(0, 160) || 'Suggested action',
        reason:
          cleanText(proposal.reason).slice(0, 500) ||
          'Suggested by your coach.',
      })),
    }
  }

  private async buildContext(
    userId: string,
    conversationId: string,
    query?: string,
  ): Promise<CoachContextSnapshot> {
    let contextDataFailed = false
    const startedAt = Date.now()
    // Started first and awaited with the rest: the digest read is independent
    // of every other lookup below.
    const activityDigestPromise =
      this.options.activityDigest?.(userId).catch(() => null) ??
      Promise.resolve(null)
    const safeList = <T>(value: Promise<T[]>) =>
      value.catch(() => {
        contextDataFailed = true
        return [] as T[]
      })
    const [
      profile,
      roadmap,
      roadmapRevisions,
      analytics,
      submissions,
      solved,
      ratings,
      contests,
      bookmarks,
      recommendationFeedback,
      actions,
      reflections,
      timers,
      providerProfiles,
      memories,
      conversation,
      recommendationBatches,
    ] = await Promise.all([
      this.options.learnerProfileRepository.findByAuthUserId(userId),
      this.getRoadmap(userId),
      safeList(
        this.options.repository.listRoadmapRevisions?.(userId) ??
          Promise.resolve([]),
      ),
      this.options.progressService.analytics(userId, 30).catch(() => {
        contextDataFailed = true
        return null
      }),
      safeList(this.options.providerDataRepository.listSubmissions(userId)),
      safeList(this.options.providerDataRepository.listSolvedProblems(userId)),
      safeList(this.options.providerDataRepository.listRatingChanges(userId)),
      safeList(
        this.options.providerDataRepository.listContestParticipations(userId),
      ),
      safeList(this.options.bookmarkRepository.listByAuthUserId(userId)),
      safeList(
        this.options.recommendationRepository?.listFeedbackByAuthUserId(
          userId,
        ) ?? Promise.resolve([]),
      ),
      safeList(this.options.problemActionRepository.listByAuthUserId(userId)),
      safeList(this.options.progressRepository.listReflections(userId)),
      safeList(this.options.progressRepository.listTimerSessions(userId)),
      safeList(
        this.options.providerProfileRepository?.findLatestByAuthUserId(
          userId,
        ) ?? Promise.resolve([]),
      ),
      (query === undefined ||
      this.options.aiMemoryClient.retrieveMemories === undefined
        ? this.options.aiMemoryClient.listMemories(userId)
        : // Semantic retrieval embeds the question with a remote model. When
          // that is slow, the stored memory list keeps the turn moving.
          withinBudget(
            this.options.aiMemoryClient.retrieveMemories(
              userId,
              redactCoachContextText(query, 500),
              5,
            ),
            MEMORY_RETRIEVAL_BUDGET_MS,
          ).catch(() => this.options.aiMemoryClient.listMemories(userId))
      ).catch(() => {
        contextDataFailed = true
        return []
      }),
      this.options.repository.getConversation(userId, conversationId),
      safeList(
        this.options.recommendationRepository?.listBatchesByAuthUserId(
          userId,
        ) ?? Promise.resolve([]),
      ),
    ])
    const [activityDigest, catalogSettled] = await Promise.all([
      activityDigestPromise,
      Promise.allSettled(
        this.options.providers.map((provider) => provider.search({})),
      ),
    ])
    const excludedTopics = [
      ...new Set([
        ...extractCoachTopicExclusions(
          [profile?.recommendationPreference, profile?.additionalConsiderations]
            .filter((value): value is string => value !== undefined)
            .join('\n'),
        ),
        ...roadmap.topics
          .filter((topic) => topic.manualStatus === 'skip_for_now')
          .map((topic) => topic.topic),
      ]),
    ]
    const timezone = profile?.timezone ?? 'UTC'
    // The newest user message is the current question (sent separately), and
    // failed "coach unavailable" turns carry no information for the model.
    const priorMessages = (conversation?.messages ?? []).filter(
      (message) => message.fallback !== true,
    )
    const lastMessage = priorMessages.at(-1)
    const historyMessages =
      lastMessage?.role === 'user' ? priorMessages.slice(0, -1) : priorMessages
    const recentTurns = historyMessages.slice(-12).map((message) => ({
      role: message.role,
      content: redactExcludedCoachTopics(
        message.role === 'assistant'
          ? redactCoachLinksAndSecrets(message.content).slice(0, 4_000)
          : redactCoachContextText(message.content, 2_000),
        excludedTopics,
      ),
    }))
    const statuses = statusByIdentity(actions)
    const manualSolvedAt = new Map<string, Date>()
    for (const action of actions) {
      if (
        action.actionType !== 'status_changed' ||
        action.learnerStatus !== 'solved' ||
        action.evidenceSource !== 'manual'
      ) {
        continue
      }
      const key = identity(action.provider, action.externalId)
      const previous = manualSolvedAt.get(key)
      if (previous === undefined || action.occurredAt > previous) {
        manualSolvedAt.set(key, action.occurredAt)
      }
    }
    let workspaceResult: ReturnType<typeof buildCoachWorkspace> | undefined
    try {
      workspaceResult = buildCoachWorkspace({
        now: this.now(),
        timezone,
        providerProfiles,
        solved,
        submissions,
        ratings,
        contests,
        catalog: catalogSettled.flatMap((result) =>
          result.status === 'fulfilled' ? result.value.problems : [],
        ),
        roadmap,
        statuses,
        manualSolvedAt,
        dismissed: dismissalByIdentity(actions),
        bookmarks,
        excludedTopics,
        canonicalTopic,
        ...(profile?.difficultyComfort === undefined
          ? {}
          : { difficultyComfort: profile.difficultyComfort }),
      })
    } catch {
      contextDataFailed = true
      this.options.logger.warn('coach_workspace_build_failed', {
        errorCode: 'COACH_WORKSPACE_UNAVAILABLE',
      })
    }
    const activityTrends = coachActivityTrends(
      actions,
      submissions,
      solved,
      timezone,
      this.now(),
    )
    const momentum = coachMomentum(activityTrends)
    this.options.logger.info('coach_context_built', {
      durationMs: Date.now() - startedAt,
      submissions: submissions.length,
      solved: solved.length,
    })
    const roadmapTransitions = roadmapRevisions
      .slice()
      .sort((left, right) => right.version - left.version)
      .slice(0, 8)
      .map((revision, index, revisions) => {
        const previous = revisions[index + 1]
        const changedTopics = revision.topics
          .filter((topic) => {
            const prior = previous?.topics.find(
              (candidate) => candidate.topic === topic.topic,
            )
            return (
              prior === undefined ||
              prior.lane !== topic.lane ||
              prior.assessment !== topic.assessment ||
              prior.manualStatus !== topic.manualStatus
            )
          })
          .map((topic) => topic.name)
          .filter((topic) => !excludedTopics.includes(canonicalTopic(topic)))
        return {
          version: revision.version,
          generatedAt: revision.generatedAt,
          changedTopics,
        }
      })
    const catalogByKey = new Map(
      catalogSettled.flatMap((result) =>
        result.status === 'fulfilled'
          ? result.value.problems.map(
              (problem) =>
                [
                  identity(problem.provider, problem.externalId),
                  problem,
                ] as const,
            )
          : [],
      ),
    )
    const currentRecommendations = (recommendationBatches[0]?.items ?? [])
      .slice(0, 10)
      .map((item) => {
        const problem = catalogByKey.get(
          identity(item.provider, item.externalId),
        )
        return {
          position: item.position,
          provider: item.provider,
          externalId: item.externalId,
          ...(problem === undefined ? {} : { title: problem.title }),
          ...(typeof problem?.providerDifficulty === 'number'
            ? { rating: problem.providerDifficulty }
            : {}),
          reason: item.reason.slice(0, 240),
        }
      })
    return {
      learnerId: userId,
      excludedTopics,
      ...(currentRecommendations.length === 0
        ? {}
        : { currentRecommendations }),
      profile: safeLearnerProfile(profile, excludedTopics),
      roadmap,
      roadmapTransitions,
      analytics,
      providerProfiles: providerProfiles.slice(0, 8).map((providerProfile) => ({
        provider: providerProfile.provider,
        ...(providerProfile.rating === undefined
          ? {}
          : { rating: providerProfile.rating }),
        ...(providerProfile.solvedCount === undefined
          ? {}
          : { solvedCount: providerProfile.solvedCount }),
        ...(providerProfile.acceptanceRate === undefined
          ? {}
          : { acceptanceRate: providerProfile.acceptanceRate }),
        topicCounts: Object.fromEntries(
          Object.entries(providerProfile.topicCounts).filter(
            ([topic]) => !excludedTopics.includes(canonicalTopic(topic)),
          ),
        ),
        completeness: providerProfile.completeness,
        provenance: {
          completeness: providerProfile.provenance.completeness,
          extractionStrategy: providerProfile.provenance.extractionStrategy,
          fetchedAt: providerProfile.provenance.fetchedAt,
          stale: providerProfile.provenance.stale,
        },
      })),
      memories: memories
        .filter((memory) => memory.status === 'active')
        .slice(0, 5)
        .map(({ category, statement, confidence }) => ({
          category,
          statement: redactExcludedCoachTopics(
            redactCoachContextText(statement, 500),
            excludedTopics,
          ),
          confidence,
        })),
      recentSubmissions: submissions
        .slice()
        .sort((left, right) =>
          descendingIsoDate(left.occurredAt, right.occurredAt),
        )
        .slice(0, 50)
        .map(
          ({
            provider,
            externalId,
            verdict,
            occurredAt,
            isAccepted,
            problemTitle,
            language,
          }) => ({
            provider,
            externalId,
            ...(problemTitle === undefined ? {} : { problemTitle }),
            verdict,
            ...(language === undefined ? {} : { language }),
            occurredAt,
            isAccepted,
          }),
        ),
      recentSolved: solved
        .slice()
        .sort((left, right) =>
          descendingIsoDate(
            left.occurredAt ?? left.lastObservedAt,
            right.occurredAt ?? right.lastObservedAt,
          ),
        )
        .slice(0, 50)
        .map(({ provider, externalId, topics, providerTags, occurredAt }) => ({
          provider,
          externalId,
          topics: (topics ?? []).filter(
            (topic) => !excludedTopics.includes(canonicalTopic(topic)),
          ),
          providerTags: (providerTags ?? []).filter(
            (topic) => !excludedTopics.includes(canonicalTopic(topic)),
          ),
          occurredAt,
        })),
      recentRatings: ratings
        .slice()
        .sort((left, right) =>
          descendingIsoDate(left.occurredAt, right.occurredAt),
        )
        .slice(0, 20)
        .map(
          ({
            provider,
            occurredAt,
            oldRating,
            newRating,
            delta,
            contestName,
          }) => ({
            provider,
            ...(contestName === undefined ? {} : { contestName }),
            occurredAt,
            oldRating,
            newRating,
            delta,
          }),
        ),
      recentContests: contests
        .slice()
        .sort((left, right) =>
          descendingIsoDate(left.attendedAt, right.attendedAt),
        )
        .slice(0, 20)
        .map(
          ({
            provider,
            contestId,
            contestName,
            rank,
            score,
            ratingChange,
            attendedAt,
          }) => ({
            provider,
            contestId,
            ...(contestName === undefined ? {} : { contestName }),
            rank,
            score,
            ratingChange,
            attendedAt,
          }),
        ),
      recentProgress: actions
        .filter(
          (action) =>
            action.actionType === 'status_changed' &&
            action.learnerStatus !== undefined,
        )
        .sort(
          (left, right) =>
            right.occurredAt.getTime() - left.occurredAt.getTime(),
        )
        .slice(0, 50)
        .map((action) => ({
          provider: action.provider,
          externalId: action.externalId,
          learnerStatus: action.learnerStatus as LearnerProblemStatus,
          evidenceSource: action.evidenceSource ?? 'manual',
          occurredAt: action.occurredAt.toISOString(),
        })),
      bookmarks: bookmarks
        .slice(0, 50)
        .map(({ provider, externalId }) => ({ provider, externalId })),
      recommendationFeedback: recommendationFeedback
        .slice(0, 20)
        .map((feedback) => ({
          ...(feedback.usefulness === undefined
            ? {}
            : { usefulness: feedback.usefulness }),
          ...(feedback.perceivedDifficulty === undefined
            ? {}
            : { perceivedDifficulty: feedback.perceivedDifficulty }),
          ...(feedback.notes === undefined
            ? {}
            : {
                note: redactExcludedCoachTopics(
                  redactCoachContextText(feedback.notes, 500),
                  excludedTopics,
                ),
              }),
          createdAt: feedback.createdAt.toISOString(),
        })),
      dismissedProblems: currentDismissalRecords(actions)
        .slice(0, 50)
        .map((action) => ({
          provider: action.provider,
          externalId: action.externalId,
          occurredAt: action.occurredAt.toISOString(),
        })),
      reflections: reflections
        .slice(0, 20)
        .map(({ problem, perceivedDifficulty, note, createdAt }) => ({
          provider: problem.provider,
          externalId: problem.externalId,
          perceivedDifficulty,
          ...(note === undefined
            ? {}
            : {
                note: redactExcludedCoachTopics(
                  redactCoachContextText(note, 500),
                  excludedTopics,
                ),
              }),
          createdAt,
        })),
      recentTimers: timers
        .slice()
        .sort((left, right) =>
          descendingIsoDate(left.createdAt, right.createdAt),
        )
        .slice(0, 20)
        .map(({ problem, state, durationSeconds, completedAt, createdAt }) => ({
          problem,
          state,
          durationSeconds,
          ...(completedAt === undefined ? {} : { completedAt }),
          createdAt,
        })),
      activityTrends,
      momentum,
      ...(conversation?.data.summary === undefined
        ? {}
        : {
            conversationSummary: redactCoachContextText(
              redactExcludedCoachTopics(
                conversation.data.summary,
                excludedTopics,
              ),
              1_000,
            ),
          }),
      recentTurns,
      dataCompleteness:
        contextDataFailed && roadmap.dataCompleteness === 'complete'
          ? 'partial'
          : roadmap.dataCompleteness,
      ...(activityDigest === null ? {} : { activityDigest }),
      ...(workspaceResult === undefined
        ? {}
        : {
            profileDigest: workspaceResult.workspace.digest,
            workspace: workspaceResult.workspace,
            practiceProblems: workspaceResult.practiceProblems,
          }),
    }
  }

  private unavailableResponse(rateLimited = false): AiCoachResult {
    return {
      answer: rateLimited
        ? 'Coach has reached its AI usage limit for now. Please try again in a few minutes.'
        : 'Coach is unavailable right now. Please try again later.',
      evidence: [],
      proposals: [],
      fallback: true,
    }
  }

  private async buildRoadmap(userId: string): Promise<ImprovementRoadmap> {
    const now = this.now()
    let evidenceDataFailed = false
    const safeList = <T>(value: Promise<T[]>) =>
      value.catch(() => {
        evidenceDataFailed = true
        return [] as T[]
      })
    const [
      profile,
      actions,
      submissions,
      solvedProblems,
      reflections,
      timers,
      ratings,
      contests,
      catalogSettled,
      profileSnapshots,
    ] = await Promise.all([
      this.options.learnerProfileRepository.findByAuthUserId(userId),
      this.options.problemActionRepository.listByAuthUserId(userId),
      safeList(this.options.providerDataRepository.listSubmissions(userId)),
      safeList(this.options.providerDataRepository.listSolvedProblems(userId)),
      safeList(this.options.progressRepository.listReflections(userId)),
      safeList(this.options.progressRepository.listTimerSessions(userId)),
      safeList(this.options.providerDataRepository.listRatingChanges(userId)),
      safeList(
        this.options.providerDataRepository.listContestParticipations(userId),
      ),
      Promise.allSettled(
        this.options.providers.map((provider) => provider.search({})),
      ),
      safeList(
        this.options.providerProfileRepository?.findLatestByAuthUserId(
          userId,
        ) ?? Promise.resolve([]),
      ),
    ])
    const catalogResults = catalogSettled.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    )
    const catalogFailed = catalogSettled.some(
      (result) => result.status === 'rejected',
    )
    const failedCatalogProviders = catalogSettled.flatMap((result, index) =>
      result.status === 'rejected' &&
      this.options.providers[index] !== undefined
        ? [this.options.providers[index].key]
        : [],
    )
    const previousRoadmap = await this.options.repository.getRoadmap(userId)
    const catalogByIdentity = new Map<string, ExternalProblemSummary>()
    catalogResults.forEach((result) =>
      result.problems.forEach((problem) => {
        const key = identity(problem.provider, problem.externalId)
        if (!catalogByIdentity.has(key)) catalogByIdentity.set(key, problem)
      }),
    )
    const stalePriorProviders = new Set<ProviderKey>(failedCatalogProviders)
    if (catalogResults.length === 0) {
      previousRoadmap?.topics.forEach((topic) =>
        topic.suggestions.forEach((suggestion) =>
          stalePriorProviders.add(suggestion.problem.provider),
        ),
      )
    }
    previousRoadmap?.topics.forEach((topic) =>
      topic.suggestions.forEach((suggestion) => {
        const key = identity(
          suggestion.problem.provider,
          suggestion.problem.externalId,
        )
        if (catalogByIdentity.has(key)) return
        const problem = stalePriorProviders.has(suggestion.problem.provider)
          ? {
              ...suggestion.problem,
              extractionStrategy: 'stale_cache' as const,
              completeness: 'partial' as const,
              stale: true,
            }
          : suggestion.problem
        catalogByIdentity.set(key, problem)
      }),
    )
    const catalog = [...catalogByIdentity.values()]
    const catalogIdentityByCanonicalUrl = new Map<string, string>()
    for (const problem of catalog) {
      const urlKey = `${problem.provider}:${canonicalUrlIdentity(problem.canonicalUrl)}`
      if (!catalogIdentityByCanonicalUrl.has(urlKey)) {
        catalogIdentityByCanonicalUrl.set(
          urlKey,
          identity(problem.provider, problem.externalId),
        )
      }
    }
    const resolveProblemIdentity = (
      provider: ProviderKey,
      externalId: string,
      canonicalUrl?: string,
    ) => {
      const direct = identity(provider, externalId)
      if (catalogByIdentity.has(direct) || canonicalUrl === undefined) {
        return direct
      }
      return (
        catalogIdentityByCanonicalUrl.get(
          `${provider}:${canonicalUrlIdentity(canonicalUrl)}`,
        ) ?? direct
      )
    }
    const statuses = statusByIdentity(actions)
    const manualStatuses =
      await this.options.repository.getTopicStatuses(userId)
    const provenanceCompleteness = (
      completeness: 'complete' | 'partial' | 'unknown',
      stale: boolean,
    ): 'complete' | 'partial' | 'unknown' =>
      stale && completeness === 'complete' ? 'partial' : completeness
    const learnerEvidenceValues = [
      ...submissions.map((submission) =>
        provenanceCompleteness(
          submission.completeness,
          submission.provenance.stale,
        ),
      ),
      ...solvedProblems.map((problem) =>
        provenanceCompleteness(problem.completeness, problem.provenance.stale),
      ),
      ...profileSnapshots.map((snapshot) =>
        provenanceCompleteness(
          snapshot.completeness,
          snapshot.provenance.stale,
        ),
      ),
      ...ratings.map((rating) =>
        provenanceCompleteness(
          rating.provenance.completeness,
          rating.provenance.stale,
        ),
      ),
      ...contests.map((contest) =>
        provenanceCompleteness(
          contest.provenance.completeness,
          contest.provenance.stale,
        ),
      ),
      ...(actions.some((action) => action.actionType === 'status_changed')
        ? (['complete'] as const)
        : []),
      ...(reflections.length > 0 || timers.length > 0
        ? (['complete'] as const)
        : []),
    ]
    const completenessValues = [
      ...learnerEvidenceValues,
      ...catalogResults.flatMap((result) => [
        result.freshness.stale || result.freshness.availability !== 'available'
          ? ('partial' as const)
          : ('complete' as const),
        ...result.problems.map((problem) =>
          problem.stale === true || problem.completeness === 'partial'
            ? ('partial' as const)
            : problem.completeness === 'unknown'
              ? ('unknown' as const)
              : ('complete' as const),
        ),
      ]),
      ...(catalogFailed ? (['partial'] as const) : []),
      ...(stalePriorProviders.size > 0 ? (['partial'] as const) : []),
      ...(evidenceDataFailed ? (['partial'] as const) : []),
    ]
    const dataCompleteness =
      learnerEvidenceValues.length === 0
        ? 'unknown'
        : combinedCompleteness(completenessValues)
    const staleProviders = [
      ...failedCatalogProviders,
      ...catalogResults
        .filter(
          (result) =>
            result.freshness.stale ||
            result.freshness.availability !== 'available',
        )
        .map((result) => result.freshness.provider),
      ...catalog.flatMap((problem) =>
        problem.stale === true ? [problem.provider] : [],
      ),
      ...profileSnapshots
        .filter((snapshot) => snapshot.provenance.stale)
        .map((snapshot) => snapshot.provider),
      ...submissions
        .filter((submission) => submission.provenance.stale)
        .map((submission) => submission.provider),
      ...solvedProblems
        .filter((problem) => problem.provenance.stale)
        .map((problem) => problem.provider),
      ...ratings
        .filter((rating) => rating.provenance.stale)
        .map((rating) => rating.provider),
      ...contests
        .filter((contest) => contest.provenance.stale)
        .map((contest) => contest.provider),
    ]
    const excludedTopics = extractCoachTopicExclusions(
      [profile?.recommendationPreference, profile?.additionalConsiderations]
        .filter((value): value is string => value !== undefined)
        .join('\n'),
    )
    const excludedTopicSet = new Set(excludedTopics)
    const dismissed = dismissalByIdentity(actions)
    const canonicalTopicsByIdentity = new Map<string, Set<string>>()
    const difficultyByIdentity = new Map<
      string,
      ExternalProblemSummary['normalizedDifficulty']
    >()
    const addTopic = (key: string, topic: string) => {
      const canonical = canonicalTopic(topic)
      if (!definitionBySlug.has(canonical)) return
      const topics = canonicalTopicsByIdentity.get(key) ?? new Set<string>()
      topics.add(canonical)
      canonicalTopicsByIdentity.set(key, topics)
    }
    for (const problem of catalog) {
      const key = identity(problem.provider, problem.externalId)
      problem.topics.forEach((topic) => addTopic(key, topic))
      problem.providerTags.forEach((topic) => addTopic(key, topic))
      difficultyByIdentity.set(key, problem.normalizedDifficulty)
    }
    for (const problem of solvedProblems) {
      const key = resolveProblemIdentity(
        problem.provider,
        problem.externalId,
        problem.canonicalUrl,
      )
      problem.topics?.forEach((topic) => addTopic(key, topic))
      problem.providerTags?.forEach((topic) => addTopic(key, topic))
    }
    const problemTopicRecords = new Map<
      string,
      {
        solved: boolean
        attempted: boolean
        difficulty: ExternalProblemSummary['normalizedDifficulty']
        lastAt?: Date
      }
    >()
    for (const problem of catalog) {
      const key = identity(problem.provider, problem.externalId)
      const status = statuses.get(key)
      const solved =
        solvedProblems.some(
          (item) =>
            resolveProblemIdentity(
              item.provider,
              item.externalId,
              item.canonicalUrl,
            ) === key,
        ) || status === 'solved'
      const attempted = solved || status === 'attempted'
      if (solved || attempted) {
        const lastAt = [
          ...actions
            .filter(
              (action) => identity(action.provider, action.externalId) === key,
            )
            .map((action) => action.occurredAt),
          ...solvedProblems
            .filter(
              (item) =>
                resolveProblemIdentity(
                  item.provider,
                  item.externalId,
                  item.canonicalUrl,
                ) === key,
            )
            .map(
              (item) =>
                item.occurredAt ?? item.lastObservedAt ?? item.firstObservedAt,
            )
            .filter((value): value is string => value !== null)
            .map((value) => new Date(value)),
        ].sort((left, right) => right.getTime() - left.getTime())[0]
        problemTopicRecords.set(key, {
          solved,
          attempted,
          difficulty: problem.normalizedDifficulty,
          ...(lastAt === undefined ? {} : { lastAt }),
        })
      }
    }
    for (const solved of solvedProblems) {
      const key = resolveProblemIdentity(
        solved.provider,
        solved.externalId,
        solved.canonicalUrl,
      )
      if (problemTopicRecords.has(key)) continue
      const lastAt = new Date(
        solved.occurredAt ?? solved.lastObservedAt ?? solved.firstObservedAt,
      )
      problemTopicRecords.set(key, {
        solved: true,
        attempted: true,
        difficulty: difficultyByIdentity.get(key),
        lastAt,
      })
    }
    for (const submission of submissions) {
      const key = resolveProblemIdentity(
        submission.provider,
        submission.externalId,
        submission.canonicalUrl,
      )
      if (!canonicalTopicsByIdentity.has(key)) continue
      const existing = problemTopicRecords.get(key)
      const submissionAt =
        submission.occurredAt === undefined
          ? undefined
          : new Date(submission.occurredAt)
      if (existing === undefined) {
        const observedSolved = solvedProblems.some(
          (problem) =>
            resolveProblemIdentity(
              problem.provider,
              problem.externalId,
              problem.canonicalUrl,
            ) === key,
        )
        const status = statuses.get(key)
        problemTopicRecords.set(key, {
          solved: observedSolved || status === 'solved',
          attempted: true,
          difficulty: difficultyByIdentity.get(key),
          ...(submissionAt === undefined ? {} : { lastAt: submissionAt }),
        })
        continue
      }
      const lastAt = [existing.lastAt, submissionAt]
        .filter((value): value is Date => value !== undefined)
        .sort((left, right) => right.getTime() - left.getTime())[0]
      problemTopicRecords.set(key, {
        ...existing,
        attempted: true,
        ...(lastAt === undefined ? {} : { lastAt }),
      })
    }
    const target = targetDifficulty(profile)
    const solvedKeys = new Set(
      solvedProblems.map((problem) =>
        resolveProblemIdentity(
          problem.provider,
          problem.externalId,
          problem.canonicalUrl,
        ),
      ),
    )
    const topicItems = topicDefinitions.map((definition) => {
      const matching = catalog.filter((problem) =>
        (
          canonicalTopicsByIdentity.get(
            identity(problem.provider, problem.externalId),
          ) ?? new Set<string>()
        ).has(definition.slug),
      )
      const matchingKeys = new Set<string>()
      for (const [key, problemTopics] of canonicalTopicsByIdentity) {
        if (problemTopics.has(definition.slug)) matchingKeys.add(key)
      }
      const recentSubmissionCutoff = now.getTime() - 30 * 86_400_000
      const topicSubmissions = submissions.filter((submission) => {
        if (
          !matchingKeys.has(
            resolveProblemIdentity(
              submission.provider,
              submission.externalId,
              submission.canonicalUrl,
            ),
          )
        )
          return false
        if (submission.occurredAt === undefined) return true
        return Date.parse(submission.occurredAt) >= recentSubmissionCutoff
      })
      const records = [...problemTopicRecords.entries()]
        .filter(([key]) => matchingKeys.has(key))
        .map(([, value]) => value)
      const topicReflections = reflections.filter((reflection) =>
        matchingKeys.has(
          resolveProblemIdentity(
            reflection.problem.provider,
            reflection.problem.externalId,
          ),
        ),
      )
      const topicTimers = timers.filter((timer) =>
        matchingKeys.has(
          resolveProblemIdentity(
            timer.problem.provider,
            timer.problem.externalId,
          ),
        ),
      )
      const solved = records.filter((record) => record.solved).length
      const attempted = records.filter((record) => record.attempted).length
      const solvedRecords = records.filter((record) => record.solved)
      const acceptedSubmissions = topicSubmissions.filter(
        (submission) => submission.isAccepted,
      ).length
      const totalSubmissions = topicSubmissions.length
      const success = (solved + 1) / (attempted + 2)
      const breadth = Math.min(solved / 8, 1)
      const challenge =
        solvedRecords.length === 0
          ? 0.5
          : solvedRecords.reduce(
              (sum, record) => sum + targetWeight(record.difficulty, target),
              0,
            ) / solvedRecords.length
      const recentAccuracy =
        totalSubmissions === 0 ? 0.5 : acceptedSubmissions / totalSubmissions
      const latest = records
        .map((record) => record.lastAt)
        .filter((value): value is Date => value !== undefined)
        .concat(
          reflections
            .filter((reflection) =>
              matchingKeys.has(
                resolveProblemIdentity(
                  reflection.problem.provider,
                  reflection.problem.externalId,
                ),
              ),
            )
            .map((reflection) => new Date(reflection.createdAt)),
        )
        .concat(
          timers
            .filter((timer) =>
              matchingKeys.has(
                resolveProblemIdentity(
                  timer.problem.provider,
                  timer.problem.externalId,
                ),
              ),
            )
            .flatMap((timer) => [
              new Date(timer.createdAt),
              ...(timer.completedAt === undefined
                ? []
                : [new Date(timer.completedAt)]),
              ...(timer.pausedAt === undefined
                ? []
                : [new Date(timer.pausedAt)]),
            ]),
        )
        .sort((left, right) => right.getTime() - left.getTime())[0]
      const daysSince = dayDifference(latest, now)
      const recency =
        daysSince === undefined
          ? 0
          : daysSince <= 14
            ? 1
            : daysSince <= 30
              ? 0.75
              : daysSince <= 60
                ? 0.5
                : daysSince <= 90
                  ? 0.25
                  : 0
      const score =
        0.3 * success +
        0.25 * breadth +
        0.2 * challenge +
        0.15 * recentAccuracy +
        0.1 * recency
      const completenessMultiplier =
        dataCompleteness === 'complete'
          ? 1
          : dataCompleteness === 'partial'
            ? 0.7
            : 0.4
      const confidence =
        Math.min(1, records.length / 8) * completenessMultiplier
      const prior = previousRoadmap?.topics.find(
        (topic) => topic.topic === definition.slug,
      )
      const regression =
        prior?.assessment === 'comfortable' &&
        prior.score - score >= 0.15 &&
        (() => {
          const priorUpdatedAt = Date.parse(prior.updatedAt)
          const newEvidence = new Set<string>()
          topicSubmissions.forEach((submission) => {
            if (
              submission.occurredAt !== undefined &&
              Date.parse(submission.occurredAt) > priorUpdatedAt
            ) {
              newEvidence.add(`submission:${submission.eventId}`)
            }
          })
          solvedProblems.forEach((problem) => {
            if (
              matchingKeys.has(
                resolveProblemIdentity(
                  problem.provider,
                  problem.externalId,
                  problem.canonicalUrl,
                ),
              ) &&
              problem.occurredAt !== null &&
              problem.occurredAt !== undefined &&
              Date.parse(problem.occurredAt) > priorUpdatedAt
            ) {
              newEvidence.add(`solve:${problem.provider}:${problem.externalId}`)
            }
          })
          topicReflections.forEach((reflection) => {
            if (Date.parse(reflection.createdAt) > priorUpdatedAt) {
              newEvidence.add(`reflection:${reflection.id}`)
            }
          })
          topicTimers.forEach((timer) => {
            if (Date.parse(timer.createdAt) > priorUpdatedAt) {
              newEvidence.add(`timer:${timer.id}`)
            }
          })
          return newEvidence.size >= 3
        })()
      const assessment =
        prior?.assessment === 'comfortable' &&
        ((daysSince !== undefined && daysSince >= 90) || regression)
          ? ('revisit' as const)
          : records.length < 3 || confidence < 0.35
            ? ('insufficient_evidence' as const)
            : score < 0.5 || (totalSubmissions >= 5 && recentAccuracy < 0.4)
              ? ('needs_practice' as const)
              : score >= 0.75 &&
                  records.length >= 5 &&
                  solvedRecords.filter(
                    (record) => targetWeight(record.difficulty, target) >= 1,
                  ).length >= 2
                ? ('comfortable' as const)
                : ('developing' as const)
      const manualStatus = manualStatuses[definition.slug]
      const timerMinutes = Math.floor(
        topicTimers.reduce((sum, timer) => sum + timer.durationSeconds, 0) / 60,
      )
      const lane =
        manualStatus === 'working_on'
          ? ('current_focus' as const)
          : manualStatus === 'practiced' || manualStatus === 'completed'
            ? ('practiced_comfortable' as const)
            : manualStatus === 'revisit'
              ? ('revisit_later' as const)
              : manualStatus === 'skip_for_now'
                ? ('skipped' as const)
                : assessment === 'needs_practice'
                  ? ('needs_more_practice' as const)
                  : assessment === 'revisit'
                    ? ('revisit_later' as const)
                    : assessment === 'comfortable'
                      ? ('practiced_comfortable' as const)
                      : ('recommended_next' as const)
      const unsolved = matching
        .filter((problem) => {
          if (problem.normalizedDifficulty === undefined) return false
          const key = identity(problem.provider, problem.externalId)
          return (
            !solvedKeys.has(key) &&
            statuses.get(key) !== 'solved' &&
            !dismissed.has(key)
          )
        })
        .sort(
          (left, right) =>
            difficultyWeight(left.normalizedDifficulty) -
              difficultyWeight(right.normalizedDifficulty) ||
            left.externalId.localeCompare(right.externalId),
        )
      const targetDifficultyWeight =
        target === 'hard' ? 1 : target === 'medium' ? 0.67 : 0.33
      const foundation = unsolved.filter(
        (problem) =>
          difficultyWeight(problem.normalizedDifficulty) <
          targetDifficultyWeight,
      )
      const targetProblems = unsolved.filter(
        (problem) =>
          difficultyWeight(problem.normalizedDifficulty) ===
          targetDifficultyWeight,
      )
      const stretch = unsolved.filter(
        (problem) =>
          difficultyWeight(problem.normalizedDifficulty) >
          targetDifficultyWeight,
      )
      const selectedSuggestions = [
        ...foundation
          .slice(0, 2)
          .map((problem) => ({ problem, band: 'foundation' as const })),
        ...targetProblems
          .slice(0, 2)
          .map((problem) => ({ problem, band: 'target' as const })),
        ...stretch
          .slice(0, 1)
          .map((problem) => ({ problem, band: 'stretch' as const })),
      ]
      const previousSuggestions = new Map(
        (prior?.suggestions ?? []).map((suggestion) => [
          suggestion.id,
          suggestion,
        ]),
      )
      const suggestions = (
        manualStatus === 'skip_for_now' ? [] : selectedSuggestions
      ).map(({ problem, band }) => {
        const id = stableUuid(
          `coach-suggestion:${definition.slug}:${problem.provider}:${problem.externalId}`,
        )
        const problemKey = identity(problem.provider, problem.externalId)
        const suggestionStatus = solvedKeys.has(problemKey)
          ? ('solved' as const)
          : ('suggested' as const)
        return {
          id,
          problem,
          reason: `Practises ${definition.name} at a progression step that matches your current evidence.`,
          band,
          status: suggestionStatus,
          createdAt:
            previousSuggestions.get(id)?.createdAt ?? now.toISOString(),
        }
      })
      const evidence = {
        uniqueProblems: records.length,
        solvedProblems: solved,
        attemptedProblems: attempted,
        acceptedSubmissions,
        totalSubmissions,
        contestSignals: contests.length,
        ratingSignals: ratings.length + contests.length,
        reflectionSignals: topicReflections.length,
        timerMinutes,
        recentDays: daysSince ?? 0,
        completeness: dataCompleteness,
        stale: staleProviders.length > 0,
        ...(latest === undefined
          ? {}
          : { lastEvidenceAt: latest.toISOString() }),
      }
      const supportingSignals = [
        contests.length === 0
          ? null
          : `${contests.length} contest result${contests.length === 1 ? '' : 's'}`,
        ratings.length === 0
          ? null
          : `${ratings.length} rating movement${ratings.length === 1 ? '' : 's'}`,
        topicReflections.length === 0
          ? null
          : `${topicReflections.length} reflection${topicReflections.length === 1 ? '' : 's'}`,
        timerMinutes === 0
          ? null
          : `${timerMinutes} timed minute${timerMinutes === 1 ? '' : 's'}`,
      ].filter((value): value is string => value !== null)
      const solvedSummary =
        dataCompleteness === 'complete'
          ? `${solved} observed solve${solved === 1 ? '' : 's'}`
          : solved > 0
            ? `at least ${solved} observed solve${solved === 1 ? '' : 's'}`
            : 'no concrete solves observed'
      const reason =
        manualStatus === undefined
          ? `${solvedSummary} and ${attempted} attempted problem${attempted === 1 ? '' : 's'} mapped to ${definition.name}; assessment is ${assessment.replace('_', ' ')}.${supportingSignals.length === 0 ? '' : ` Supporting signals: ${supportingSignals.join(' and ')}.`}`
          : `You marked ${definition.name} as ${manualStatus.replace('_', ' ')}. The evidence assessment is retained for coaching context.${supportingSignals.length === 0 ? '' : ` Supporting signals: ${supportingSignals.join(' and ')}.`}`
      return {
        topic: definition.slug,
        name: definition.name,
        lane,
        ...(manualStatus === undefined ? {} : { manualStatus }),
        assessment,
        score,
        confidence,
        reason,
        evidence,
        prerequisites: [...definition.prerequisites],
        suggestions,
        updatedAt: prior?.updatedAt ?? now.toISOString(),
      } satisfies ImprovementTopic
    })
    const focusTopics =
      profile?.topicPreference.mode === 'selected'
        ? profile.topicPreference.topics
            .map(canonicalTopic)
            .filter((topic) => !excludedTopicSet.has(topic))
        : []
    const candidates = topicItems
      .filter(
        (topic) =>
          !excludedTopicSet.has(topic.topic) &&
          topic.manualStatus === undefined &&
          (focusTopics.includes(topic.topic) ||
            topic.lane === 'needs_more_practice' ||
            topic.lane === 'recommended_next'),
      )
      .sort((left, right) => left.score - right.score)
    const focusCandidates =
      focusTopics.length > 0
        ? candidates.filter((topic) => focusTopics.includes(topic.topic))
        : candidates.filter(
            (topic) =>
              topic.lane === 'recommended_next' ||
              topic.lane === 'needs_more_practice',
          )
    const selectedFocus = new Set(
      focusCandidates.slice(0, 2).map((topic) => topic.topic),
    )
    const roadmapTopics = topicItems
      .filter((topic) => !excludedTopicSet.has(topic.topic))
      .map((topic) => {
        const focused = selectedFocus.has(topic.topic)
        const next = focused
          ? { ...topic, lane: 'current_focus' as const }
          : topic
        // Practice sets are intentionally scoped to the current focus.  A topic
        // can gain a fresh set as soon as the learner moves it into focus.
        return next.lane === 'current_focus'
          ? next
          : { ...next, suggestions: [] }
      })
    return ImprovementRoadmapSchema.parse({
      id: previousRoadmap?.id ?? randomUUID(),
      version: previousRoadmap?.version ?? 1,
      assessmentVersion: TOPIC_ASSESSMENT_VERSION,
      topics: roadmapTopics,
      dataCompleteness,
      staleProviders: [...new Set(staleProviders)],
      generatedAt: now.toISOString(),
    })
  }
}
