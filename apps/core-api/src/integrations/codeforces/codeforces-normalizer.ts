import type { NormalizedDifficulty } from '@algomemtor/shared-contracts'

import type {
  CodeforcesProblem,
  CodeforcesProblemStatistics,
  CodeforcesProblemsetResult,
} from './codeforces-schemas.js'

export type NormalizedCodeforcesProblem = {
  provider: 'codeforces'
  externalId: string
  contestId?: number
  problemsetName?: string
  index: string
  title: string
  providerDifficulty?: number
  providerTags: string[]
  topics: string[]
  solvedCount?: number
}

const normalizeIndex = (index: string) => index.trim().toUpperCase()

const normalizeProblemsetName = (problemsetName: string) =>
  problemsetName.trim().toLowerCase()

const createProblemKey = (
  problem: Pick<CodeforcesProblem, 'contestId' | 'problemsetName' | 'index'>,
) => {
  const index = normalizeIndex(problem.index)

  if (problem.contestId !== undefined) {
    return `contest:${problem.contestId}:${index}`
  }

  if (problem.problemsetName !== undefined) {
    return `problemset:${normalizeProblemsetName(problem.problemsetName)}:${index}`
  }

  return undefined
}

const createStatisticsKey = (
  statistics: Pick<CodeforcesProblemStatistics, 'contestId' | 'index'>,
) => {
  const index = normalizeIndex(statistics.index)

  return statistics.contestId === undefined
    ? `index:${index}`
    : `contest:${statistics.contestId}:${index}`
}

export const createCodeforcesExternalId = (problem: {
  contestId?: number | undefined
  problemsetName?: string | undefined
  index: string
}) => {
  const index = normalizeIndex(problem.index)

  if (problem.contestId !== undefined) {
    return `${problem.contestId}${index}`
  }

  if (problem.problemsetName !== undefined) {
    return `${normalizeProblemsetName(problem.problemsetName)}:${index}`
  }

  return undefined
}

const unique = (values: string[]) => [...new Set(values)]

export const normalizeCodeforcesTags = (tags: string[]) =>
  unique(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))

const toTopicSlug = (tag: string) =>
  tag
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const codeforcesTopicAliases: Readonly<
  Record<string, string | readonly string[]>
> = {
  'binary-search': 'binary-search',
  bitmasks: 'bit-manipulation',
  'dfs-and-similar': ['graphs', 'bfs-and-dfs'],
  dp: 'dynamic-programming',
  dsu: 'disjoint-set-union',
  'graph-matchings': 'graphs',
  graphs: 'graphs',
  'shortest-paths': ['graphs', 'shortest-paths'],
  'string-suffix-structures': 'strings',
  strings: 'strings',
  trees: 'trees',
  'two-pointers': 'two-pointers',
}

export const normalizeCodeforcesTopics = (tags: string[]) =>
  unique(
    normalizeCodeforcesTags(tags)
      .map(toTopicSlug)
      .filter(Boolean)
      .flatMap((topic) => codeforcesTopicAliases[topic] ?? topic)
      .flatMap((topic) => (Array.isArray(topic) ? topic : [topic])),
  )

export const normalizeCodeforcesDifficulty = (
  rating: number | undefined,
): NormalizedDifficulty | undefined => {
  if (rating === undefined) {
    return undefined
  }

  if (rating <= 1000) {
    return 'easy'
  }

  if (rating <= 1500) {
    return 'medium'
  }

  return 'hard'
}

export const normalizeCodeforcesProblems = (
  result: CodeforcesProblemsetResult,
): NormalizedCodeforcesProblem[] => {
  const statisticsByKey = new Map<string, CodeforcesProblemStatistics>()

  for (const statistics of result.problemStatistics) {
    const key = createStatisticsKey(statistics)

    if (!statisticsByKey.has(key)) {
      statisticsByKey.set(key, statistics)
    }
  }

  return result.problems.flatMap((problem) => {
    if (problem.type !== 'PROGRAMMING') {
      return []
    }

    const externalId = createCodeforcesExternalId(problem)
    const problemKey = createProblemKey(problem)

    if (externalId === undefined || problemKey === undefined) {
      return []
    }

    const index = normalizeIndex(problem.index)
    const fallbackStatisticsKey = `index:${index}`
    const statistics =
      statisticsByKey.get(problemKey) ??
      (problem.contestId === undefined
        ? statisticsByKey.get(fallbackStatisticsKey)
        : undefined)

    return [
      {
        provider: 'codeforces',
        externalId,
        ...(problem.contestId === undefined
          ? {}
          : { contestId: problem.contestId }),
        ...(problem.problemsetName === undefined
          ? {}
          : {
              problemsetName: normalizeProblemsetName(problem.problemsetName),
            }),
        index,
        title: problem.name.trim(),
        ...(problem.rating === undefined
          ? {}
          : { providerDifficulty: problem.rating }),
        providerTags: normalizeCodeforcesTags(problem.tags),
        topics: normalizeCodeforcesTopics(problem.tags),
        ...(statistics === undefined
          ? {}
          : { solvedCount: statistics.solvedCount }),
      },
    ]
  })
}
