import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { UpsolveContest, UpsolveItem } from '@algomemtor/shared-contracts'

import {
  ArrowUpRight,
  BookOpen,
  CalendarCheck,
  Check,
  Crosshair,
  RefreshCw,
  X,
} from '@/components/icons/algo-icons'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { useNotification } from '@/app/useNotification'
import { useAuth } from '@/features/auth/useAuth'
import {
  ProviderBadge,
  ProviderProblemLink,
  SectionCard,
  StatTile,
} from '@/features/mentor/components/shared'
import {
  formatDateTime,
  humanTopic,
  mentorErrorMessage,
  providerLabels,
} from '@/features/mentor/format'
import { mentorToolPath } from '@/features/mentor/feature-routes'
import { useUpdateUpsolveItem, useUpsolve } from '@/features/mentor/hooks'
import { useSetProblemStatus } from '@/features/progress/hooks/useProgress'
import { cn } from '@/lib/utils'

const QUEUE_PREVIEW = 8

function monthLabel(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      year: '2-digit',
    }).format(new Date(`${value}-01T00:00:00Z`))
  } catch {
    return value
  }
}

function ItemActions({
  item,
  onSkip,
  onRestore,
  onSolved,
  pending,
}: {
  item: UpsolveItem
  onSkip: () => void
  onRestore: () => void
  onSolved: () => void
  pending: boolean
}) {
  const canMarkSolved = item.provider !== 'leetcode'
  if (item.status === 'upsolved') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-go-soft px-2 py-1 text-xs font-medium text-go-foreground">
        <Check aria-hidden="true" className="size-3.5" />
        {item.statusSource === 'manual' ? 'Marked solved by you' : 'Accepted'}
      </span>
    )
  }
  if (item.status === 'skipped') {
    return (
      <Button
        disabled={pending}
        onClick={onRestore}
        size="sm"
        type="button"
        variant="ghost"
      >
        Restore
      </Button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link
        className={buttonVariants({ size: 'sm' })}
        to={mentorToolPath('doubt_helper', item.canonicalUrl)}
      >
        <Crosshair aria-hidden="true" /> Get hints
      </Link>
      {item.editorialUrl ? (
        <a
          className={buttonVariants({ size: 'sm', variant: 'outline' })}
          href={item.editorialUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Editorial <ArrowUpRight aria-hidden="true" />
          <span className="sr-only">
            (opens on {providerLabels[item.provider]})
          </span>
        </a>
      ) : null}
      <Link
        className={buttonVariants({ size: 'sm', variant: 'outline' })}
        to={mentorToolPath('solution_explorer', item.canonicalUrl)}
      >
        <BookOpen aria-hidden="true" /> Approaches
      </Link>
      {canMarkSolved ? (
        <Button
          disabled={pending}
          onClick={onSolved}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Check aria-hidden="true" /> Mark solved
        </Button>
      ) : null}
      <Button
        aria-label={`Skip ${item.title}`}
        disabled={pending}
        onClick={onSkip}
        size="sm"
        type="button"
        variant="ghost"
      >
        <X aria-hidden="true" /> Skip
      </Button>
    </div>
  )
}

function ItemRow({
  item,
  showContest,
  actions,
}: {
  item: UpsolveItem
  showContest: boolean
  actions: ReactNode
}) {
  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between',
        item.status !== 'pending' && 'opacity-80',
      )}
    >
      <div className="flex min-w-0 gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary font-mono text-sm font-semibold text-secondary-foreground"
        >
          {item.position ?? '•'}
        </span>
        <div className="min-w-0">
          <ProviderProblemLink
            href={item.canonicalUrl}
            provider={item.provider}
            title={item.title}
          />
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <ProviderBadge provider={item.provider} />
            {showContest ? (
              <span className="truncate">{item.contest.name}</span>
            ) : null}
            {item.rating !== undefined ? (
              <span>Rated {item.rating}</span>
            ) : null}
            <span>
              {item.contestOutcome === 'attempted'
                ? `Attempted in contest${item.contestWrongAttempts > 0 ? ` · ${item.contestWrongAttempts} wrong` : ''}`
                : 'Not attempted in contest'}
            </span>
          </p>
          {item.status === 'pending' ? (
            <p className="mt-1.5 text-sm text-foreground/85">
              {item.priorityReason}
            </p>
          ) : null}
          {item.tags.length > 0 ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {item.tags.slice(0, 4).map(humanTopic).join(' · ')}
            </p>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 lg:pl-4">{actions}</div>
    </li>
  )
}

