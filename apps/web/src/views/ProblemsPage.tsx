import { useEffect } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { ExternalProblemSummary } from '@algomemtor/shared-contracts'

import PageContainer from '@/components/layout/PageContainer'
import { PageHero } from '@/components/kit/PageHero'
import { CountUp } from '@/components/motion/CountUp'
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
import { bandColor, ratingPosition } from '@/features/discovery/rating-bands'

// The ratings on this page as a row of bars in their rank colours.
function RatingStrip({ problems }: { problems: ExternalProblemSummary[] }) {
  const reduceMotion = useReducedMotion()
  const rated = problems.filter(
    (
      problem,
    ): problem is ExternalProblemSummary & {
      providerDifficulty: number
    } => typeof problem.providerDifficulty === 'number',
  )
  if (rated.length === 0) return null
  return (
    <div
      aria-label={`Ratings on this page: ${rated.map((problem) => problem.providerDifficulty).join(', ')}`}
      className="flex items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2"
      role="img"
    >
      <span className="self-center text-[0.68rem] font-medium text-muted-foreground">
        On this page
      </span>
      <span className="flex h-8 items-end gap-1">
        {rated.map((problem, index) => (
          <motion.span
            animate={{
              height: `${Math.max(22, ratingPosition(problem.providerDifficulty) * 100)}%`,
            }}
            className="w-1.5 rounded-full"
            initial={reduceMotion ? false : { height: '0%' }}
            key={`${problem.provider}:${problem.externalId}`}
            style={{ background: bandColor(problem.providerDifficulty) }}
            title={`${problem.title}: ${problem.providerDifficulty}`}
            transition={{
              duration: 0.5,
              ease: [0.16, 1, 0.3, 1],
              delay: index * 0.03,
            }}
          />
        ))}
      </span>
    </div>
  )
}

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
    <PageContainer accent="teal" className="gap-6">
      <PageHero
        info="Problems come from provider catalogs as metadata only. Open one to read, code and submit on its original platform. Filters live in the URL, so this view can be shared or refreshed."
        subtitle="Browse provider problems and solve them where they live."
        title="Problems"
      />

      <div className="min-w-0 space-y-4">
        <ProblemFilters
          filters={filters}
          hasActiveFilters={hasActiveFilters}
          key={`${filters.search ?? ''}:${filters.minRating ?? ''}:${filters.maxRating ?? ''}`}
          onClear={clearFilters}
          onUpdate={updateFilters}
        />

        <section
          aria-labelledby="problem-list-heading"
          className="min-w-0 space-y-3"
        >
          <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2
                className="text-lg font-semibold tracking-tight text-foreground"
                id="problem-list-heading"
              >
                Problem catalog
              </h2>
              {catalog ? (
                <p
                  className="mt-0.5 text-sm text-muted-foreground"
                  role="status"
                >
                  <CountUp
                    className="font-heading font-bold text-foreground tabular-nums"
                    duration={0.8}
                    value={catalog.meta.total}
                  />{' '}
                  problem{catalog.meta.total === 1 ? '' : 's'} match · page{' '}
                  {catalog.meta.page} of {Math.max(1, catalog.meta.totalPages)}
                </p>
              ) : null}
            </div>
            {catalog && catalog.data.length > 0 ? (
              <RatingStrip problems={catalog.data} />
            ) : null}
          </div>
          {catalogContent}
        </section>
      </div>
    </PageContainer>
  )
}

export default ProblemsPage
