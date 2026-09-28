import type { ExternalProblemSummary } from '@algomemtor/shared-contracts'

import type { ProviderProblemQuery } from './problem-provider'

const normalizeSearchText = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase()

export const filterProblems = (
  problems: ExternalProblemSummary[],
  query: ProviderProblemQuery,
) => {
  const normalizedSearch =
    query.search === undefined ? undefined : normalizeSearchText(query.search)

  return problems.filter((problem) => {
    if (
      normalizedSearch !== undefined &&
      ![
        problem.title,
        problem.externalId,
        ...problem.providerTags,
        ...problem.topics,
      ].some((value) => normalizeSearchText(value).includes(normalizedSearch))
    ) {
      return false
    }

    if (
      query.difficulty !== undefined &&
      problem.normalizedDifficulty !== query.difficulty
    ) {
      return false
    }

    if (query.topic !== undefined && !problem.topics.includes(query.topic)) {
      return false
    }

    if (query.status !== undefined && problem.learnerStatus !== query.status) {
      return false
    }

    if (query.minRating !== undefined || query.maxRating !== undefined) {
      const rating = problem.providerDifficulty

      if (
        typeof rating !== 'number' ||
        (query.minRating !== undefined && rating < query.minRating) ||
        (query.maxRating !== undefined && rating > query.maxRating)
      ) {
        return false
      }
    }

    return true
  })
}
