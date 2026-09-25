import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  UPSOLVE_QUEUE_SIZE,
  type UpsolveContest,
  type UpsolveHistoryPoint,
  type UpsolveItem,
} from '@algomemtor/shared-contracts'

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
  if (item.status === 'solved_in_contest') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
        <Check aria-hidden="true" className="size-3.5" /> Solved in contest
      </span>
    )
  }
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
      <Button
        disabled={pending}
        onClick={onSolved}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Check aria-hidden="true" /> Mark solved
      </Button>
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
  rank,
}: {
  item: UpsolveItem
  showContest: boolean
  actions: ReactNode
  rank?: number
}) {
  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between',
        item.status !== 'pending' && 'opacity-80',
        rank !== undefined && 'animate-rise motion-reduce:animate-none',
      )}
    >
      <div className="flex min-w-0 gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg font-mono text-sm font-semibold',
            rank === undefined
              ? 'bg-secondary text-secondary-foreground'
              : 'bg-primary/10 text-primary',
          )}
        >
          {rank === undefined ? (item.position ?? '•') : rank}
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
              <span className="truncate">
                {item.contest.name}
                {item.position ? ` · ${item.position}` : ''}
              </span>
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

const providerShort = {
  codeforces: 'CF',
  codechef: 'CC',
  leetcode: 'LC',
  cses: 'CSES',
} as const

function ContestHistoryChart({
  history,
}: {
  history: readonly UpsolveHistoryPoint[]
}) {
  const points = [...history].reverse()
  const max = Math.max(1, ...points.map((point) => point.total))
  return (
    <SectionCard
      description="Each bar is one recent contest: solved during it, upsolved after, and still open."
      id="upsolve-history"
      title="Recent contests"
    >
      <ul className="flex min-w-0 items-end gap-2 overflow-x-auto pb-1">
        {points.map((point) => {
          const open = Math.max(
            0,
            point.total - point.solvedInContest - point.upsolved,
          )
          return (
            <li
              aria-label={`${point.name}: ${point.solvedInContest} solved in contest, ${point.upsolved} upsolved, ${open} open`}
              className="flex w-12 shrink-0 flex-col items-center gap-1"
              key={`${point.provider}:${point.contestId}`}
              title={point.name}
            >
              <div className="flex h-20 w-6 flex-col justify-end overflow-hidden rounded bg-secondary">
                <div
                  className="w-full bg-border"
                  style={{ height: `${(open / max) * 100}%` }}
                />
                <div
                  className="w-full bg-primary"
                  style={{ height: `${(point.upsolved / max) * 100}%` }}
                />
                <div
                  className="w-full bg-go"
                  style={{ height: `${(point.solvedInContest / max) * 100}%` }}
                />
              </div>
              <span className="text-[0.7rem] tabular-nums text-foreground">
                {point.solvedInContest + point.upsolved}/{point.total}
              </span>
              <span className="text-[0.65rem] text-muted-foreground">
                {providerShort[point.provider]}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 flex flex-wrap gap-3 text-[0.7rem] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-go" /> Solved in contest
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-primary" /> Upsolved
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-border" /> Open
        </span>
      </p>
    </SectionCard>
  )
}

function UpsolvePage() {
  const { notify } = useNotification()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const upsolveQuery = useUpsolve()
  const updateItem = useUpdateUpsolveItem()
  const setStatus = useSetProblemStatus()
  const [working, setWorking] = useState<string | null>(null)

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
      description="Your next five problems from recent contests: the first unsolved ones of your latest contest and the ones worth revisiting from earlier contests. Solve or skip one and the next best problem, picked for your level, takes its place."
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

  const { queue, contests, history, revisionsDue, linkedProviders } =
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

  const markSolved = (item: UpsolveItem) => {
    setWorking(item.id)
    // The upsolve state works on every platform; where the progress record
    // takes this problem ID, the self-reported solve is recorded there too.
    if (item.provider !== 'leetcode') {
      setStatus.mutate({
        problem: { provider: item.provider, externalId: item.externalId },
        input: { status: 'solved', sourceContext: 'upsolve' },
      })
    }
    updateItem.mutate(
      {
        provider: item.provider,
        externalId: item.externalId,
        state: 'solved',
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: ['mentor', user?.id ?? 'signed-out'],
          })
          notify({
            title: 'Marked solved',
            description: `${item.title} is recorded as solved by you and added to your revision schedule. The next problem joins your queue.`,
            tone: 'success',
          })
        },
        onError: (error) =>
          notify({
            title: 'Status was not saved',
            description: mentorErrorMessage(error, 'Try again shortly.'),
            tone: 'error',
          }),
        onSettled: () => setWorking(null),
      },
    )
  }

  const actionsFor = (item: UpsolveItem) => (
    <ItemActions
      item={item}
      onRestore={() => skip(item, 'pending')}
      onSkip={() => skip(item, 'skipped')}
      onSolved={() => markSolved(item)}
      pending={pending || working === item.id}
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

  return (
    <PageContainer>
      {header}

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
        description={`${UPSOLVE_QUEUE_SIZE} problems at a time. Solve or skip one and the next best one, chosen for your level, joins at the bottom.`}
        id="upsolve-queue"
        title="Up next"
      >
        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your queue is clear: every open problem from your recent contests is
            solved or skipped.
          </p>
        ) : (
          <ol className="grid gap-2">
            {queue.map((item, index) => (
              <ItemRow
                actions={actionsFor(item)}
                item={item}
                key={item.id}
                rank={index + 1}
                showContest
              />
            ))}
          </ol>
        )}
      </SectionCard>

      {history !== undefined && history.length > 0 ? (
        <ContestHistoryChart history={history} />
      ) : null}

      <section
        aria-labelledby="by-contest-heading"
        className="flex min-w-0 flex-col gap-3"
      >
        <h2
          className="text-lg font-semibold text-foreground"
          id="by-contest-heading"
        >
          Latest contests
        </h2>
        <p className="-mt-1 text-sm text-muted-foreground">
          Your most recent contest on each platform. Open one to see all of its
          problems.
        </p>
        {contests.map((contest: UpsolveContest) => (
          <details
            className="group min-w-0 rounded-xl border border-border bg-card"
            key={`${contest.provider}:${contest.contestId}`}
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
                  contest.items.filter(
                    (item) =>
                      item.status === 'upsolved' ||
                      item.status === 'solved_in_contest',
                  ).length
                }
                /{contest.items.length} solved
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
                  The problems of this contest could not be loaded. Sync your
                  platform or try again later.
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
