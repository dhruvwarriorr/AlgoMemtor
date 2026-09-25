import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  UPSOLVE_QUEUE_SIZE,
  type UpsolveContest,
  type UpsolveHistoryPoint,
  type UpsolveItem,
  type UpsolveSummary,
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
import PageContainer from '@/components/layout/PageContainer'
import {
  DoubtHelperIcon,
  SolutionExplorerIcon,
} from '@/components/icons/mentor-icons'
import PageHeader from '@/components/layout/PageHeader'
import { RadialProgress } from '@/components/motion/RadialProgress'
import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { useNotification } from '@/app/useNotification'
import { useAuth } from '@/features/auth/useAuth'
import {
  axisTick,
  chartColors,
  providerColors,
  providerShort,
  shortDay,
  tooltipStyle,
} from '@/features/mentor/chart-theme'
import { ProviderProblemLink } from '@/features/mentor/components/shared'
import {
  ChartCard,
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

// Platform on the first line, contest day on the second, so labels do not
// collide on narrow charts.
function ContestTick({
  x,
  y,
  payload,
}: {
  x?: number
  y?: number
  payload?: { value?: string }
}) {
  const [platform = '', day = ''] = (payload?.value ?? '').split('|')
  return (
    <text
      fill="var(--muted-foreground)"
      fontSize={10}
      textAnchor="middle"
      x={x}
      y={y}
    >
      <tspan dy="0.9em" fontWeight={600} x={x}>
        {platform}
      </tspan>
      <tspan dy="1.25em" x={x}>
        {day}
      </tspan>
    </text>
  )
}

// Stacked bars: for each recent contest, solved during it, upsolved after
// and still open.
function RecentContestsChart({
  history,
  windowDays,
}: {
  history: readonly UpsolveHistoryPoint[]
  windowDays: number
}) {
  const data = [...history].reverse().map((point) => ({
    label: `${providerShort[point.provider]}|${shortDay(point.startsAt)}`,
    name: point.name,
    solved: point.solvedInContest,
    upsolved: point.upsolved,
    open: Math.max(0, point.total - point.solvedInContest - point.upsolved),
  }))
  return (
    <ChartCard
      className="lg:col-span-6"
      description={`Contests of the last ${windowDays} days: solved during it, upsolved after, and still open.`}
      title="Recent contests"
    >
      {data.length === 0 ? (
        <ChartEmpty>No contests in the last {windowDays} days.</ChartEmpty>
      ) : (
        <>
          <div
            aria-label="Recent contests, solved in contest, upsolved and open problems"
            className="h-56 w-full"
            role="img"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                data={data}
                margin={{ top: 6, right: 6, left: -24, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  height={34}
                  interval={0}
                  tick={<ContestTick />}
                  tickLine={false}
                />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                  labelFormatter={(label) =>
                    data.find((point) => point.label === label)?.name ?? label
                  }
                />
                <Bar
                  dataKey="solved"
                  fill={chartColors.solved}
                  name="Solved in contest"
                  radius={[0, 0, 4, 4]}
                  stackId="c"
                />
                <Bar
                  dataKey="upsolved"
                  fill={chartColors.upsolved}
                  name="Upsolved"
                  stackId="c"
                />
                <Bar
                  dataKey="open"
                  fill={chartColors.open}
                  name="Open"
                  radius={[4, 4, 0, 0]}
                  stackId="c"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-go" /> Solved in contest
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-primary" /> Upsolved
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: chartColors.open }}
              />{' '}
              Open
            </span>
          </p>
        </>
      )}
    </ChartCard>
  )
}

// How much of what was left open has been worked through.
function FollowThrough({ summary }: { summary: UpsolveSummary }) {
  const worked = summary.upsolved + summary.pending
  const rate = worked === 0 ? 0 : summary.upsolved / worked
  return (
    <ChartCard
      className="lg:col-span-3"
      description={`Share of problems left open in the last ${summary.windowDays} days' contests that you went back and solved.`}
      title="Follow-through"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <RadialProgress className="size-36" thickness={10} value={rate}>
          <span className="text-center">
            <span className="block font-heading text-3xl font-bold tabular-nums">
              {Math.round(rate * 100)}%
            </span>
            <span className="text-xs text-muted-foreground">upsolved</span>
          </span>
        </RadialProgress>
        <dl className="grid w-full grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-secondary/60 px-2 py-2">
            <dt className="text-xs text-muted-foreground">Upsolved</dt>
            <dd className="font-heading text-lg font-bold tabular-nums">
              {summary.upsolved}
            </dd>
          </div>
          <div className="rounded-lg bg-secondary/60 px-2 py-2">
            <dt className="text-xs text-muted-foreground">Still open</dt>
            <dd className="font-heading text-lg font-bold tabular-nums">
              {summary.pending}
            </dd>
          </div>
        </dl>
      </div>
    </ChartCard>
  )
}

// How many open problems you went back and solved, platform by platform.
function UpsolvedByPlatform({
  summary,
  linkedProviders,
}: {
  summary: UpsolveSummary
  linkedProviders: readonly UpsolveItem['provider'][]
}) {
  // Every linked platform gets a row, so one with nothing left to upsolve
  // still shows up in the comparison.
  const counted = (summary.byProvider ?? []).filter(
    (item) => item.upsolved + item.open > 0,
  )
  const rows = [
    ...counted,
    ...linkedProviders
      // CSES has no contests, so it has nothing to upsolve.
      .filter((provider) => provider !== 'cses')
      .filter((provider) => !counted.some((item) => item.provider === provider))
      .map((provider) => ({ provider, upsolved: 0, open: 0 })),
  ]
  const withUpsolves = rows.filter((item) => item.upsolved > 0)
  return (
    <ChartCard
      className="lg:col-span-3"
      description={`Problems from the last ${summary.windowDays} days' contests you upsolved, by platform.`}
      title="Upsolved by platform"
    >
      {rows.length === 0 ? (
        <ChartEmpty>Nothing to compare yet.</ChartEmpty>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <div className="relative mx-auto h-32 w-32">
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  data={
                    withUpsolves.length > 0
                      ? withUpsolves
                      : [{ provider: 'none', upsolved: 1 }]
                  }
                  dataKey="upsolved"
                  innerRadius={38}
                  nameKey="provider"
                  outerRadius={60}
                  paddingAngle={withUpsolves.length > 1 ? 3 : 0}
                  stroke="none"
                >
                  {withUpsolves.length > 0 ? (
                    withUpsolves.map((item) => (
                      <Cell
                        fill={providerColors[item.provider]}
                        key={item.provider}
                      />
                    ))
                  ) : (
                    <Cell fill="var(--muted)" />
                  )}
                </Pie>
                {withUpsolves.length > 0 ? (
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [
                      `${String(value)} upsolved`,
                      providerLabels[name as UpsolveItem['provider']] ??
                        String(name),
                    ]}
                  />
                ) : null}
              </PieChart>
            </ResponsiveContainer>
            <span className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <span>
                <span className="block font-heading text-2xl font-bold tabular-nums">
                  {summary.upsolved}
                </span>
                <span className="block text-[0.65rem] text-muted-foreground">
                  upsolved
                </span>
              </span>
            </span>
          </div>
          <ul className="mt-auto grid gap-2">
            {rows.map((item) => {
              const total = item.upsolved + item.open
              return (
                <li className="grid gap-1" key={item.provider}>
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <ProviderLogo
                        className="size-4"
                        provider={item.provider}
                      />
                      {providerLabels[item.provider]}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {total === 0
                        ? 'Nothing left open'
                        : `${item.upsolved}/${total}`}
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${total === 0 ? 0 : (item.upsolved / total) * 100}%`,
                        backgroundColor: providerColors[item.provider],
                      }}
                    />
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </ChartCard>
  )
}

function QueueRow({
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
    <div className="group flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-soft lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 gap-4">
        <span
          aria-hidden="true"
          className="mesh-card grid size-11 shrink-0 place-items-center rounded-xl font-heading text-lg font-bold text-white"
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <ProviderProblemLink
            className="text-base"
            href={item.canonicalUrl}
            provider={item.provider}
            title={item.title}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <ProviderLogo className="size-4" provider={item.provider} />
              <span className="truncate">{item.contest.name}</span>
            </span>
            {item.position ? (
              <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono font-semibold text-secondary-foreground">
                {item.position}
              </span>
            ) : null}
            {item.rating !== undefined ? (
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-medium tabular-nums',
                  ratingTone(item.rating),
                )}
              >
                {item.rating}
              </span>
            ) : null}
            {item.contestOutcome === 'attempted' ? (
              <span className="rounded-md bg-sun-soft px-1.5 py-0.5 font-medium text-sun-foreground">
                Attempted
                {item.contestWrongAttempts > 0
                  ? `, ${item.contestWrongAttempts} wrong`
                  : ''}
              </span>
            ) : null}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-sm text-foreground/85">
            <Sparkles
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-primary"
            />
            {item.priorityReason}
          </p>
          {item.tags.length > 0 ? (
            <p className="mt-1 truncate pl-5 text-xs text-muted-foreground">
              {item.tags.slice(0, 4).map(humanTopic).join(', ')}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 lg:max-w-[26rem] lg:justify-end">
        <Link
          className={buttonVariants({ size: 'sm' })}
          to={mentorToolPath('doubt_helper', item.canonicalUrl)}
        >
          <DoubtHelperIcon aria-hidden="true" /> Get hints
        </Link>
        <Link
          className={buttonVariants({ size: 'sm', variant: 'outline' })}
          to={mentorToolPath('solution_explorer', item.canonicalUrl)}
        >
          <SolutionExplorerIcon aria-hidden="true" /> Approaches
        </Link>
        {item.editorialUrl ? (
          <a
            className={buttonVariants({ size: 'sm', variant: 'ghost' })}
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
            {UPSOLVE_QUEUE_SIZE} problems at a time. Solve or skip one and the
            next best one, chosen for your level, joins at the bottom.
          </p>
        </div>
      </div>
      {queue.length === 0 ? (
        <ChartEmpty>
          Your queue is clear: every open problem from your recent contests is
          solved or skipped.
        </ChartEmpty>
      ) : (
        // minmax(0, 1fr): a long contest name or tag list truncates instead
        // of widening the column past a phone screen.
        <ol className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
          {/* Solved or skipped problems leave; the replacement enters at the
              bottom, so the change reads as the queue moving up. */}
          <AnimatePresence initial={false}>
            {queue.map((item, index) => (
              <motion.li
                animate={{ opacity: 1, y: 0 }}
                className="min-w-0"
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: 24, transition: { duration: 0.2 } }
                }
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                key={item.id}
                layout={!reduceMotion}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                <QueueRow
                  item={item}
                  onSkip={() => onSkip(item)}
                  onSolved={() => onSolved(item)}
                  pending={busyId !== null}
                  rank={index + 1}
                />
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
  const solved = contest.items.filter(
    (item) => item.status === 'solved_in_contest' || item.status === 'upsolved',
  ).length
  return (
    <button
      aria-expanded={open}
      className={cn(
        'animate-rise flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-[border-color,box-shadow] hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        open ? 'border-primary' : 'border-border',
      )}
      onClick={onToggle}
      type="button"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <ProviderLogo className="size-6" provider={contest.provider} />
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
        <SignedDelta value={contest.ratingChange} />
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <ParticipationBadge mode={contest.participation} />
        <span className="text-xs text-muted-foreground">
          {solved}/{contest.items.length} solved
        </span>
      </span>
      {contest.items.length > 0 ? (
        <span aria-hidden="true" className="flex flex-wrap gap-1">
          {contest.items.map((item) => (
            <span
              className={cn(
                'grid h-7 min-w-7 place-items-center rounded-md px-1 font-mono text-[0.7rem] font-semibold',
                statusCell[item.status],
              )}
              key={item.id}
              title={`${item.position ?? ''} ${item.title}: ${statusLabel[item.status]}`}
            >
              {item.position ?? '•'}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">
          The problem list could not be loaded.
        </span>
      )}
      <span className="text-xs font-medium text-primary">
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
    <div className="animate-rise rounded-xl border border-border bg-card p-4 sm:p-5">
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
            className="flex min-w-0 items-center gap-3 rounded-lg bg-secondary/40 px-3 py-2.5"
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
    <PageHeader
      action={
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
      description="Your next five problems from recent contests, starting with the first unsolved ones of your latest contests."
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
    <PageContainer>
      {header}

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <RecentContestsChart
          history={history ?? []}
          windowDays={summary.windowDays}
        />
        <FollowThrough summary={summary} />
        <UpsolvedByPlatform
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

export default UpsolvePage
