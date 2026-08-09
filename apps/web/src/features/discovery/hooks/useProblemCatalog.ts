import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ExternalProblemCatalogQueryParams } from '@algomemtor/shared-contracts'

import { fetchProblemCatalog } from '../api/catalog'

function normalizeQueryKey(query: ExternalProblemCatalogQueryParams) {
  return {
    search: query.search ?? null,
    provider: query.provider ?? null,
    difficulty: query.difficulty ?? null,
    topic: query.topic ?? null,
    status: query.status ?? null,
    minRating: query.minRating ?? null,
    maxRating: query.maxRating ?? null,
    page: query.page,
    pageSize: query.pageSize,
  }
}

export function problemCatalogQueryKey(
  query: ExternalProblemCatalogQueryParams,
  mockScenario?: string,
) {
  return [
    'discovery',
    'problem-catalog',
    normalizeQueryKey(query),
    mockScenario ?? null,
  ] as const
}

export function useProblemCatalog(
  query: ExternalProblemCatalogQueryParams,
  mockScenario?: string,
) {
  return useQuery({
    queryKey: problemCatalogQueryKey(query, mockScenario),
    queryFn: ({ signal }) =>
      fetchProblemCatalog(query, { signal, mockScenario }),
    placeholderData: keepPreviousData,
  })
}
