import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useSearchParams } from '@/lib/router'
import {
  ExternalContestSchema,
  LinkableProviderSchema,
  type ExternalContest,
  type ExternalContestsQuery,
} from '@algomemtor/shared-contracts'

import PageContainer from '@/components/layout/PageContainer'
import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { PageHero } from '@/components/kit/PageHero'
import { SegmentedControl } from '@/components/kit/SegmentedControl'
import { SpotlightCard } from '@/components/kit/surfaces'
import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'
import {
  contestProviderOptions,
  providerLabels,
} from '@/features/platform/components/provider-labels'
import { useContests } from '@/features/platform/hooks'
import { cn } from '@/lib/utils'

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

function formatTime(value: string | undefined) {
  if (value === undefined) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

// The current time, ticking once per `interval` milliseconds.
function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval)
    return () => window.clearInterval(timer)
  }, [interval])
  return now
}

function splitDuration(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000))
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

function relativeStart(startsAt: string | undefined, now: number) {
  if (startsAt === undefined) return undefined
  const delta = new Date(startsAt).getTime() - now
  if (delta <= 0) return undefined
  const { days, hours, minutes } = splitDuration(delta)
  if (days > 0) return `in ${days}d ${hours}h`
  if (hours > 0) return `in ${hours}h ${minutes}m`
  return `in ${minutes}m`
}

function CountdownDigit({ value, label }: { value: number; label: string }) {
  const reduceMotion = useReducedMotion()
  const text = String(value).padStart(2, '0')
  return (
    <div className="flex flex-col items-center">
      <span className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-xl border border-white/15 bg-white/10 font-mono text-2xl font-bold text-white tabular-nums backdrop-blur sm:h-16 sm:w-16 sm:text-3xl">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: -18, opacity: 0 }}
            initial={reduceMotion ? { opacity: 0 } : { y: 18, opacity: 0 }}
            key={text}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="mt-1.5 text-[0.62rem] font-medium tracking-[0.12em] text-white/60 uppercase">
        {label}
      </span>
    </div>
  )
}

// The soonest upcoming contest, counting down.
function NextContest({ contest }: { contest: ExternalContest }) {
  const now = useNow()
  const start = contest.startsAt ? new Date(contest.startsAt).getTime() : now
  const parts = splitDuration(start - now)
  return (
    <div className="relative isolate overflow-hidden rounded-2xl mesh-card p-5 sm:p-6">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(90%_80%_at_100%_0%,rgb(244_63_94/0.45),transparent_60%)]"
      />
      <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-medium tracking-wide text-white/70 uppercase">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#fb7185] motion-reduce:hidden" />
              <span className="relative size-2 rounded-full bg-[#fb7185]" />
            </span>
            Next up · {providerLabels[contest.provider]}
          </p>
          <h2 className="mt-2 text-2xl leading-tight font-semibold text-white sm:text-3xl">
            <a
              className="underline decoration-white/30 underline-offset-4 hover:decoration-white focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
              href={contest.canonicalUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {contest.name}
            </a>
          </h2>
          <p className="mt-2 text-sm text-white/70">
            {formatDate(contest.startsAt)}
            {contest.durationSeconds !== undefined
              ? ` · ${Math.round(contest.durationSeconds / 60)} minutes`
              : ''}
          </p>
        </div>
        <div
          aria-label={`Starts in ${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes`}
          className="flex gap-2 sm:gap-3"
          role="timer"
        >
          <CountdownDigit label="Days" value={parts.days} />
          <CountdownDigit label="Hours" value={parts.hours} />
          <CountdownDigit label="Min" value={parts.minutes} />
          <CountdownDigit label="Sec" value={parts.seconds} />
        </div>
      </div>
    </div>
  )
}

const providerDot: Record<ExternalContest['provider'], string> = {
  codeforces: '#2d6cdf',
  codechef: '#8a7446',
  leetcode: '#f2b84b',
  cses: '#14a3a3',
}

// Local midnight at the start of the day containing `time`.
function startOfLocalDay(time: number) {
  const day = new Date(time)
  day.setHours(0, 0, 0, 0)
  return day
}

const localDayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

const CHIPS_PER_DAY = 3

