import { useState, type FormEvent } from 'react'
import type {
  ExternalProblemCatalogQueryParams,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { Search, X } from '@/components/icons/algo-icons'
import { SegmentedControl } from '@/components/kit/SegmentedControl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useProviders } from '../hooks/useProviders'
import { RatingSpectrum } from './RatingSpectrum'
import { useTopics } from '../hooks/useTopics'
import { Select } from '@/components/ui/select'

const fieldClassName =
  'h-10 w-full min-w-0 rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15'

const difficultyLabels = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
} as const

const difficultyColors = {
  easy: '#22c55e',
  medium: '#f59e0b',
  hard: '#ef4444',
} as const

const statusLabels = {
  unsolved: 'Unsolved',
  attempted: 'Attempted',
  solved: 'Solved',
} as const

const providerNames: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
}

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
  const reduceMotion = useReducedMotion()

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

  function pickRange(range: { min: number; max: number } | null) {
    setRatingError(undefined)
    setMinRatingDraft(range === null ? '' : String(range.min))
    setMaxRatingDraft(range === null ? '' : String(range.max))
    onUpdate({
      search: searchDraft.trim() || undefined,
      minRating: range?.min,
      maxRating: range?.max,
    })
  }

  const topicName =
    filters.topic === undefined
      ? undefined
      : (topicsQuery.data?.data.find((topic) => topic.slug === filters.topic)
          ?.name ?? filters.topic)
  const activeChips: { key: string; label: string; clear: () => void }[] = [
    ...(filters.search
      ? [
          {
            key: 'search',
            label: `“${filters.search}”`,
            clear: () => onUpdate({ search: undefined }),
          },
        ]
      : []),
    ...(filters.minRating !== undefined || filters.maxRating !== undefined
      ? [
          {
            key: 'rating',
            label: `Rating ${filters.minRating ?? 'any'}–${filters.maxRating ?? 'any'}`,
            clear: () => pickRange(null),
          },
        ]
      : []),
    ...(filters.difficulty
      ? [
          {
            key: 'difficulty',
            label: difficultyLabels[filters.difficulty],
            clear: () => onUpdate({ difficulty: undefined }),
          },
        ]
      : []),
    ...(filters.status
      ? [
          {
            key: 'status',
            label: statusLabels[filters.status],
            clear: () => onUpdate({ status: undefined }),
          },
        ]
      : []),
    ...(filters.provider
      ? [
          {
            key: 'provider',
            label: providerNames[filters.provider],
            clear: () => onUpdate({ provider: undefined }),
          },
        ]
      : []),
    ...(topicName !== undefined
      ? [
          {
            key: 'topic',
            label: topicName,
            clear: () => onUpdate({ topic: undefined }),
          },
        ]
      : []),
  ]

  const selectClassName = 'h-9 min-w-0 rounded-xl text-sm hover:border-acc'

  return (
    <section
      aria-labelledby="problem-filters-heading"
      className="relative isolate overflow-hidden rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--acc)_18%,transparent),transparent)] blur-2xl"
      />
      <h2 className="sr-only" id="problem-filters-heading">
        Filter problems
      </h2>

      <form className="grid min-w-0 gap-4" onSubmit={submitTextFilters}>
        <div className="flex min-w-0 gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className={cn(fieldClassName, 'h-11 rounded-2xl pl-11')}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Title, ID, or provider tag"
              type="search"
              value={searchDraft}
            />
          </label>
          <Button className="h-11 rounded-2xl px-5" type="submit" variant="ink">
            Apply<span className="sr-only"> search and ratings</span>
          </Button>
        </div>

        <div className="min-w-0 rounded-2xl border border-border bg-background/50 p-3">
          <div className="mb-2.5 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">
              Rating
              <span className="ml-1.5 font-normal text-muted-foreground">
                tap a band or type a range
              </span>
            </p>
            <div className="flex items-center gap-1.5">
              <label className="min-w-0">
                <span className="sr-only">Minimum rating</span>
                <input
                  className={cn(
                    fieldClassName,
                    'h-8 w-20 rounded-lg text-center font-mono text-xs',
                  )}
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setMinRatingDraft(event.target.value)}
                  placeholder="Any"
                  step="any"
                  type="number"
                  value={minRatingDraft}
                />
              </label>
              <span aria-hidden="true" className="h-px w-2.5 bg-border" />
              <label className="min-w-0">
                <span className="sr-only">Maximum rating</span>
                <input
                  className={cn(
                    fieldClassName,
                    'h-8 w-20 rounded-lg text-center font-mono text-xs',
                  )}
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setMaxRatingDraft(event.target.value)}
                  placeholder="Any"
                  step="any"
                  type="number"
                  value={maxRatingDraft}
                />
              </label>
            </div>
          </div>
          <RatingSpectrum
            max={filters.maxRating}
            min={filters.minRating}
            onPick={pickRange}
          />
        </div>
      </form>

      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
        <SegmentedControl
          label="Difficulty"
          onChange={(value) =>
            onUpdate({
              difficulty: value === 'all' ? undefined : value,
            })
          }
          options={[
            { value: 'all', label: 'All' },
            ...(['easy', 'medium', 'hard'] as const).map((value) => ({
              value,
              label: difficultyLabels[value],
              icon: (
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: difficultyColors[value] }}
                />
              ),
            })),
          ]}
          size="sm"
          value={filters.difficulty ?? 'all'}
        />
        <SegmentedControl
          label="Status"
          onChange={(value) =>
            onUpdate({
              status: value === 'all' ? undefined : value,
            })
          }
          options={[
            { value: 'all', label: 'Any status' },
            { value: 'unsolved', label: 'Unsolved' },
            { value: 'attempted', label: 'Attempted' },
            { value: 'solved', label: 'Solved' },
          ]}
          size="sm"
          value={filters.status ?? 'all'}
        />
        <div
          aria-label="Provider"
          className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-muted/60 p-1"
          role="group"
        >
          <button
            aria-pressed={filters.provider === undefined}
            className={cn(
              'h-7 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              filters.provider === undefined
                ? 'bg-card text-foreground shadow-soft'
                : 'text-muted-foreground hover:text-foreground',
            )}
            disabled={providersQuery.isPending}
            onClick={() => onUpdate({ provider: undefined })}
            type="button"
          >
            All
          </button>
          {providersQuery.data?.data.map((provider) => (
            <button
              aria-pressed={filters.provider === provider.key}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40',
                filters.provider === provider.key
                  ? 'bg-card text-foreground shadow-soft'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              disabled={provider.availability === 'unavailable'}
              key={provider.key}
              onClick={() => onUpdate({ provider: provider.key })}
              type="button"
            >
              <ProviderLogo className="size-3.5" provider={provider.key} />
              {provider.label}
            </button>
          ))}
        </div>
        <div className="w-44">
          <Select
            aria-label="Topic"
            className={selectClassName}
            disabled={topicsQuery.isPending}
            onValueChange={(value) => onUpdate({ topic: value || undefined })}
            options={[
              { value: '', label: 'All topics' },
              ...(topicsQuery.data?.data.map((topic) => ({
                value: topic.slug,
                label: topic.name,
              })) ?? []),
            ]}
            value={filters.topic ?? ''}
          />
        </div>
        <div className="w-32">
          <Select
            aria-label="Results per page"
            className={selectClassName}
            onValueChange={(value) => onUpdate({ pageSize: Number(value) })}
            options={[
              ...([10, 20, 50].includes(filters.pageSize)
                ? []
                : [filters.pageSize]),
              10,
              20,
              50,
            ].map((size) => ({ value: String(size), label: `${size} / page` }))}
            value={String(filters.pageSize)}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {activeChips.length > 0 ? (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
          >
            <ul
              aria-label="Active filters"
              className="mt-4 flex min-w-0 flex-wrap items-center gap-1.5 border-t border-border pt-3"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {activeChips.map((chip) => (
                  <motion.li
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
                    key={chip.key}
                    layout={!reduceMotion}
                  >
                    <button
                      aria-label={`Remove filter: ${chip.label}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-acc-soft py-1 pr-1.5 pl-3 text-xs font-medium text-acc-ink transition-colors hover:bg-[color-mix(in_oklab,var(--acc)_22%,transparent)]"
                      onClick={chip.clear}
                      type="button"
                    >
                      {chip.label}
                      <X aria-hidden="true" className="size-3" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
              <li className="ml-auto">
                <Button
                  disabled={!hasActiveFilters && filters.pageSize === 10}
                  onClick={onClear}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                  Clear filters
                </Button>
              </li>
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {ratingError ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {ratingError}
        </p>
      ) : null}

      {providersQuery.isError || topicsQuery.isError ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          Some filter options are temporarily unavailable. The catalog can still
          be searched.
        </p>
      ) : null}
    </section>
  )
}