function UpsolvePage() {
  const { notify } = useNotification()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const upsolveQuery = useUpsolve()
  const updateItem = useUpdateUpsolveItem()
  const setStatus = useSetProblemStatus()
  const [showAll, setShowAll] = useState(false)

  const header = (
    <PageHeader
      action={
        <Button
          disabled={upsolveQuery.isFetching}
          onClick={() => void upsolveQuery.refetch()}
          type="button"
          variant="outline"
        >
          <RefreshCw
            aria-hidden="true"
            className={cn(
              upsolveQuery.isFetching &&
                'animate-spin motion-reduce:animate-none',
            )}
          />
          Refresh
        </Button>
      }
      description="Every problem you missed in your recent contests, ordered by what will teach you most. Get level-appropriate hints, read the editorial, explore approaches, and track how consistently you follow through."
      title="Upsolve"
    />
  )

  if (upsolveQuery.isPending) {
    return (
      <PageContainer>
        {header}
        <PageSkeleton label="Building your upsolve queue" rows={5} />
      </PageContainer>
    )
  }
  if (upsolveQuery.isError) {
    return (
      <PageContainer>
        {header}
        <ErrorState
          message={mentorErrorMessage(
            upsolveQuery.error,
            'Your upsolve queue could not be loaded.',
          )}
          onRetry={() => void upsolveQuery.refetch()}
          title="Upsolve unavailable"
        />
      </PageContainer>
    )
  }

  const { queue, contests, summary, revisionsDue, linkedProviders } =
    upsolveQuery.data.data
  const pending = updateItem.isPending || setStatus.isPending

  const skip = (item: UpsolveItem, state: 'skipped' | 'pending') =>
    updateItem.mutate(
      { provider: item.provider, externalId: item.externalId, state },
      {
        onSuccess: () =>
          notify({
            title: state === 'skipped' ? 'Skipped' : 'Back in your queue',
            description: item.title,
            tone: 'info',
          }),
        onError: (error) =>
          notify({
            title: 'That did not save',
            description: mentorErrorMessage(error, 'Try again shortly.'),
            tone: 'error',
          }),
      },
    )

  const markSolved = (item: UpsolveItem) =>
    setStatus.mutate(
      {
        problem: { provider: item.provider, externalId: item.externalId },
        input: { status: 'solved', sourceContext: 'upsolve' },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: ['mentor', user?.id ?? 'signed-out'],
          })
          notify({
            title: 'Marked solved',
            description: `${item.title} is recorded as self-reported and added to your revision schedule.`,
            tone: 'success',
          })
        },
        onError: (error) =>
          notify({
            title: 'Status was not saved',
            description: mentorErrorMessage(error, 'Try again shortly.'),
            tone: 'error',
          }),
      },
    )

  const actionsFor = (item: UpsolveItem) => (
    <ItemActions
      item={item}
      onRestore={() => skip(item, 'pending')}
      onSkip={() => skip(item, 'skipped')}
      onSolved={() => markSolved(item)}
      pending={pending}
    />
  )

  if (contests.length === 0) {
    return (
      <PageContainer>
        {header}
        <EmptyState
          action={
            linkedProviders.length === 0 ? (
              <Link className={buttonVariants()} to="/settings#platforms">
                Link a platform
              </Link>
            ) : (
              <Link className={buttonVariants()} to="/contests">
                Browse upcoming contests
              </Link>
            )
          }
          description={
            linkedProviders.length === 0
              ? 'Link Codeforces, CodeChef or LeetCode so AlgoMemtor can see the contests you take part in.'
              : 'Take part in a rated contest and sync your platform. Problems you miss will appear here, prioritized.'
          }
          title="No contests to upsolve yet"
        />
      </PageContainer>
    )
  }

  const trendMax = Math.max(1, ...summary.trend.map((point) => point.flagged))
  const visibleQueue = showAll ? queue : queue.slice(0, QUEUE_PREVIEW)

  return (
    <PageContainer>
      {header}

      <dl className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          hint="Across your last contests"
          label="Flagged problems"
          value={summary.flagged}
        />
        <StatTile
          hint="Solved after the contest"
          label="Upsolved"
          tone="positive"
          value={summary.upsolved}
        />
        <StatTile
          hint="Waiting in your queue"
          label="Pending"
          value={summary.pending}
        />
        <StatTile
          hint={`${summary.skipped} skipped`}
          label="Completion rate"
          tone={
            summary.completionRate !== null && summary.completionRate >= 0.5
              ? 'positive'
              : 'warning'
          }
          value={
            summary.completionRate === null
              ? '—'
              : `${Math.round(summary.completionRate * 100)}%`
          }
        />
      </dl>

      {revisionsDue > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="inline-flex items-center gap-2 text-sm text-foreground">
            <CalendarCheck aria-hidden="true" className="size-4 text-primary" />
            {revisionsDue} upsolved{' '}
            {revisionsDue === 1 ? 'problem is' : 'problems are'} due for
            revision.
          </p>
        </div>
      ) : null}

      <SectionCard
        description="The highest-value problems to upsolve next."
        id="upsolve-queue"
        title="Up next"
      >
        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your queue is clear. Every flagged problem is upsolved or skipped.
          </p>
        ) : (
          <>
            <ol className="grid gap-2">
              {visibleQueue.map((item) => (
                <ItemRow
                  actions={actionsFor(item)}
                  item={item}
                  key={item.id}
                  showContest
                />
              ))}
            </ol>
            {queue.length > QUEUE_PREVIEW ? (
              <button
                className="mt-3 text-sm font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => setShowAll((value) => !value)}
                type="button"
              >
                {showAll ? 'Show fewer' : `Show all ${queue.length}`}
              </button>
            ) : null}
          </>
        )}
      </SectionCard>

      {summary.trend.length > 0 ? (
        <SectionCard
          description="Problems flagged each month and how many you went back and solved."
          id="upsolve-trend"
          title="Follow-through over time"
        >
          <ul className="flex min-w-0 items-end gap-3 overflow-x-auto pb-1">
            {summary.trend.map((point) => (
              <li
                aria-label={`${monthLabel(point.month)}: ${point.upsolved} of ${point.flagged} upsolved`}
                className="flex w-14 shrink-0 flex-col items-center gap-1.5"
                key={point.month}
              >
                <div className="flex h-28 w-8 flex-col justify-end overflow-hidden rounded-md bg-secondary">
                  <div
                    className="w-full bg-primary/35"
                    style={{
                      height: `${((point.flagged - point.upsolved) / trendMax) * 100}%`,
                    }}
                  />
                  <div
                    className="w-full bg-primary"
                    style={{ height: `${(point.upsolved / trendMax) * 100}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-foreground">
                  {point.upsolved}/{point.flagged}
                </span>
                <span className="text-[0.7rem] text-muted-foreground">
                  {monthLabel(point.month)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <section
        aria-labelledby="by-contest-heading"
        className="flex min-w-0 flex-col gap-3"
      >
        <h2
          className="text-lg font-semibold text-foreground"
          id="by-contest-heading"
        >
          By contest
        </h2>
        {contests.map((contest: UpsolveContest) => (
          <details
            className="group min-w-0 rounded-xl border border-border bg-card"
            key={`${contest.provider}:${contest.contestId}`}
            open={contest === contests[0]}
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <ProviderBadge provider={contest.provider} />
                  <span className="font-medium text-foreground">
                    {contest.name}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {contest.startsAt
                    ? formatDateTime(contest.startsAt, false)
                    : ''}
                  {contest.rank !== undefined ? ` · rank ${contest.rank}` : ''}
                  {contest.ratingChange !== undefined
                    ? ` · ${contest.ratingChange > 0 ? '+' : ''}${Math.round(contest.ratingChange)} rating`
                    : ''}
                  {` · solved ${contest.solvedInContest} in contest`}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {
                  contest.items.filter((item) => item.status === 'upsolved')
                    .length
                }
                /{contest.items.length} upsolved
              </span>
            </summary>
            <div className="border-t border-border p-4">
              {contest.coverageNote ? (
                <p className="mb-3 text-xs text-muted-foreground">
                  {contest.coverageNote}
                </p>
              ) : null}
              {contest.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing to upsolve from this contest.
                </p>
              ) : (
                <ol className="grid gap-2">
                  {contest.items.map((item) => (
                    <ItemRow
                      actions={actionsFor(item)}
                      item={item}
                      key={item.id}
                      showContest={false}
                    />
                  ))}
                </ol>
              )}
            </div>
          </details>
        ))}
      </section>
    </PageContainer>
  )
}

export default UpsolvePage
