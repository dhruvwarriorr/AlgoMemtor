import {
  RecommendationSteeringDirectivesSchema,
  type ProviderKey,
  type RecommendationSteeringDirectives,
} from '@algomemtor/shared-contracts'

import { CoachTopicDefinitions, canonicalCoachTopic } from './coach-service.js'

// Turns a learner's plain-language recommendation instruction ("no LeetCode,
// more DP around 1600") into deterministic directives. Parsing is local and
// rule-based on purpose: filters the learner asked for must hold even when
// the AI ranker is unavailable, and nothing here can invent a problem.

const providerNames: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
}

const providerPatterns: readonly (readonly [ProviderKey, RegExp])[] = [
  ['codeforces', /\b(?:code\s?forces|cf)\b/g],
  ['codechef', /\b(?:code\s?chef)\b/g],
  ['leetcode', /\b(?:leet\s?code|lc)\b/g],
  ['cses', /\b(?:cses)\b/g],
]

// Catalog topics outside the roadmap's topic list that learners still name.
const extraTopics: readonly {
  slug: string
  name: string
  variants: string[]
}[] = [
  {
    slug: 'constructive-algorithms',
    name: 'Constructive Algorithms',
    variants: ['constructive algorithms', 'constructive'],
  },
  {
    slug: 'data-structures',
    name: 'Data Structures',
    variants: ['data structures', 'data structure', 'ds'],
  },
  {
    slug: 'brute-force',
    name: 'Brute Force',
    variants: ['brute force', 'bruteforce'],
  },
  {
    slug: 'games',
    name: 'Game Theory',
    variants: ['game theory', 'games', 'game'],
  },
  { slug: 'interactive', name: 'Interactive', variants: ['interactive'] },
  {
    slug: 'flows',
    name: 'Flows',
    variants: ['max flow', 'network flow', 'flows', 'flow'],
  },
  {
    slug: 'probabilities',
    name: 'Probability',
    variants: ['probabilities', 'probability', 'expected value'],
  },
  {
    slug: 'divide-and-conquer',
    name: 'Divide and Conquer',
    variants: ['divide and conquer', 'd&c'],
  },
  { slug: 'fft', name: 'FFT', variants: ['fft'] },
  {
    slug: 'matrices',
    name: 'Matrices',
    variants: ['matrices', 'matrix'],
  },
  {
    slug: 'simulation',
    name: 'Simulation',
    variants: ['simulation', 'simulations'],
  },
]

const topicAliases: Readonly<Record<string, string[]>> = {
  'dynamic-programming': ['dp', 'dynamic programming'],
  'advanced-dynamic-programming': [
    'advanced dp',
    'advanced dynamic programming',
    'digit dp',
    'bitmask dp',
  ],
  'binary-search': ['binary search', 'bs'],
  'bfs-and-dfs': ['bfs', 'dfs', 'bfs and dfs', 'graph traversal'],
  graphs: ['graphs', 'graph', 'graph theory'],
  trees: ['trees', 'tree'],
  'segment-trees': ['segment trees', 'segment tree', 'segtree', 'seg tree'],
  'fenwick-trees': ['fenwick trees', 'fenwick tree', 'binary indexed tree'],
  'disjoint-set-union': ['dsu', 'union find', 'disjoint set'],
  'shortest-paths': ['shortest path', 'shortest paths', 'dijkstra'],
  'number-theory': ['number theory', 'nt', 'primes', 'gcd'],
  'prefix-sums': ['prefix sum', 'prefix sums'],
  'two-pointers': ['two pointers', 'two pointer', '2 pointers'],
  'sliding-window': ['sliding window'],
  'bit-manipulation': ['bit manipulation', 'bitmask', 'bitmasks', 'bits'],
  'recursion-and-backtracking': ['recursion', 'backtracking'],
  'heaps-and-priority-queues': ['heap', 'heaps', 'priority queue'],
  'stacks-and-queues': [
    'stack',
    'stacks',
    'queue',
    'queues',
    'monotonic stack',
  ],
  'linked-lists': ['linked list', 'linked lists'],
  hashing: ['hashing', 'hash map', 'hashmap', 'hash table'],
  strings: ['strings', 'string'],
  arrays: ['arrays', 'array'],
  sorting: ['sorting', 'sort'],
  math: ['math', 'maths', 'mathematics'],
  greedy: ['greedy'],
  combinatorics: ['combinatorics', 'counting'],
  geometry: ['geometry'],
  tries: ['trie', 'tries'],
  'topological-sort': ['topological sort', 'toposort', 'topo sort'],
  'minimum-spanning-trees': ['mst', 'minimum spanning tree'],
  implementation: ['implementation'],
}

