import type { LearnerProblemStatus } from '@algomemtor/shared-contracts'

import { Button } from '@/components/ui/button'

import type {
  ProgressHistoryEventType,
  ProgressHistoryQuery,
} from '../contracts'

const fieldClassName =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
const eventTypes: Array<{ value: ProgressHistoryEventType; label: string }> = [
  { value: 'status_changed', label: 'Status changes' },
  { value: 'reflection_created', label: 'Reflections' },
  { value: 'timer_started', label: 'Timer started' },
  { value: 'timer_paused', label: 'Timer paused' },
  { value: 'timer_completed', label: 'Timer completed' },
  { value: 'timer_discarded', label: 'Timer discarded' },
  { value: 'impression', label: 'Recommendation impressions' },
  { value: 'opened', label: 'Provider opens' },
  { value: 'bookmark_added', label: 'Bookmarks added' },
  { value: 'bookmark_removed', label: 'Bookmarks removed' },
]

type ProgressHistoryFiltersProps = {
  query: ProgressHistoryQuery
  hasActiveFilters: boolean
  onClear: () => void
  onUpdate: (updates: Partial<ProgressHistoryQuery>) => void
}

export function ProgressHistoryFilters({
  hasActiveFilters,
  onClear,
  onUpdate,
  query,
}: ProgressHistoryFiltersProps) {
  return (
    <section
      aria-labelledby="progress-history-filters-heading"
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className="text-lg font-semibold text-card-foreground"
            id="progress-history-filters-heading"
          >
            Filter activity
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Filters and the history cursor are kept in the URL.
          </p>
        </div>
        <Button
          disabled={!hasActiveFilters}
          onClick={onClear}
          type="button"
          variant="ghost"
        >
          Clear filters
        </Button>
      </div>

      <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5 text-sm font-medium text-foreground">
          Activity type
          <select
            className={fieldClassName}
            onChange={(event) =>
              onUpdate({
                eventType: event.currentTarget.value
                  ? (event.currentTarget.value as ProgressHistoryEventType)
                  : undefined,
              })
            }
            value={query.eventType ?? ''}
          >
            <option value="">All activity</option>
            {eventTypes.map((eventType) => (
              <option key={eventType.value} value={eventType.value}>
                {eventType.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-medium text-foreground">
          Status
          <select
            className={fieldClassName}
            onChange={(event) =>
              onUpdate({
                status: event.currentTarget.value
                  ? (event.currentTarget.value as LearnerProblemStatus)
                  : undefined,
              })
            }
            value={query.status ?? ''}
          >
            <option value="">All statuses</option>
            <option value="unsolved">Unsolved</option>
            <option value="attempted">Attempted</option>
            <option value="solved">Solved</option>
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-medium text-foreground">
          Topic
          <input
            className={fieldClassName}
            onChange={(event) =>
              onUpdate({ topic: event.currentTarget.value || undefined })
            }
            placeholder="e.g. graphs"
            type="search"
            value={query.topic ?? ''}
          />
        </label>
        <label className="space-y-1.5 text-sm font-medium text-foreground">
          Problem ID
          <input
            className={fieldClassName}
            onChange={(event) =>
              onUpdate({ externalId: event.currentTarget.value || undefined })
            }
            placeholder="e.g. 100A"
            type="search"
            value={query.externalId ?? ''}
          />
        </label>
      </div>
    </section>
  )
}
