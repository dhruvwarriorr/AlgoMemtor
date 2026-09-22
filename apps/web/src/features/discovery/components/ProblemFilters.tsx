import { useState, type FormEvent } from 'react'
import type {
  ExternalProblemCatalogQueryParams,
  LearnerProblemStatus,
  NormalizedDifficulty,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import { Button } from '@/components/ui/button'

import { useProviders } from '../hooks/useProviders'
import { useTopics } from '../hooks/useTopics'

const fieldClassName =
  'h-10 w-full min-w-0 rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15'

const labelClassName = 'space-y-1.5 text-sm font-medium text-foreground'

type ProblemFiltersProps = {
  filters: ExternalProblemCatalogQueryParams
  hasActiveFilters: boolean
  onClear: () => void
  onUpdate: (updates: Partial<ExternalProblemCatalogQueryParams>) => void
}

function parseRating(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return { valid: true as const, value: undefined }
  }

  const parsedValue = Number(trimmedValue)

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return { valid: false as const, value: undefined }
  }

  return { valid: true as const, value: parsedValue }
}

export function ProblemFilters({
  filters,
  hasActiveFilters,
  onClear,
  onUpdate,
}: ProblemFiltersProps) {
  const providersQuery = useProviders()
  const topicsQuery = useTopics()
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '')
  const [minRatingDraft, setMinRatingDraft] = useState(
    filters.minRating?.toString() ?? '',
  )
  const [maxRatingDraft, setMaxRatingDraft] = useState(
    filters.maxRating?.toString() ?? '',
  )
  const [ratingError, setRatingError] = useState<string>()

  function submitTextFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const minRating = parseRating(minRatingDraft)
    const maxRating = parseRating(maxRatingDraft)

    if (!minRating.valid || !maxRating.valid) {
      setRatingError('Ratings must be non-negative numbers.')
      return
    }

    if (
      minRating.value !== undefined &&
      maxRating.value !== undefined &&
      minRating.value > maxRating.value
    ) {
      setRatingError('Minimum rating cannot be greater than maximum rating.')
      return
    }

    setRatingError(undefined)
    onUpdate({
      search: searchDraft.trim() || undefined,
      minRating: minRating.value,
      maxRating: maxRating.value,
    })
  }

  return (
    <section
      aria-labelledby="problem-filters-heading"
      className="rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className="text-xl font-semibold text-card-foreground"
            id="problem-filters-heading"
          >
            Filter problems
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Filters are saved in the URL so you can return to this view.
          </p>
        </div>
        <Button
          disabled={!hasActiveFilters && filters.pageSize === 10}
          onClick={onClear}
          type="button"
          variant="ghost"
        >
          Clear filters
        </Button>
      </div>

      <form className="mt-5 space-y-4" onSubmit={submitTextFilters}>
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2">
          <label className={`${labelClassName} sm:col-span-2 xl:col-span-2`}>
            Search
            <input
              className={fieldClassName}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Title, ID, or provider tag"
              type="search"
              value={searchDraft}
            />
          </label>

          <label className={labelClassName}>
            Provider
            <select
              className={fieldClassName}
              disabled={providersQuery.isPending}
              onChange={(event) =>
                onUpdate({
                  provider: event.target.value
                    ? (event.target.value as ProviderKey)
                    : undefined,
                })
              }
              value={filters.provider ?? ''}
            >
              <option value="">All providers</option>
              {providersQuery.data?.data.map((provider) => (
                <option
                  disabled={provider.availability === 'unavailable'}
                  key={provider.key}
                  value={provider.key}
                >
                  {provider.label}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClassName}>
            Topic
            <select
              className={fieldClassName}
              disabled={topicsQuery.isPending}
              onChange={(event) =>
                onUpdate({ topic: event.target.value || undefined })
              }
              value={filters.topic ?? ''}
            >
              <option value="">All topics</option>
              {topicsQuery.data?.data.map((topic) => (
                <option key={topic.id} value={topic.slug}>
                  {topic.name}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClassName}>
            Difficulty
            <select
              className={fieldClassName}
              onChange={(event) =>
                onUpdate({
                  difficulty: event.target.value
                    ? (event.target.value as NormalizedDifficulty)
                    : undefined,
                })
              }
              value={filters.difficulty ?? ''}
            >
              <option value="">All difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

          <label className={labelClassName}>
            Status
            <select
              className={fieldClassName}
              onChange={(event) =>
                onUpdate({
                  status: event.target.value
                    ? (event.target.value as LearnerProblemStatus)
                    : undefined,
                })
              }
              value={filters.status ?? ''}
            >
              <option value="">All statuses</option>
              <option value="unsolved">Unsolved</option>
              <option value="attempted">Attempted</option>
              <option value="solved">Solved</option>
            </select>
          </label>

          <label className={labelClassName}>
            Minimum rating
            <input
              className={fieldClassName}
              inputMode="decimal"
              min="0"
              onChange={(event) => setMinRatingDraft(event.target.value)}
              placeholder="Any"
              step="any"
              type="number"
              value={minRatingDraft}
            />
          </label>

          <label className={labelClassName}>
            Maximum rating
            <input
              className={fieldClassName}
              inputMode="decimal"
              min="0"
              onChange={(event) => setMaxRatingDraft(event.target.value)}
              placeholder="Any"
              step="any"
              type="number"
              value={maxRatingDraft}
            />
          </label>

          <label className={labelClassName}>
            Results per page
            <select
              className={fieldClassName}
              onChange={(event) =>
                onUpdate({ pageSize: Number(event.target.value) })
              }
              value={filters.pageSize}
            >
              {[10, 20, 50].includes(filters.pageSize) ? null : (
                <option value={filters.pageSize}>{filters.pageSize}</option>
              )}
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>

        {ratingError ? (
          <p className="text-sm text-destructive" role="alert">
            {ratingError}
          </p>
        ) : null}

        {providersQuery.isError || topicsQuery.isError ? (
          <p className="text-sm text-muted-foreground" role="status">
            Some filter options are temporarily unavailable. The catalog can
            still be searched.
          </p>
        ) : null}

        <Button className="w-full" type="submit" variant="ink">
          Apply search and ratings
        </Button>
      </form>
    </section>
  )
}