type TopicVocabulary = { slug: string; name: string; variant: string }

const topicVocabulary: readonly TopicVocabulary[] = [
  ...CoachTopicDefinitions.flatMap((topic) =>
    [
      topic.name.toLowerCase(),
      topic.slug.replace(/-/g, ' '),
      ...(topicAliases[topic.slug] ?? []),
    ].map((variant) => ({ slug: topic.slug, name: topic.name, variant })),
  ),
  ...extraTopics.flatMap((topic) =>
    topic.variants.map((variant) => ({
      slug: topic.slug,
      name: topic.name,
      variant,
    })),
  ),
]
  // Longest phrases first so "segment tree" wins over "tree".
  .sort((left, right) => right.variant.length - left.variant.length)

const topicNames = new Map(
  topicVocabulary.map((entry) => [entry.slug, entry.name]),
)

// Words that turn the entity that follows them into an exclusion.
const negativeCue =
  /\b(?:no|not|dont|don't|do not|never|avoid|avoiding|skip|skipping|without|exclude|excluding|except|stop|remove|hate|dislike|less|fewer|none of|nothing from|instead of|rather than|tired of|enough of|anything but|other than|not interested in|no more)\b/g
// Words that make the entity that follows them wanted again.
const positiveCue =
  /\b(?:only|just|more|want|prefer|focus|focused|focusing|give me|need|like|love|include|practice|practise|add|some|mostly|mainly|exclusively|stick to|switch to)\b/g
const restrictCue = /\b(?:only|just|exclusively|stick to|nothing but)\b/

type Mention = { start: number; end: number }

function cueBefore(clause: string, mention: Mention): 'neg' | 'pos' | null {
  const prefix = clause.slice(0, mention.start)
  let last: { index: number; kind: 'neg' | 'pos' } | null = null
  for (const match of prefix.matchAll(negativeCue)) {
    if (last === null || match.index >= last.index) {
      last = { index: match.index, kind: 'neg' }
    }
  }
  for (const match of prefix.matchAll(positiveCue)) {
    if (last === null || match.index > last.index) {
      // "don't want", "no more", "do not like": a negated positive word.
      const negated =
        /\b(?:dont|don't|do not|does not|doesn't|not|never|no)\s+(?:really\s+)?$/.test(
          prefix.slice(Math.max(0, match.index - 20), match.index),
        )
      last = { index: match.index, kind: negated ? 'neg' : 'pos' }
    }
  }
  // "leetcode is not for me" / "leetcode please no": a trailing negation
  // with nothing positive before the mention.
  if (last === null) {
    const suffix = clause.slice(mention.end)
    if (
      /^\s*(?:problems?|questions?|ones?)?\s*(?:is|are)?\s*(?:not|no)\b/.test(
        suffix,
      )
    ) {
      return 'neg'
    }
    if (/^\s*(?:problems?|questions?)?\s*only\b/.test(suffix)) return 'pos'
  }
  return last?.kind ?? null
}

function restrictsInClause(clause: string, mention: Mention) {
  return (
    restrictCue.test(clause.slice(0, mention.start)) ||
    /^\s*(?:problems?|questions?)?\s*only\b/.test(clause.slice(mention.end))
  )
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function clausesOf(text: string) {
  return normalize(text)
    .split(/[.;!?\n,]+|\bbut\b|\bhowever\b|\balso\b|\bplus\b/)
    .map((clause) => ` ${clause.trim()} `)
    .filter((clause) => clause.trim().length > 0)
}

const clampRating = (value: number) =>
  Math.min(4_000, Math.max(0, Math.round(value)))

function ratingRangeFrom(
  text: string,
  currentBand: { min: number; max: number },
): { min: number; max: number } | undefined {
  const rating = '([1-3][0-9]{3}|[89][0-9]{2})'
  const between = new RegExp(
    `\\b(?:between\\s+)?${rating}\\s*(?:-|to|and|~)\\s*${rating}\\b`,
  ).exec(text)
  if (between?.[1] !== undefined && between[2] !== undefined) {
    const low = Number(between[1])
    const high = Number(between[2])
    return {
      min: clampRating(Math.min(low, high)),
      max: clampRating(Math.max(low, high)),
    }
  }
  const below = new RegExp(
    `\\b(?:below|under|less than|at most|upto|up to|max(?:imum)?|<=?)\\s*(?:rating\\s*)?${rating}\\b`,
  ).exec(text)
  const above = new RegExp(
    `\\b(?:above|over|more than|at least|min(?:imum)?|>=?)\\s*(?:rating\\s*)?${rating}\\b`,
  ).exec(text)
  if (above?.[1] !== undefined && below?.[1] !== undefined) {
    const low = Number(above[1])
    const high = Number(below[1])
    if (low <= high) return { min: clampRating(low), max: clampRating(high) }
  }
  if (below?.[1] !== undefined) {
    const high = Number(below[1])
    return {
      min: clampRating(Math.max(800, high - 400)),
      max: clampRating(high),
    }
  }
  if (above?.[1] !== undefined) {
    const low = Number(above[1])
    return { min: clampRating(low), max: clampRating(low + 400) }
  }
  const around = new RegExp(
    `\\b(?:around|about|near|roughly|approx(?:imately)?|~|rated|rating(?: of)?|level)\\s*${rating}\\b|\\b${rating}\\s*(?:rated|rating|level|ish)\\b|\\b${rating}\\+`,
  ).exec(text)
  const value = around?.[1] ?? around?.[2] ?? around?.[3]
  if (value !== undefined) {
    const center = Number(value)
    if (around?.[3] !== undefined) {
      return { min: clampRating(center), max: clampRating(center + 300) }
    }
    return {
      min: clampRating(center - 100),
      max: clampRating(center + 100),
    }
  }
  // A bare rating ("dp 1600") means problems around that rating.
  const bare =
    /(?<![0-9a-z])(1[0-9]{3}|2[0-9]{3}|3[0-4][0-9]{2}|[89][0-9]{2})(?![0-9a-z])/.exec(
      text,
    )
  if (bare?.[1] !== undefined) {
    const center = Number(bare[1])
    return {
      min: clampRating(center - 100),
      max: clampRating(center + 100),
    }
  }
  if (
    /\b(?:harder|tougher|more difficult|more challenging|too easy|too simple|level up|step up)\b/.test(
      text,
    )
  ) {
    return {
      min: clampRating(currentBand.min + 200),
      max: clampRating(currentBand.max + 200),
    }
  }
  if (
    /\b(?:easier|simpler|too hard|too difficult|too tough|less difficult)\b/.test(
      text,
    )
  ) {
    return {
      min: clampRating(Math.max(800, currentBand.min - 200)),
      max: clampRating(Math.max(900, currentBand.max - 200)),
    }
  }
  return undefined
}

function difficultyFrom(text: string) {
  if (/\btoo (?:easy|simple|hard|difficult)\b/.test(text)) return undefined
  if (
    /\b(?:easy|beginner|basic|simple) (?:problems?|questions?|ones?)\b|\bonly easy\b/.test(
      text,
    )
  ) {
    return 'easy' as const
  }
  if (
    /\b(?:medium|moderate|intermediate) (?:problems?|questions?|ones?|difficulty)\b|\bonly medium\b/.test(
      text,
    )
  ) {
    return 'medium' as const
  }
  if (
    /\b(?:hard|difficult|challenging|tough) (?:problems?|questions?|ones?)\b|\bonly hard\b/.test(
      text,
    )
  ) {
    return 'hard' as const
  }
  return undefined
}

export type SteeringFeedProblem = {
  provider: ProviderKey
  externalId: string
  title: string
}

export type ParsedSteering = {
  directives: RecommendationSteeringDirectives
  applied: string[]
}

export function parseRecommendationSteering(
  text: string,
  options: {
    currentBand: { min: number; max: number }
    feedProblems?: readonly SteeringFeedProblem[]
  },
): ParsedSteering {
  const onlyProviders = new Set<ProviderKey>()
  const preferProviders = new Set<ProviderKey>()
  const excludeProviders = new Set<ProviderKey>()
  const includeTopics = new Set<string>()
  const excludeTopics = new Set<string>()
  let onlyTopics = false
  const excludeProblems = new Map<string, SteeringFeedProblem>()

  for (const clause of clausesOf(text)) {
    for (const [provider, pattern] of providerPatterns) {
      for (const match of clause.matchAll(pattern)) {
        const mention = {
          start: match.index,
          end: match.index + match[0].length,
        }
        const cue = cueBefore(clause, mention)
        // A bare mention ("leetcode 1600") asks for that platform.
        if (cue === 'neg') {
          excludeProviders.add(provider)
          onlyProviders.delete(provider)
          preferProviders.delete(provider)
        } else if (restrictsInClause(clause, mention)) {
          onlyProviders.add(provider)
          excludeProviders.delete(provider)
        } else {
          preferProviders.add(provider)
          excludeProviders.delete(provider)
        }
      }
    }

    // Consume the longest topic phrases first so "segment tree" is not also
    // read as "tree".
    let remaining = clause
    for (const entry of topicVocabulary) {
      const pattern = new RegExp(
        `(?<![a-z0-9])${entry.variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s-]+')}(?![a-z0-9])`,
        'g',
      )
      for (const match of remaining.matchAll(pattern)) {
        const mention = {
          start: match.index,
          end: match.index + match[0].length,
        }
        const cue = cueBefore(remaining, mention)
        const slug = canonicalCoachTopic(entry.slug)
        if (cue === 'neg') {
          excludeTopics.add(slug)
          includeTopics.delete(slug)
        } else {
          includeTopics.add(slug)
          excludeTopics.delete(slug)
          if (restrictsInClause(remaining, mention)) onlyTopics = true
        }
      }
      remaining = remaining.replace(pattern, (value) =>
        ' '.repeat(value.length),
      )
    }

    for (const problem of options.feedProblems ?? []) {
      const title = normalize(problem.title)
      if (title.length < 4) continue
      const index = clause.indexOf(title)
      if (index < 0) continue
      const cue = cueBefore(clause, { start: index, end: index + title.length })
      if (cue !== 'pos') {
        excludeProblems.set(
          `${problem.provider}:${problem.externalId}`,
          problem,
        )
      }
    }
  }

  const normalized = normalize(text)
  const ratingRange = ratingRangeFrom(normalized, options.currentBand)
  const difficulty =
    ratingRange === undefined ? difficultyFrom(normalized) : undefined

  const directives = RecommendationSteeringDirectivesSchema.parse({
    onlyProviders: [...onlyProviders],
    preferProviders: [...preferProviders].filter(
      (provider) => !onlyProviders.has(provider),
    ),
    excludeProviders: [...excludeProviders],
    includeTopics: [...includeTopics].slice(0, 12),
    onlyTopics: onlyTopics && includeTopics.size > 0,
    excludeTopics: [...excludeTopics].slice(0, 24),
    ...(ratingRange === undefined ? {} : { ratingRange }),
    ...(difficulty === undefined ? {} : { difficulty }),
    excludeProblems: [...excludeProblems.values()]
      .slice(0, 10)
      .map((problem) => ({
        provider: problem.provider,
        externalId: problem.externalId,
        title: problem.title.slice(0, 200),
      })),
  })
  return { directives, applied: describeSteering(directives) }
}

const topicName = (slug: string) =>
  topicNames.get(slug) ??
  slug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

const list = (values: readonly string[]) =>
  values.length <= 1
    ? (values[0] ?? '')
    : `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`

export function describeSteering(
  directives: RecommendationSteeringDirectives,
): string[] {
  const applied: string[] = []
  if (directives.onlyProviders.length > 0) {
    applied.push(
      `Only ${list(directives.onlyProviders.map((provider) => providerNames[provider]))} problems`,
    )
  }
  if (directives.excludeProviders.length > 0) {
    applied.push(
      `No ${list(directives.excludeProviders.map((provider) => providerNames[provider]))} problems`,
    )
  }
  if (directives.preferProviders.length > 0) {
    applied.push(
      `More ${list(directives.preferProviders.map((provider) => providerNames[provider]))} problems`,
    )
  }
  if (directives.includeTopics.length > 0) {
    applied.push(
      `${directives.onlyTopics ? 'Only' : 'Focus on'} ${list(directives.includeTopics.map(topicName))}`,
    )
  }
  if (directives.excludeTopics.length > 0) {
    applied.push(`Skip ${list(directives.excludeTopics.map(topicName))}`)
  }
  if (directives.ratingRange !== undefined) {
    applied.push(
      `Rating ${directives.ratingRange.min}–${directives.ratingRange.max}`,
    )
  }
  if (directives.difficulty !== undefined) {
    applied.push(
      `${directives.difficulty.charAt(0).toUpperCase()}${directives.difficulty.slice(1)} difficulty`,
    )
  }
  for (const problem of directives.excludeProblems) {
    applied.push(`Removed “${problem.title}”`)
  }
  return applied.slice(0, 16).map((item) => item.slice(0, 160))
}

export function steeringHasDirectives(
  directives: RecommendationSteeringDirectives,
) {
  return describeSteering(directives).length > 0
}

// Folds the learner's active instructions, oldest first, into one set of
// constraints. A newer instruction overrides an older one on the same
// provider, topic, or difficulty, so "no LeetCode" then "LeetCode is fine
// again" ends with LeetCode allowed.
export type MergedSteering = {
  onlyProviders: ProviderKey[]
  preferProviders: ProviderKey[]
  excludeProviders: ProviderKey[]
  includeTopics: string[]
  onlyTopics: boolean
  excludeTopics: string[]
  ratingRange?: { min: number; max: number }
  difficulty?: 'easy' | 'medium' | 'hard'
  notes: string[]
}

export function mergeSteering(
  entries: readonly {
    text: string
    directives: RecommendationSteeringDirectives
    createdAt: Date
  }[],
): MergedSteering {
  const providerState = new Map<ProviderKey, 'only' | 'prefer' | 'exclude'>()
  const topicState = new Map<string, 'include' | 'exclude'>()
  let onlyTopics = false
  let ratingRange: MergedSteering['ratingRange']
  let difficulty: MergedSteering['difficulty']
  const notes: string[] = []
  const ordered = entries
    .slice()
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
  for (const entry of ordered) {
    const directives = entry.directives
    if (directives.onlyProviders.length > 0) {
      for (const [provider, state] of providerState) {
        if (state === 'only') providerState.delete(provider)
      }
      directives.onlyProviders.forEach((provider) =>
        providerState.set(provider, 'only'),
      )
    }
    directives.preferProviders.forEach((provider) => {
      if (providerState.get(provider) !== 'only') {
        providerState.set(provider, 'prefer')
      }
    })
    directives.excludeProviders.forEach((provider) =>
      providerState.set(provider, 'exclude'),
    )
    if (directives.includeTopics.length > 0) {
      onlyTopics = directives.onlyTopics
    }
    directives.includeTopics.forEach((topic) =>
      topicState.set(topic, 'include'),
    )
    directives.excludeTopics.forEach((topic) =>
      topicState.set(topic, 'exclude'),
    )
    if (directives.ratingRange !== undefined) {
      ratingRange = directives.ratingRange
      difficulty = undefined
    }
    if (directives.difficulty !== undefined) {
      difficulty = directives.difficulty
      ratingRange = undefined
    }
    notes.push(entry.text)
  }
  const byState = <T extends string>(
    state: Map<T, string>,
    value: string,
  ): T[] =>
    [...state.entries()]
      .filter(([, current]) => current === value)
      .map(([key]) => key)
  const includeTopics = byState(topicState, 'include')
  return {
    onlyProviders: byState(providerState, 'only'),
    preferProviders: byState(providerState, 'prefer'),
    excludeProviders: byState(providerState, 'exclude'),
    includeTopics,
    onlyTopics: onlyTopics && includeTopics.length > 0,
    excludeTopics: byState(topicState, 'exclude'),
    ...(ratingRange === undefined ? {} : { ratingRange }),
    ...(difficulty === undefined ? {} : { difficulty }),
    notes: notes.slice(-5),
  }
}

export const EMPTY_STEERING: MergedSteering = {
  onlyProviders: [],
  preferProviders: [],
  excludeProviders: [],
  includeTopics: [],
  onlyTopics: false,
  excludeTopics: [],
  notes: [],
}
