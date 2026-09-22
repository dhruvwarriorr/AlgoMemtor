import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ExternalContestSchema,
  LinkableProviderSchema,
  type ExternalContest,
  type ExternalContestsQuery,
} from '@algomemtor/shared-contracts'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'
import { ProviderFilter } from '@/features/platform/components/ProviderFilter'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { useContests } from '@/features/platform/hooks'

type ContestStatus = NonNullable<ExternalContestsQuery['status']>

const statusLabels: Record<ContestStatus, string> = {
  upcoming: 'Upcoming',
  running: 'Running',
  finished: 'Finished',
  unknown: 'Unknown',
}

function formatDate(value: string | undefined) {
  if (value === undefined) return 'Time not reported'
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function ContestCard({ contest }: { contest: ExternalContest }) {
  return (
    <li className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {providerLabels[contest.provider]} · {statusLabels[contest.status]}
          </p>
          <h3 className="mt-1 break-words text-lg font-semibold text-foreground">
            <a
              className="underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={contest.canonicalUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {contest.name}
            </a>
          </h3>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
          {contest.externalId}
        </span>
      </div>
      <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Starts</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {formatDate(contest.startsAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ends</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {formatDate(contest.endsAt)}
          </dd>
        </div>
        {contest.durationSeconds !== undefined ? (
          <div>
            <dt className="text-muted-foreground">Duration</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {Math.round(contest.durationSeconds / 60)} minutes
            </dd>
          </div>
        ) : null}
        {contest.phase ? (
          <div>
            <dt className="text-muted-foreground">Phase</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {contest.phase}
            </dd>
          </div>
        ) : null}
      </dl>
    </li>
  )
}

function providerFromSearch(value: string | null) {
  const result = LinkableProviderSchema.safeParse(value)
  return result.success ? result.data : undefined
}

// Upcoming contests are the default view; "all" is an explicit choice.
const allStatuses = 'all'

function statusFromSearch(value: string | null): ContestStatus | undefined {
  if (value === null) return 'upcoming'
  if (value === allStatuses) return undefined
  const result = ExternalContestSchema.shape.status.safeParse(value)
  return result.success ? result.data : 'upcoming'
}

function ContestsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const provider = providerFromSearch(searchParams.get('provider'))
  const status = statusFromSearch(searchParams.get('status'))
  const contestsQuery = useContests(
    useMemo(
      () => ({
        ...(provider === undefined ? {} : { provider }),
        ...(status === undefined ? {} : { status }),
      }),
      [provider, status],
    ),
  )
  const contests = contestsQuery.data
  const [visibleCount, setVisibleCount] = useState(12)

  function updateFilters(
    nextProvider: typeof provider,
    nextStatus: typeof status,
  ) {
    const nextParams = new URLSearchParams(searchParams)
    if (nextProvider === undefined) nextParams.delete('provider')
    else nextParams.set('provider', nextProvider)
    if (nextStatus === 'upcoming') nextParams.delete('status')
    else nextParams.set('status', nextStatus ?? allStatuses)
    setVisibleCount(12)
    setSearchParams(nextParams)
  }

  let content
  if (contestsQuery.isPending) {
    content = <PageSkeleton label="Loading contests" rows={5} />
  } else if (contestsQuery.isError) {
    content = (
      <ErrorState
        message={
          contestsQuery.error instanceof Error
            ? contestsQuery.error.message
            : 'Contests could not be loaded.'
        }
        onRetry={() => void contestsQuery.refetch()}
        title="Unable to load contests"
      />
    )
  } else if (contests?.data.length === 0) {
    content = (
      <EmptyState
        action={
          status === undefined ? null : (
            <Button
              onClick={() => updateFilters(provider, undefined)}
              type="button"
              variant="outline"
            >
              Show all contests
            </Button>
          )
        }
        description="No contests match the selected provider and status. Try showing all contests."
        title="No contests found"
      />
    )
  } else if (contests) {
    content = (
      <div className="space-y-4">
        <ul className="grid min-w-0 gap-3 lg:grid-cols-2" aria-label="Contests">
          {contests.data.slice(0, visibleCount).map((contest) => (
            <ContestCard
              contest={contest}
              key={`${contest.provider}:${contest.externalId}`}
            />
          ))}
        </ul>
        {visibleCount < contests.data.length ? (
          <div className="flex justify-center">
            <Button
              onClick={() => setVisibleCount((count) => count + 12)}
              type="button"
              variant="outline"
            >
              Show more contests
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        description="Browse upcoming and historical contests from the connected public provider catalogs."
        title="Contests"
      />

      <section
        aria-label="Contest filters"
        className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <ProviderFilter
          id="contest-provider"
          onChange={(next) => updateFilters(next, status)}
          value={provider}
        />
        <label className="min-w-40 space-y-1.5 text-sm font-medium text-foreground">
          Status
          <select
            className="h-10 w-full rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
            id="contest-status"
            onChange={(event) => {
              const next = event.currentTarget.value
              updateFilters(
                provider,
                next === allStatuses ? undefined : (next as ContestStatus),
              )
            }}
            value={status ?? allStatuses}
          >
            <option value={allStatuses}>All statuses</option>
            {(['upcoming', 'running', 'finished', 'unknown'] as const).map(
              (value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ),
            )}
          </select>
        </label>
      </section>

      <section aria-labelledby="contest-list-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="contest-list-heading"
          >
            Contest catalog
          </h2>
          {contests ? (
            <p className="text-sm text-muted-foreground">
              {contests.data.length} contest
              {contests.data.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
        {content}
      </section>
    </PageContainer>
  )
}

export default ContestsPage
