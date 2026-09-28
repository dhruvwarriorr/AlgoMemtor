import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from '@/lib/router'
import type { ExternalProblemCatalogQueryParams } from '@algomemtor/shared-contracts'

import {
  buildCatalogSearchParams,
  defaultCatalogPage,
  defaultCatalogPageSize,
  hasActiveCatalogFilters,
  parseCatalogSearchParams,
} from '../utils/catalogSearchParams'

function preserveMockScenario(
  currentSearchParams: URLSearchParams,
  nextSearchParams: URLSearchParams,
) {
  const mockScenario = process.env.NODE_ENV !== 'production'
    ? currentSearchParams.get('scenario')?.trim()
    : undefined

  if (mockScenario) {
    nextSearchParams.set('scenario', mockScenario)
  }

  return mockScenario
}

export function useProblemCatalogFilters() {
  const [searchParams, setSearchParams] = useSearchParams()
  const serializedSearchParams = searchParams.toString()
  const filters = useMemo(
    () => parseCatalogSearchParams(searchParams),
    [searchParams],
  )
  const mockScenario = process.env.NODE_ENV !== 'production'
    ? searchParams.get('scenario')?.trim() || undefined
    : undefined

  useEffect(() => {
    const sanitizedSearchParams = buildCatalogSearchParams(filters)
    preserveMockScenario(searchParams, sanitizedSearchParams)

    if (sanitizedSearchParams.toString() !== serializedSearchParams) {
      setSearchParams(sanitizedSearchParams, { replace: true })
    }
  }, [filters, searchParams, serializedSearchParams, setSearchParams])

  const updateFilters = useCallback(
    (
      updates: Partial<ExternalProblemCatalogQueryParams>,
      options: { preservePage?: boolean } = {},
    ) => {
      const nextFilters = {
        ...filters,
        ...updates,
        page: options.preservePage ? (updates.page ?? filters.page) : 1,
      }
      const nextSearchParams = buildCatalogSearchParams(nextFilters)
      preserveMockScenario(searchParams, nextSearchParams)
      setSearchParams(nextSearchParams)
    },
    [filters, searchParams, setSearchParams],
  )

  const setPage = useCallback(
    (page: number) => {
      updateFilters({ page }, { preservePage: true })
    },
    [updateFilters],
  )

  const clearFilters = useCallback(() => {
    const nextSearchParams = buildCatalogSearchParams({
      page: defaultCatalogPage,
      pageSize: defaultCatalogPageSize,
    })
    preserveMockScenario(searchParams, nextSearchParams)
    setSearchParams(nextSearchParams)
  }, [searchParams, setSearchParams])

  return {
    filters,
    mockScenario,
    hasActiveFilters: hasActiveCatalogFilters(filters),
    updateFilters,
    setPage,
    clearFilters,
  }
}
