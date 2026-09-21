import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  LinkableProviderSchema,
  type ProviderActivityEvent,
} from '@algomemtor/shared-contracts'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'
import { useActivity } from '@/features/platform/hooks'

import { ProviderFilter } from '@/features/platform/components/ProviderFilter'
import { providerLabels } from '@/features/platform/components/provider-labels'

const eventLabels: Record<ProviderActivityEvent['eventType'], string> = {
  submission: 'Submission',
  solved: 'Solved problem',
  rating_change: 'Rating change',
  contest: 'Contest participation',
}

function formatDate(value: string | null) {
  if (value === null) return 'Time not reported by provider'
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function providerFromSearch(value: string | null) {
  const result = LinkableProviderSchema.safeParse(value)
  return result.success ? result.data : undefined
}

function ActivityEvent({ event }: { event: ProviderActivityEvent }) {
  const label = event.title ?? event.externalId ?? event.eventType
  const detail = [
    event.verdict,
    event.language,
    event.ratingDelta === undefined
      ? undefined
      : `${event.ratingDelta >= 0 ? '+' : ''}${event.ratingDelta} rating`,
    event.rank === undefined ? undefined : `Rank ${event.rank}`,
  ].filter((value): value is string => value !== undefined)

  return (
    <li className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {providerLabels[event.provider]} · {eventLabels[event.eventType]}
          </p>
          <p className="mt-1 break-words font-medium text-foreground">
            {event.canonicalUrl && event.externalId ? (
              <Link
                className="underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                to={`/problems/${event.provider}/${encodeURIComponent(event.externalId)}`}
              >
                {label}
              </Link>
            ) : event.canonicalUrl ? (
              <a
                className="underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={event.canonicalUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {label}
              </a>
            ) : (
              label
            )}
          </p>
          {detail.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {detail.join(' · ')}
            </p>
          ) : null}
          {event.providerTags !== undefined && event.providerTags.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Tags: {event.providerTags.join(', ')}
            </p>
          ) : null}
        </div>
        <time
          className="shrink-0 text-right text-xs text-muted-foreground"
          dateTime={event.occurredAt ?? undefined}
        >
          {formatDate(event.occurredAt)}
        </time>
      </div>
    </li>
  )
}

function ActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const provider = providerFromSearch(searchParams.get('provider'))
  const activityQuery = useActivity(provider)
  const activity = activityQuery.data
  const [visibleCount, setVisibleCount] = useState(12)

  function updateProvider(next: typeof provider) {
    const nextParams = new URLSearchParams(searchParams)
    if (next === undefined) nextParams.delete('provider')
    else nextParams.set('provider', next)
    setVisibleCount(12)
    setSearchParams(nextParams)
  }

  let content
  if (activityQuery.isPending) {
    content = <PageSkeleton label="Loading provider activity" rows={6} />
  } else if (activityQuery.isError) {
    content = (
      <ErrorState
        message={
          activityQuery.error instanceof Error
            ? activityQuery.error.message
            : 'Activity could not be loaded.'
        }
        onRetry={() => void activityQuery.refetch()}
        title="Unable to load activity"
      />
    )
  } else if (activity?.data.length === 0) {
    content = (
      <EmptyState
        description="Link a public provider profile and request a sync to build this timeline. Manual progress events will also appear here."
        title="No activity recorded yet"
      />
    )
  } else if (activity) {
    content = (
      <div className="space-y-4">
        <ul className="grid min-w-0 gap-3" aria-label="Provider activity">
          {activity.data.slice(0, visibleCount).map((event) => (
            <ActivityEvent event={event} key={event.id} />
          ))}
        </ul>
        {visibleCount < activity.data.length ? (
          <div className="flex justify-center">
            <Button
              onClick={() => setVisibleCount((count) => count + 12)}
              type="button"
              variant="outline"
            >
              Show more activity
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        description="A merged timeline of provider observations, accepted problems, rating changes, contest participation, and your manual learning actions."
        title="Activity"
      />

      <section
        aria-label="Activity filters"
        className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <ProviderFilter
          id="activity-provider"
          onChange={updateProvider}
          value={provider}
        />
        <p className="max-w-xl text-sm text-muted-foreground">
          Provider-reported events remain attributed to their source. A link
          opening is never treated as proof of a solve.
        </p>
      </section>

      <section aria-labelledby="activity-list-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="activity-list-heading"
          >
            Timeline
          </h2>
          {activity ? (
            <p className="text-sm text-muted-foreground">
              {activity.data.length} event
              {activity.data.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
        {content}
      </section>
    </PageContainer>
  )
}

export default ActivityPage
