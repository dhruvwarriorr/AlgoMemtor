import { useState } from 'react'
import { Link } from '@/lib/router'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  UPSOLVE_QUEUE_SIZE,
  type UpsolveContest,
  type UpsolveItem,
} from '@algomemtor/shared-contracts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import {
  ArrowUpRight,
  Check,
  RefreshCw,
  Sparkles,
  Swords,
  Target,
  X,
} from '@/components/icons/algo-icons'
import { PanelStyle } from '@/components/kit/Panel'
import PageContainer from '@/components/layout/PageContainer'
import {
  DoubtHelperIcon,
  SolutionExplorerIcon,
} from '@/components/icons/mentor-icons'
import { PageHero } from '@/components/kit/PageHero'
import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { useNotification } from '@/providers/useNotification'
import { useAuth } from '@/features/auth/useAuth'
import { chartColors, providerColors } from '@/features/mentor/chart-theme'
import { ProviderProblemLink } from '@/features/mentor/components/shared'
import {
  ContestTrail,
  FollowThroughCard,
} from '@/features/mentor/components/upsolve-visuals'
import {
  ChartEmpty,
  ParticipationBadge,
  SignedDelta,
} from '@/features/mentor/components/visuals'
import {
  formatDateTime,
  humanTopic,
  mentorErrorMessage,
  providerLabels,
} from '@/features/mentor/format'
import { mentorToolPath } from '@/features/mentor/feature-routes'
import {
  useRefreshUpsolve,
  useUpdateUpsolveItem,
  useUpsolve,
} from '@/features/mentor/hooks'
import { useSetProblemStatus } from '@/features/progress/hooks/useProgress'
import { cn } from '@/lib/utils'

// Colors a problem cell by where it stands.
const statusCell: Record<UpsolveItem['status'], string> = {
  solved_in_contest: 'bg-go text-white',
  upsolved: 'bg-primary text-primary-foreground',
  pending: 'border border-border bg-background text-foreground',
  skipped: 'border border-dashed border-border text-muted-foreground',
}

const statusLabel: Record<UpsolveItem['status'], string> = {
  solved_in_contest: 'Solved in contest',
  upsolved: 'Upsolved',
  pending: 'Open',
  skipped: 'Skipped',
}

function ratingTone(rating: number | undefined) {
  if (rating === undefined) return 'bg-secondary text-secondary-foreground'
  if (rating < 1400) return 'bg-go-soft text-go-foreground'
  if (rating < 2000) return 'bg-primary/10 text-primary'
  return 'bg-danger-soft text-danger-foreground'
}

function QueueMeta({ item }: { item: UpsolveItem }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <ProviderLogo className="size-4" provider={item.provider} />
        <span className="truncate">{item.contest.name}</span>
      </span>
      {item.position ? (
        <span className="rounded-full bg-secondary px-2 py-0.5 font-mono font-semibold text-secondary-foreground">
          {item.position}
        </span>
      ) : null}
      {item.rating !== undefined ? (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 font-medium tabular-nums',
            ratingTone(item.rating),
          )}
        >
          {item.rating}
        </span>
      ) : null}
      {item.contestOutcome === 'attempted' ? (
        <span className="rounded-full bg-[#f59e0b]/12 px-2 py-0.5 font-medium text-[#b45309] dark:text-[#fcd34d]">
          Attempted
          {item.contestWrongAttempts > 0
            ? `, ${item.contestWrongAttempts} wrong`
            : ''}
        </span>
      ) : null}
    </div>
  )
}