// The next seven days as a calendar: one dated column per local day, each
// contest a chip in the day it starts, in start order.
function WeekCalendar({
  contests,
  now,
}: {
  contests: readonly ExternalContest[]
  now: number
}) {
  const reduceMotion = useReducedMotion()
  const origin = startOfLocalDay(now)
  // Calendar arithmetic, not 24-hour steps, so DST changes keep dates right.
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(origin)
    day.setDate(origin.getDate() + index)
    return day
  })
  const byDay = new Map<string, ExternalContest[]>(
    days.map((day) => [localDayKey(day), []]),
  )
  for (const contest of contests) {
    if (contest.startsAt === undefined) continue
    byDay.get(localDayKey(new Date(contest.startsAt)))?.push(contest)
  }
  for (const list of byDay.values()) {
    list.sort(
      (a, b) =>
        new Date(a.startsAt ?? 0).getTime() -
        new Date(b.startsAt ?? 0).getTime(),
    )
  }
  const total = [...byDay.values()].reduce((sum, list) => sum + list.length, 0)
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
  const monthDay = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  })
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Next 7 days</p>
        <p className="font-mono text-xs text-muted-foreground">
          {total} contest{total === 1 ? '' : 's'}
        </p>
      </div>
      <ol
        aria-label="Contests in the next seven days"
        className="mt-3 grid min-w-0 flex-1 grid-cols-7 gap-1"
      >
        {days.map((day, dayIndex) => {
          const list = byDay.get(localDayKey(day)) ?? []
          const today = dayIndex === 0
          return (
            <li
              aria-label={`${monthDay.format(day)}: ${list.length} contest${list.length === 1 ? '' : 's'}`}
              className={cn(
                'flex min-w-0 flex-col gap-1 rounded-lg border p-1',
                today
                  ? 'border-[color-mix(in_oklab,var(--primary)_45%,var(--border))] bg-primary/5'
                  : 'border-border/70',
              )}
              key={localDayKey(day)}
            >
              <span className="flex flex-col items-center leading-none">
                <span className="font-mono text-[0.6rem] text-muted-foreground uppercase">
                  {today ? 'Today' : weekday.format(day)}
                </span>
                <span
                  className={cn(
                    'mt-0.5 font-heading text-sm font-bold tabular-nums',
                    today ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {day.getDate()}
                </span>
              </span>
              <ul className="flex min-w-0 flex-col gap-1">
                {list.slice(0, CHIPS_PER_DAY).map((contest, index) => (
                  <motion.li
                    animate={{ opacity: 1, y: 0 }}
                    className="min-w-0"
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    key={`${contest.provider}:${contest.externalId}`}
                    transition={{
                      delay: 0.04 * dayIndex + 0.05 * index,
                      duration: 0.4,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <a
                      className={cn(
                        'block min-w-0 rounded-md px-1 py-0.5 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        // Already over today: still listed, but quieter.
                        contest.status === 'finished' && 'opacity-55',
                      )}
                      href={contest.canonicalUrl}
                      rel="noopener noreferrer"
                      style={{
                        background: `color-mix(in oklab, ${providerDot[contest.provider]} 20%, transparent)`,
                        boxShadow: `inset 2px 0 0 ${providerDot[contest.provider]}`,
                      }}
                      target="_blank"
                      title={`${contest.name} on ${providerLabels[contest.provider]} · ${formatDate(contest.startsAt)}`}
                    >
                      <span className="block font-mono text-[0.6rem] text-muted-foreground tabular-nums">
                        {formatTime(contest.startsAt)}
                      </span>
                      <span className="block truncate text-[0.66rem] font-medium text-foreground">
                        {contest.name}
                      </span>
                    </a>
                  </motion.li>
                ))}
                {list.length > CHIPS_PER_DAY ? (
                  <li className="px-1 text-[0.6rem] text-muted-foreground">
                    +{list.length - CHIPS_PER_DAY} more
                  </li>
                ) : null}
              </ul>
            </li>
          )
        })}
      </ol>
      {total === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Nothing scheduled in the next seven days.
        </p>
      ) : null}
    </div>
  )
}

function ContestCard({
  contest,
  index,
  now,
}: {
  contest: ExternalContest
  index: number
  now: number
}) {
  const reduceMotion = useReducedMotion()
  const start = contest.startsAt ? new Date(contest.startsAt) : undefined
  const soon = relativeStart(contest.startsAt, now)
  const running = contest.status === 'running'
  return (
    <motion.li
      animate={{ opacity: 1, y: 0 }}
      className="min-w-0"
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      transition={{
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
        delay: Math.min(index, 8) * 0.04,
      }}
    >
      <SpotlightCard className="flex h-full min-w-0 gap-4 p-4 sm:p-5">
        <div
          aria-hidden="true"
          className="flex w-16 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background text-center"
        >
          <span
            className="py-0.5 font-mono text-[0.62rem] font-bold tracking-widest text-white uppercase"
            style={{ background: providerDot[contest.provider] }}
          >
            {start
              ? new Intl.DateTimeFormat(undefined, { month: 'short' }).format(
                  start,
                )
              : '—'}
          </span>
          <span className="grid flex-1 place-items-center py-1 font-heading text-2xl leading-none font-bold text-foreground">
            {start ? start.getDate() : '?'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
              <ProviderLogo className="size-3.5" provider={contest.provider} />
              {providerLabels[contest.provider]}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold',
                running
                  ? 'bg-danger-soft text-danger-foreground'
                  : contest.status === 'upcoming'
                    ? 'bg-acc-soft text-acc-ink'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {running ? (
                <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
              ) : null}
              {statusLabels[contest.status]}
            </span>
            {soon ? (
              <span className="font-mono text-[0.7rem] text-acc">{soon}</span>
            ) : null}
            <span className="ml-auto rounded-md bg-muted px-2 py-0.5 font-mono text-[0.68rem] text-foreground">
              {contest.externalId}
            </span>
          </div>
          <h3 className="mt-1.5 text-base font-semibold break-words text-foreground">
            <a
              className="underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              href={contest.canonicalUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {contest.name}
            </a>
          </h3>
          <dl className="mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div className="flex gap-1">
              <dt className="sr-only">Starts</dt>
              <dd>
                <span className="font-medium text-foreground">
                  {formatTime(contest.startsAt)}
                </span>
                <span className="sr-only"> {formatDate(contest.startsAt)}</span>
              </dd>
              <span aria-hidden="true">→</span>
              <dt className="sr-only">Ends</dt>
              <dd>
                <span className="font-medium text-foreground">
                  {formatTime(contest.endsAt)}
                </span>
                <span className="sr-only"> {formatDate(contest.endsAt)}</span>
              </dd>
            </div>
            {contest.durationSeconds !== undefined ? (
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Duration</dt>
                <dd className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-1 rounded-full bg-acc"
                    style={{
                      width: `${Math.min(64, contest.durationSeconds / 225)}px`,
                    }}
                  />
                  {Math.round(contest.durationSeconds / 60)} minutes
                </dd>
              </div>
            ) : null}
            {contest.phase ? (
              <div className="flex gap-1">
                <dt>Phase</dt>
                <dd className="font-medium text-foreground">{contest.phase}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </SpotlightCard>
    </motion.li>
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
  const now = useNow(30_000)
  // The countdown and calendar follow the provider filter but not the
  // catalog's status filter: they always show what starts from today on.
  const todayStart = startOfLocalDay(now).toISOString()
  const scheduleQuery = useContests(
    useMemo(
      () => ({
        ...(provider === undefined ? {} : { provider }),
        startsAfter: todayStart,
        limit: 200,
      }),
      [provider, todayStart],
    ),
  )
  const schedule = scheduleQuery.data?.data ?? []

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
          {contests.data.slice(0, visibleCount).map((contest, index) => (
            <ContestCard
              contest={contest}
              index={index}
              now={now}
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

  const nextContest = schedule
    .filter(
      (contest) =>
        contest.startsAt !== undefined &&
        new Date(contest.startsAt).getTime() > now,
    )
    .sort(
      (a, b) =>
        new Date(a.startsAt ?? 0).getTime() -
        new Date(b.startsAt ?? 0).getTime(),
    )[0]

  return (
    <PageContainer accent="rose" className="gap-6">
      <PageHero
        info="Upcoming and historical contests from the connected public provider catalogs. Links open the contest on its provider."
        subtitle="What is coming up across your platforms."
        title="Contests"
      />

      {nextContest ? (
        <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <NextContest contest={nextContest} />
          <WeekCalendar contests={schedule} now={now} />
        </div>
      ) : null}

      <section
        aria-label="Contest filters"
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3"
      >
        <SegmentedControl
          label="Provider"
          onChange={(next) =>
            updateFilters(next === 'all' ? undefined : next, status)
          }
          options={[
            { value: 'all', label: 'All providers' },
            ...contestProviderOptions.map((option) => ({
              value: option,
              label: providerLabels[option],
              icon: <ProviderLogo className="size-3.5" provider={option} />,
            })),
          ]}
          size="sm"
          value={provider ?? 'all'}
        />
        <SegmentedControl
          label="Status"
          onChange={(next) =>
            updateFilters(provider, next === allStatuses ? undefined : next)
          }
          options={[
            ...(['upcoming', 'running', 'finished', 'unknown'] as const).map(
              (value) => ({ value, label: statusLabels[value] }),
            ),
            { value: allStatuses, label: 'All statuses' },
          ]}
          size="sm"
          value={status ?? allStatuses}
        />
      </section>

      <section aria-labelledby="contest-list-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            className="text-lg font-semibold tracking-tight text-foreground"
            id="contest-list-heading"
          >
            Contest catalog
          </h2>
          {contests ? (
            <p className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
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
