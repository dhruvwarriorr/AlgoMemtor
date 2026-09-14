import { useEffect } from 'react'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'
import { ApiClientError } from '@/features/discovery/api/client'
import { CatalogPagination } from '@/features/discovery/components/CatalogPagination'
import { ProblemCatalog } from '@/features/discovery/components/ProblemCatalog'
import { ProblemFilters } from '@/features/discovery/components/ProblemFilters'
import { useProblemCatalog } from '@/features/discovery/hooks/useProblemCatalog'
import { useProblemCatalogFilters } from '@/features/discovery/hooks/useProblemCatalogFilters'

function ProblemsPage() {
  const {
    filters,
    mockScenario,
    hasActiveFilters,
    updateFilters,
    setPage,
    clearFilters,
  } = useProblemCatalogFilters()
  const catalogQuery = useProblemCatalog(filters, mockScenario)
  const catalog = catalogQuery.data

  useEffect(() => {
    if (!catalog || catalogQuery.isPlaceholderData) {
      return
    }

    const lastValidPage = Math.max(1, catalog.meta.totalPages)

    if (filters.page > lastValidPage) {
      setPage(lastValidPage)
    }
  }, [catalog, catalogQuery.isPlaceholderData, filters.page, setPage])

  let catalogContent

  if (catalogQuery.isPending && !catalog) {
    catalogContent = <PageSkeleton label="Loading problem catalog" rows={4} />
  } else if (catalogQuery.isError && !catalog) {
    const error = catalogQuery.error
    const isRateLimited =
      error instanceof ApiClientError &&
      (error.status === 429 || error.code === 'PROVIDER_RATE_LIMITED')
    const isProviderUnavailable =
      error instanceof ApiClientError &&
      (error.status === 503 || error.code === 'PROVIDER_UNAVAILABLE')

    catalogContent = (
      <ErrorState
        message={
          isRateLimited
            ? 'A problem provider is rate limiting catalog requests. Wait a moment, then retry.'
            : isProviderUnavailable
              ? 'A problem provider is temporarily unavailable. You can retry now or return later.'
              : error instanceof Error
                ? error.message
                : 'The problem catalog could not be loaded.'
        }
        onRetry={() => void catalogQuery.refetch()}
        title={
          isRateLimited
            ? 'Provider rate limit reached'
            : isProviderUnavailable
              ? 'Provider unavailable'
              : 'Unable to load problems'
        }
      />
    )
  } else if (catalog && catalog.data.length === 0) {
    catalogContent = (
      <EmptyState
        action={
          <Button onClick={clearFilters} type="button">
            Clear filters
          </Button>
        }
        description="Try broadening your search, rating range, or topic selection."
        title="No problems match these filters"
      />
    )
  } else if (catalog) {
    catalogContent = (
      <div className="min-w-0 space-y-4">
        <ProblemCatalog
          isFetching={catalogQuery.isFetching}
          problems={catalog.data}
          warnings={catalog.meta.warnings}
        />
        <CatalogPagination
          currentPage={catalog.meta.page}
          isFetching={catalogQuery.isFetching}
          onPageChange={setPage}
          totalPages={catalog.meta.totalPages}
        />
      </div>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        description="Discover recommended problems and solve them on their original platforms."
        title="Problems"
      />

      <ProblemFilters
        filters={filters}
        hasActiveFilters={hasActiveFilters}
        key={`${filters.search ?? ''}:${filters.minRating ?? ''}:${filters.maxRating ?? ''}`}
        onClear={clearFilters}
        onUpdate={updateFilters}
      />

      <section
        aria-labelledby="problem-list-heading"
        className="min-w-0 space-y-4"
      >
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="problem-list-heading"
          >
            Problem catalog
          </h2>
          {catalog ? (
            <p className="text-sm text-muted-foreground">
              {catalog.meta.total} problem
              {catalog.meta.total === 1 ? '' : 's'} found
            </p>
          ) : null}
        </div>
        {catalogContent}
      </section>
    </PageContainer>
  )
}

export default ProblemsPage