// The first problem in the queue: the one to do now, given the most room.
function NowCard({
  item,
  pending,
  onSkip,
  onSolved,
}: {
  item: UpsolveItem
  pending: boolean
  onSkip: () => void
  onSolved: () => void
}) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="beam-frame relative flex min-w-0 flex-col gap-5 overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6 lg:flex-row lg:items-center">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--acc)_18%,transparent),transparent)] blur-2xl"
      />
      <div className="relative flex min-w-0 flex-1 gap-4 sm:gap-5">
        <span className="relative grid size-16 shrink-0 place-items-center">
          {reduceMotion ? null : (
            <motion.span
              animate={{ scale: [1, 1.45], opacity: [0.4, 0] }}
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-acc"
              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
          <span className="relative grid size-16 place-items-center rounded-full bg-linear-to-br from-acc to-[color-mix(in_oklab,var(--acc)_55%,var(--acc-2))] text-white dark:text-[#0b0c0e]">
            <span className="text-center leading-none">
              <span className="block text-[0.6rem] font-semibold tracking-wider uppercase opacity-80">
                Now
              </span>
              <span className="font-heading text-2xl font-bold">1</span>
            </span>
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <ProviderProblemLink
            className="text-xl"
            href={item.canonicalUrl}
            provider={item.provider}
            title={item.title}
          />
          <div className="mt-2">
            <QueueMeta item={item} />
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-sm text-foreground/85">
            <Sparkles
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-acc"
            />
            {item.priorityReason}
          </p>
          {item.tags.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5 pl-5">
              {item.tags.slice(0, 4).map((tag) => (
                <li
                  className="rounded-full bg-acc-soft px-2 py-0.5 text-[0.7rem] font-medium text-acc-ink"
                  key={tag}
                >
                  {humanTopic(tag)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <div className="relative flex flex-wrap items-center gap-2 lg:w-72 lg:flex-col lg:items-stretch">
        <Link
          className={buttonVariants()}
          to={mentorToolPath('doubt_helper', item.canonicalUrl)}
        >
          <DoubtHelperIcon aria-hidden="true" /> Get hints
        </Link>
        <div className="flex flex-wrap gap-2 lg:grid lg:grid-cols-2">
          <Link
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
            to={mentorToolPath('solution_explorer', item.canonicalUrl)}
          >
            <SolutionExplorerIcon aria-hidden="true" /> Approaches
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
        </div>
        <div className="flex gap-2 lg:grid lg:grid-cols-2">
          <Button
            className="text-go-foreground hover:bg-go-soft dark:text-go"
            disabled={pending}
            onClick={onSolved}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Check aria-hidden="true" /> Solved it
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
      </div>
    </div>
  )
}

// A problem waiting its turn: compact, with its actions as icons.
function QueueTile({
  item,
  rank,
  pending,
  onSkip,
  onSolved,
}: {
  item: UpsolveItem
  rank: number
  pending: boolean
  onSkip: () => void
  onSolved: () => void
}) {
  return (
    <div className="group flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lift">
      <div className="flex items-center justify-between gap-2">
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full border border-border bg-background font-heading text-sm font-bold text-foreground transition-colors group-hover:border-acc group-hover:text-acc"
        >
          {rank}
        </span>
        <span className="flex items-center gap-1.5">
          {item.position ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-secondary-foreground">
              {item.position}
            </span>
          ) : null}
          {item.rating !== undefined ? (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                ratingTone(item.rating),
              )}
            >
              {item.rating}
            </span>
          ) : null}
        </span>
      </div>
      <div className="min-w-0">
        <ProviderProblemLink
          className="text-sm"
          href={item.canonicalUrl}
          provider={item.provider}
          title={item.title}
        />
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <ProviderLogo
            className="size-3.5 shrink-0"
            provider={item.provider}
          />
          <span className="truncate">{item.contest.name}</span>
        </p>
      </div>
      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
        {item.priorityReason}
      </p>
      <div className="mt-auto flex items-center gap-1 border-t border-border pt-3">
        <Link
          aria-label={`Get hints for ${item.title}`}
          className={buttonVariants({ size: 'icon-sm', variant: 'ghost' })}
          title="Get hints"
          to={mentorToolPath('doubt_helper', item.canonicalUrl)}
        >
          <DoubtHelperIcon aria-hidden="true" />
        </Link>
        <Link
          aria-label={`See approaches for ${item.title}`}
          className={buttonVariants({ size: 'icon-sm', variant: 'ghost' })}
          title="Approaches"
          to={mentorToolPath('solution_explorer', item.canonicalUrl)}
        >
          <SolutionExplorerIcon aria-hidden="true" />
        </Link>
        {item.editorialUrl ? (
          <a
            aria-label={`Editorial for ${item.title} (opens on ${providerLabels[item.provider]})`}
            className={buttonVariants({ size: 'icon-sm', variant: 'ghost' })}
            href={item.editorialUrl}
            rel="noopener noreferrer"
            target="_blank"
            title="Editorial"
          >
            <ArrowUpRight aria-hidden="true" />
          </a>
        ) : null}
        <span className="ml-auto flex gap-1">
          <Button
            aria-label={`Mark ${item.title} solved`}
            className="text-go-foreground hover:bg-go-soft dark:text-go"
            disabled={pending}
            onClick={onSolved}
            size="icon-sm"
            title="Mark solved"
            type="button"
            variant="ghost"
          >
            <Check aria-hidden="true" />
          </Button>
          <Button
            aria-label={`Skip ${item.title}`}
            disabled={pending}
            onClick={onSkip}
            size="icon-sm"
            title="Skip"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </span>
      </div>
    </div>
  )
}

function UpNext({
  queue,
  busyId,
  onSkip,
  onSolved,
}: {
  queue: readonly UpsolveItem[]
  busyId: string | null
  onSkip: (item: UpsolveItem) => void
  onSolved: (item: UpsolveItem) => void
}) {
  const reduceMotion = useReducedMotion()
  return (
    <section
      aria-labelledby="up-next-heading"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            className="text-xl font-semibold text-foreground"
            id="up-next-heading"
          >
            Up next
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {UPSOLVE_QUEUE_SIZE} at a time. Clear one and the next best joins.
          </p>
        </div>
        <p
          aria-label={`${queue.length} of ${UPSOLVE_QUEUE_SIZE} queue slots filled`}
          className="flex items-center gap-1.5"
        >
          {Array.from({ length: UPSOLVE_QUEUE_SIZE }, (_, slot) => (
            <motion.span
              animate={{
                scale: slot < queue.length ? 1 : 0.7,
                opacity: slot < queue.length ? 1 : 0.35,
              }}
              aria-hidden="true"
              className={cn(
                'h-2 rounded-full',
                slot === 0 ? 'w-6 bg-acc' : 'w-2 bg-foreground/60',
              )}
              key={slot}
            />
          ))}
        </p>
      </div>
      {queue.length === 0 ? (
        <ChartEmpty>
          Your queue is clear: every open problem from your recent contests is
          solved or skipped.
        </ChartEmpty>
      ) : (
        // minmax(0, 1fr): a long contest name or tag list truncates instead
        // of widening the column past a phone screen.
        <ol className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* A cleared problem leaves, the next one is promoted into the
              Now card and the replacement joins at the end. */}
          <AnimatePresence initial={false} mode="popLayout">
            {queue.map((item, index) => (
              <motion.li
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn('min-w-0', index === 0 && 'col-span-full')}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.92, transition: { duration: 0.2 } }
                }
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                key={item.id}
                layout={!reduceMotion}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                {index === 0 ? (
                  <NowCard
                    item={item}
                    onSkip={() => onSkip(item)}
                    onSolved={() => onSolved(item)}
                    pending={busyId !== null}
                  />
                ) : (
                  <QueueTile
                    item={item}
                    onSkip={() => onSkip(item)}
                    onSolved={() => onSolved(item)}
                    pending={busyId !== null}
                    rank={index + 1}
                  />
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </section>
  )
}

function ContestCard({
  contest,
  open,
  onToggle,
}: {
  contest: UpsolveContest
  open: boolean
  onToggle: () => void
}) {
  const reduceMotion = useReducedMotion()
  const solved = contest.items.filter(
    (item) => item.status === 'solved_in_contest' || item.status === 'upsolved',
  ).length
  const share = contest.items.length === 0 ? 0 : solved / contest.items.length
  const radius = 16
  const circumference = 2 * Math.PI * radius
  return (
    <button
      aria-expanded={open}
      className={cn(
        'animate-rise relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-4 pt-5 text-left shadow-soft transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        open
          ? 'border-acc shadow-[0_0_0_4px_color-mix(in_oklab,var(--acc)_14%,transparent)]'
          : 'border-border',
      )}
      onClick={onToggle}
      type="button"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${providerColors[contest.provider]}, transparent)`,
        }}
      />
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary">
            <ProviderLogo className="size-5" provider={contest.provider} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">
              {contest.name}
            </span>
            <span className="block text-xs text-muted-foreground">
              {contest.startsAt
                ? formatDateTime(contest.startsAt, false)
                : providerLabels[contest.provider]}
              {contest.rank !== undefined ? `, rank ${contest.rank}` : ''}
            </span>
          </span>
        </span>
        <span className="relative grid size-10 shrink-0 place-items-center">
          <svg
            aria-hidden="true"
            className="absolute inset-0 -rotate-90"
            viewBox="0 0 40 40"
          >
            <circle
              cx="20"
              cy="20"
              fill="none"
              r={radius}
              stroke="color-mix(in oklab, var(--muted-foreground) 18%, transparent)"
              strokeWidth="4"
            />
            <motion.circle
              animate={{
                strokeDasharray: `${share * circumference} ${circumference}`,
              }}
              cx="20"
              cy="20"
              fill="none"
              initial={
                reduceMotion ? false : { strokeDasharray: `0 ${circumference}` }
              }
              r={radius}
              stroke={chartColors.solved}
              strokeLinecap="round"
              strokeWidth="4"
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
          <span className="font-mono text-[0.62rem] font-bold text-foreground">
            {solved}/{contest.items.length}
          </span>
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <ParticipationBadge mode={contest.participation} />
        <SignedDelta value={contest.ratingChange} />
      </span>
      {contest.items.length > 0 ? (
        <span aria-hidden="true" className="flex flex-wrap gap-1">
          {contest.items.map((item, index) => (
            <motion.span
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                'grid h-7 min-w-7 place-items-center rounded-md px-1 font-mono text-[0.7rem] font-semibold',
                statusCell[item.status],
              )}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
              key={item.id}
              title={`${item.position ?? ''} ${item.title}: ${statusLabel[item.status]}`}
              transition={{
                type: 'spring',
                stiffness: 420,
                damping: 20,
                delay: 0.1 + index * 0.04,
              }}
            >
              {item.position ?? '•'}
            </motion.span>
          ))}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">
          The problem list could not be loaded.
        </span>
      )}
      <span className="text-xs font-medium text-acc">
        {open ? 'Hide problems' : 'Show all problems'}
      </span>
    </button>
  )
}

function ContestProblems({
  contest,
  busy,
  onSkip,
  onRestore,
  onSolved,
}: {
  contest: UpsolveContest
  busy: boolean
  onSkip: (item: UpsolveItem) => void
  onRestore: (item: UpsolveItem) => void
  onSolved: (item: UpsolveItem) => void
}) {
  return (
    <div className="animate-rise rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground">
          <ProviderProblemLink
            href={contest.canonicalUrl}
            provider={contest.provider}
            title={contest.name}
          />
        </h3>
        {contest.coverageNote ? (
          <p className="text-xs text-muted-foreground">
            {contest.coverageNote}
          </p>
        ) : null}
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {contest.items.map((item) => (
          <li
            className="flex min-w-0 items-center gap-3 rounded-xl bg-secondary/40 px-3 py-2.5"
            key={item.id}
          >
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-md font-mono text-xs font-semibold',
                statusCell[item.status],
              )}
            >
              {item.position ?? '•'}
            </span>
            <span className="min-w-0 flex-1">
              <ProviderProblemLink
                className="text-sm"
                href={item.canonicalUrl}
                provider={item.provider}
                title={item.title}
              />
              <span className="block text-xs text-muted-foreground">
                {statusLabel[item.status]}
                {item.status === 'upsolved' && item.statusSource === 'manual'
                  ? ' (marked by you)'
                  : ''}
                {item.rating !== undefined ? `, rated ${item.rating}` : ''}
              </span>
            </span>
            {item.status === 'pending' ? (
              <span className="flex shrink-0 gap-1">
                <Link
                  aria-label={`Get hints for ${item.title}`}
                  className={buttonVariants({ size: 'sm', variant: 'ghost' })}
                  to={mentorToolPath('doubt_helper', item.canonicalUrl)}
                >
                  <DoubtHelperIcon aria-hidden="true" />
                </Link>
                <Button
                  aria-label={`Mark ${item.title} solved`}
                  disabled={busy}
                  onClick={() => onSolved(item)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Check aria-hidden="true" />
                </Button>
                <Button
                  aria-label={`Skip ${item.title}`}
                  disabled={busy}
                  onClick={() => onSkip(item)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                </Button>
              </span>
            ) : item.status === 'skipped' ? (
              <Button
                disabled={busy}
                onClick={() => onRestore(item)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Restore
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function UpsolvePage() {
  const { notify } = useNotification()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const upsolveQuery = useUpsolve()
  const refresh = useRefreshUpsolve()
  const updateItem = useUpdateUpsolveItem()
  const setStatus = useSetProblemStatus()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openContest, setOpenContest] = useState<string | null>(null)

  const header = (
    <PageHero
      actions={
        <Button
          disabled={refresh.isPending || upsolveQuery.isFetching}
          onClick={() =>
            refresh.mutate(undefined, {
              onError: (error) =>
                notify({
                  title: 'Refresh failed',
                  description: mentorErrorMessage(error, 'Try again shortly.'),
                  tone: 'error',
                }),
            })
          }
          type="button"
          variant="outline"
        >
          <RefreshCw
            aria-hidden="true"
            className={cn(
              refresh.isPending && 'animate-spin motion-reduce:animate-none',
            )}
          />
          {refresh.isPending ? 'Syncing platforms' : 'Refresh'}
        </Button>
      }
      info="Your next five problems from recent contests, starting with the first unsolved ones of your latest contests. A problem counts as upsolved only when it was solved after the contest ended."
      subtitle="Close the loop on the contests you just took."
      title="Upsolve"
    />
  )

  if (upsolveQuery.isPending) {
    return (
      <PageContainer accent="green" className="gap-6">
        {header}
        <PageSkeleton label="Building your upsolve queue" rows={5} />
      </PageContainer>
    )
  }
  if (upsolveQuery.isError) {
    return (
      <PageContainer accent="green" className="gap-6">
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

  const { queue, contests, history, summary, linkedProviders } =
    upsolveQuery.data.data

  const done = () => setBusyId(null)
  const skip = (item: UpsolveItem, state: 'skipped' | 'pending') => {
    setBusyId(item.id)
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
        onSettled: done,
      },
    )
  }

  const markSolved = (item: UpsolveItem) => {
    setBusyId(item.id)
    // The upsolve state works on every platform; where the progress record
    // takes this problem ID, the self-reported solve is recorded there too.
    if (item.provider !== 'leetcode') {
      setStatus.mutate({
        problem: { provider: item.provider, externalId: item.externalId },
        input: { status: 'solved', sourceContext: 'upsolve' },
      })
    }
    updateItem.mutate(
      { provider: item.provider, externalId: item.externalId, state: 'solved' },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: ['mentor', user?.id ?? 'signed-out'],
          })
          notify({
            title: 'Marked solved',
            description: `${item.title} is recorded as solved by you. The next problem joins your queue.`,
            tone: 'success',
          })
        },
        onError: (error) =>
          notify({
            title: 'Status was not saved',
            description: mentorErrorMessage(error, 'Try again shortly.'),
            tone: 'error',
          }),
        onSettled: done,
      },
    )
  }

  if (contests.length === 0) {
    return (
      <PageContainer accent="green" className="gap-6">
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
              : 'Take part in a contest and sync your platform. Problems you miss will appear here.'
          }
          title="No contests to upsolve yet"
        />
      </PageContainer>
    )
  }

  const selected = contests.find(
    (contest) => `${contest.provider}:${contest.contestId}` === openContest,
  )

  return (
    <PageContainer accent="green" className="gap-6">
      {header}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <ContestTrail history={history ?? []} windowDays={summary.windowDays} />
        <FollowThroughCard
          linkedProviders={linkedProviders}
          summary={summary}
        />
      </div>

      <UpNext
        busyId={busyId}
        onSkip={(item) => skip(item, 'skipped')}
        onSolved={markSolved}
        queue={queue}
      />

      <section
        aria-labelledby="latest-contests-heading"
        className="flex min-w-0 flex-col gap-3"
      >
        <div>
          <h2
            className="inline-flex items-center gap-2 text-xl font-semibold text-foreground"
            id="latest-contests-heading"
          >
            <Swords aria-hidden="true" className="size-5 text-primary" />
            Latest contests
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your most recent contest on each platform.
          </p>
        </div>
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {contests.map((contest) => {
            const key = `${contest.provider}:${contest.contestId}`
            return (
              <ContestCard
                contest={contest}
                key={key}
                onToggle={() =>
                  setOpenContest((current) => (current === key ? null : key))
                }
                open={openContest === key}
              />
            )
          })}
        </div>
        {selected !== undefined ? (
          <ContestProblems
            busy={busyId !== null}
            contest={selected}
            onRestore={(item) => skip(item, 'pending')}
            onSkip={(item) => skip(item, 'skipped')}
            onSolved={markSolved}
          />
        ) : null}
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Target aria-hidden="true" className="size-3.5" />
          Codeforces rounds you took part in unrated, or worked on right after
          they ended, count as contests here.
        </p>
      </section>
    </PageContainer>
  )
}

function UpsolvePageWithPanels() {
  return (
    <PanelStyle variant="soft">
      <UpsolvePage />
    </PanelStyle>
  )
}

export default UpsolvePageWithPanels
