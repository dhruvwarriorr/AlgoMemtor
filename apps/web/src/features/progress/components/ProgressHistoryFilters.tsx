import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

import type {
  ProgressHistoryEventType,
  ProgressHistoryQuery,
} from '../contracts'

const fieldClassName =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15'
const eventTypes: Array<{ value: ProgressHistoryEventType; label: string }> = [
  { value: 'status_changed', label: 'Status changes' },
  { value: 'reflection_created', label: 'Reflections' },
  { value: 'timer_started', label: 'Timer started' },
  { value: 'timer_paused', label: 'Timer paused' },
  { value: 'timer_completed', label: 'Timer completed' },
  { value: 'timer_discarded', label: 'Timer discarded' },
  { value: 'impression', label: 'Recommendation impressions' },
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
          <Select
            onValueChange={(value) =>
              onUpdate({
                eventType: eventTypes.find((item) => item.value === value)
                  ?.value,
              })
            }
            options={[
              { value: '', label: 'All activity' },
              ...eventTypes.map((eventType) => ({
                value: eventType.value,
                label: eventType.label,
              })),
            ]}
            value={query.eventType ?? ''}
          />
        </label>
        <label className="space-y-1.5 text-sm font-medium text-foreground">
          Status
          <Select
            onValueChange={(value) =>
              onUpdate({
                status:
                  value === 'unsolved' ||
                  value === 'attempted' ||
                  value === 'solved'
                    ? value
                    : undefined,
              })
            }
            options={[
              { value: '', label: 'All statuses' },
              { value: 'unsolved', label: 'Unsolved' },
              { value: 'attempted', label: 'Attempted' },
              { value: 'solved', label: 'Solved' },
            ]}
            value={query.status ?? ''}
          />
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
