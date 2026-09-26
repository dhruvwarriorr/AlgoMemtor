import {
  Fragment,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import type {
  AnalyticsInsights,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { CellTooltip } from '@/components/ui/cell-tooltip'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { useReveal } from '@/features/insights/use-reveal'
import { cellTipFrom, type CellTip } from '@/lib/cell-tip'
import { cn } from '@/lib/utils'

const providerColors: Record<ProviderKey, string> = {
  codeforces: '#2d6cdf',
  codechef: '#a0643c',
  leetcode: '#f2a31b',
  cses: '#14a3a3',
}

export function InsightCard({
  title,
  description,
  className,
  action,
  children,
}: {
  title: string
  description?: string
  className?: string
  action?: ReactNode
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.section
      className={cn(
        'flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 transition-shadow duration-300 hover:shadow-soft sm:p-5',
        className,
      )}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      viewport={{ once: true, margin: '-40px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </motion.section>
  )
}

export function EmptyInsight({ children }: { children: ReactNode }) {
  return (
    <p className="grid min-h-40 flex-1 place-items-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value))
}

// ---------------------------------------------------------------------------
// Accounts: one card per linked platform.

// The four platforms, always shown in this order.
const platformOrder: readonly ProviderKey[] = [
  'leetcode',
  'codeforces',
  'codechef',
  'cses',
]

type Account = AnalyticsInsights['accounts'][number]

// A slim ring for this platform's share of every solve.
function ShareRing({ share, color }: { share: number; color: string }) {
  const radius = 15.9155
  return (
    <span className="relative grid size-11 shrink-0 place-items-center">
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full -rotate-90"
        viewBox="0 0 36 36"
      >
        <circle
          cx="18"
          cy="18"
          fill="none"
          r={radius}
          stroke="color-mix(in oklab, var(--foreground) 10%, transparent)"
          strokeWidth={3.5}
        />
        <motion.circle
          animate={{ strokeDasharray: `${share * 100} 100` }}
          cx="18"
          cy="18"
          fill="none"
          initial={{ strokeDasharray: '0 100' }}
          r={radius}
          stroke={color}
          strokeLinecap="round"
          strokeWidth={3.5}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <span className="relative font-mono text-[0.62rem] font-bold tabular-nums">
        {Math.round(share * 100)}%
      </span>
    </span>
  )
}

function PlatformCard({
  provider,
  account,
  totalSolved,
  index,
}: {
  provider: ProviderKey
  account: Account | undefined
  totalSolved: number
  index: number
}) {
  const color = providerColors[provider]
  const label = providerLabels[provider]
  const share =
    account !== undefined && totalSolved > 0
      ? (account.solvedCount ?? 0) / totalSolved
      : 0
  // CSES has no rating, so its headline is the solved count.
  const rated = account?.rating !== undefined
  const stats: [string, number | undefined][] =
    account === undefined
      ? []
      : rated
        ? [
            ['Peak', account.maxRating],
            ['Solved', account.solvedCount],
            ['Contests', account.contests],
          ]
        : [
            ['Contests', account.contests],
            ['Global rank', account.globalRank],
          ]

  return (
    <motion.article
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group relative isolate flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lift',
        account === undefined && 'border-dashed',
      )}
      initial={{ opacity: 0, y: 14 }}
      transition={{ delay: index * 0.07, duration: 0.5 }}
    >
      {/* Header band in the platform's colour, with a faint dot grid. */}
      <div
        className="relative h-14 shrink-0"
        style={{
          background:
            account === undefined
              ? 'color-mix(in oklab, var(--foreground) 5%, transparent)'
              : `linear-gradient(120deg, ${color}, color-mix(in oklab, ${color} 35%, var(--card)))`,
        }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.35)_1px,transparent_1.2px)] bg-size-[12px_12px] [mask-image:linear-gradient(to_left,black,transparent_70%)]"
        />
        <span
          className={cn(
            'absolute top-2.5 right-3 text-[0.68rem] font-semibold tracking-wide uppercase',
            account === undefined
              ? 'text-muted-foreground'
              : 'text-white/90 drop-shadow-sm',
          )}
        >
          {label}
        </span>
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col px-4 pb-4">
        <div className="-mt-6 flex items-end justify-between gap-2">
          <span className="grid size-12 place-items-center rounded-2xl border-4 border-card bg-card shadow-soft transition-transform duration-300 group-hover:-rotate-6">
            <ProviderLogo className="size-6" provider={provider} />
          </span>
          {account !== undefined && totalSolved > 0 ? (
            <span title="Share of your solves across platforms">
              <ShareRing color={color} share={share} />
            </span>
          ) : null}
        </div>

        {account === undefined ? (
          <div className="mt-3 flex flex-1 flex-col">
            <p className="text-sm font-semibold text-foreground">
              Not linked yet
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Link {label} to add it to your history.
            </p>
            <Link
              className="mt-auto inline-flex w-fit items-center gap-1 pt-3 text-xs font-semibold underline-offset-4 hover:underline"
              style={{ color }}
              to="/settings#platforms"
            >
              Link {label} →
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                {account.handle}
              </p>
              {account.rank ? (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold capitalize"
                  style={{
                    color,
                    background: `color-mix(in oklab, ${color} 14%, transparent)`,
                  }}
                >
                  {account.rank}
                </span>
              ) : null}
            </div>
            <p className="mt-2 font-heading text-3xl leading-none font-bold tracking-[-0.02em] tabular-nums">
              {rated
                ? Math.round(account.rating ?? 0)
                : (account.solvedCount ?? 0).toLocaleString()}
            </p>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              {rated ? 'Rating' : 'Solved'}
              {account.bestContestRank
                ? ` · best rank #${account.bestContestRank.toLocaleString()}`
                : ''}
            </p>
            <dl
              className={cn(
                'mt-3 grid gap-1 border-t border-dashed border-border pt-3 text-center',
                stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
              )}
            >
              {stats.map(([name, value]) => (
                <div className="min-w-0" key={name}>
                  <dt className="truncate text-[0.62rem] text-muted-foreground">
                    {name}
                  </dt>
                  <dd className="font-heading text-sm font-bold tabular-nums">
                    {value === undefined
                      ? '—'
                      : Math.round(value).toLocaleString()}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </motion.article>
  )
}

// One compact card per platform on a single row, linked or not.
export function AccountCards({
  accounts,
}: {
  accounts: AnalyticsInsights['accounts']
}) {
  const totalSolved = accounts.reduce(
    (sum, account) => sum + (account.solvedCount ?? 0),
    0,
  )
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {platformOrder.map((provider, index) => (
        <PlatformCard
          account={accounts.find((account) => account.provider === provider)}
          index={index}
          key={provider}
          provider={provider}
          totalSolved={totalSolved}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Year calendar: GitHub-style heatmap of solves over the last 53 weeks.

// "recent" is the rolling last 12 months; a number is a calendar year.
type CalendarRange = 'recent' | number

export function YearCalendar({
  solvedOverTime,
  firstActivityAt,
}: {
  solvedOverTime: Record<string, number>
  firstActivityAt?: string
}) {
  const now = new Date()
  const currentYear = now.getFullYear()
  // The learner's local calendar date; day keys use the same calendar.
  const todayKey = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const firstYear = useMemo(() => {
    const fromActivity =
      firstActivityAt === undefined
        ? Number.NaN
        : new Date(firstActivityAt).getFullYear()
    const fromDays = Object.keys(solvedOverTime)
      .filter((day) => (solvedOverTime[day] ?? 0) > 0)
      .map((day) => Number(day.slice(0, 4)))
    const candidates = [fromActivity, ...fromDays].filter((year) =>
      Number.isFinite(year),
    )
    return Math.min(currentYear, ...candidates)
  }, [currentYear, firstActivityAt, solvedOverTime])
  const years = Array.from(
    { length: currentYear - firstYear + 1 },
    (_, index) => currentYear - index,
  )
  const [range, setRange] = useState<CalendarRange>('recent')

  const {
    weeks,
    months,
    total,
    thresholds,
    columnCount,
    activeDays,
    bestWeek,
    busiestWeekday,
  } = useMemo(() => {
    const todayUtc = new Date(`${todayKey}T00:00:00.000Z`)
    const first =
      range === 'recent'
        ? new Date(todayUtc.getTime() - 364 * 86_400_000)
        : new Date(Date.UTC(range, 0, 1))
    const last =
      range === 'recent' || range === todayUtc.getUTCFullYear()
        ? todayUtc
        : new Date(Date.UTC(range, 11, 31))
    // Columns start on the Monday on or before the first day.
    const weekday = (first.getUTCDay() + 6) % 7
    const start = new Date(first.getTime() - weekday * 86_400_000)
    const count = Math.ceil(
      ((last.getTime() - start.getTime()) / 86_400_000 + 1) / 7,
    )
    const columns: Array<Array<{ date: string; count: number } | null>> = []
    const monthMarks: Array<{ index: number; label: string }> = []
    let sum = 0
    const activeCounts: number[] = []
    const weekdayTotals = [0, 0, 0, 0, 0, 0, 0]
    for (let column = 0; column < count; column += 1) {
      const cells: Array<{ date: string; count: number } | null> = []
      for (let row = 0; row < 7; row += 1) {
        const date = new Date(start.getTime() + (column * 7 + row) * 86_400_000)
        if (date > last || date < first) {
          cells.push(null)
          continue
        }
        const key = date.toISOString().slice(0, 10)
        const solved = solvedOverTime[key] ?? 0
        sum += solved
        weekdayTotals[row] = (weekdayTotals[row] ?? 0) + solved
        if (solved > 0) activeCounts.push(solved)
        cells.push({ date: key, count: solved })
        if (date.getUTCDate() === 1 || (column === 0 && row === 0)) {
          if (monthMarks.at(-1)?.index !== column) {
            monthMarks.push({
              index: column,
              label: new Intl.DateTimeFormat(undefined, {
                month: 'short',
                timeZone: 'UTC',
              }).format(date),
            })
          }
        }
      }
      columns.push(cells)
    }
    // Shades split the active days into quartiles (as GitHub does), so one
    // exceptional day does not wash every other day out to the lightest
    // shade.
    const weekSums = columns.map((cells) =>
      cells.reduce((acc, cell) => acc + (cell?.count ?? 0), 0),
    )
    const topWeekday = weekdayTotals.indexOf(Math.max(...weekdayTotals))
    activeCounts.sort((left, right) => left - right)
    const quantile = (fraction: number) =>
      activeCounts[Math.floor((activeCounts.length - 1) * fraction)] ?? 0
    return {
      weeks: columns,
      months: monthMarks,
      total: sum,
      thresholds: [quantile(0.25), quantile(0.5), quantile(0.75)],
      columnCount: count,
      activeDays: activeCounts.length,
      bestWeek: Math.max(0, ...weekSums),
      busiestWeekday: sum === 0 ? undefined : topWeekday,
    }
  }, [range, solvedOverTime, todayKey])
  const { ref: revealRef, shown } = useReveal<HTMLDivElement>()

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [tip, setTip] = useState<CellTip | null>(null)
  const level = (count: number) =>
    count === 0
      ? 0
      : 1 + thresholds.filter((threshold) => count > threshold).length
  const levelClass = [
    'bg-muted',
    'bg-primary/25',
    'bg-primary/50',
    'bg-primary/75',
    'bg-primary',
  ]

  return (
    <InsightCard
      action={
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-secondary px-2 py-1 text-sm font-semibold tabular-nums">
            {total.toLocaleString()} solves
          </span>
          <label className="sr-only" htmlFor="insights-calendar-range">
            Heatmap range
          </label>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
            id="insights-calendar-range"
            onChange={(event) => {
              const value = event.currentTarget.value
              setTip(null)
              setRange(value === 'recent' ? 'recent' : Number(value))
            }}
            value={String(range)}
          >
            <option value="recent">Last 12 months</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      }
      description={
        range === 'recent'
          ? 'Every dated solve over the past 12 months.'
          : `Every dated solve in ${range}.`
      }
      title={range === 'recent' ? 'Year in practice' : `${range} in practice`}
    >
      <div className="relative" ref={wrapperRef}>
        <CellTooltip tip={tip} />
        <div
          className="overflow-x-auto pb-1"
          onMouseLeave={() => setTip(null)}
          onScroll={() => setTip(null)}
          ref={revealRef}
        >
          <div className="min-w-[44rem]" key={String(range)}>
            <div className="relative mb-1 ml-8 h-4 text-[0.68rem] text-muted-foreground">
              {months.map((mark) => (
                <span
                  className="absolute"
                  key={`${mark.index}-${mark.label}`}
                  style={{ left: `${(mark.index / columnCount) * 100}%` }}
                >
                  {mark.label}
                </span>
              ))}
            </div>
            <div
              className="grid gap-[3px]"
              style={{
                gridTemplateColumns: `2rem repeat(${columnCount}, minmax(0, 1fr))`,
              }}
            >
              {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((label, row) => (
                <Fragment key={row}>
                  <span className="self-center text-[0.62rem] leading-none text-muted-foreground">
                    {label}
                  </span>
                  {weeks.map((cells, column) => {
                    const cell = cells[row]
                    return cell === null || cell === undefined ? (
                      <span className="aspect-square" key={column} />
                    ) : (
                      <span
                        aria-label={`${cell.count} solved on ${dayLabel(`${cell.date}T12:00:00.000Z`)}`}
                        className={cn(
                          'aspect-square rounded-[3px] transition-[box-shadow,transform] duration-150 hover:scale-125 hover:ring-2 hover:ring-foreground/70',
                          shown ? 'animate-cell-pop' : 'opacity-0',
                          levelClass[level(cell.count)],
                        )}
                        key={column}
                        style={
                          {
                            '--d': `${column * 14 + row * 20}ms`,
                          } as CSSProperties
                        }
                        onMouseEnter={(event) =>
                          setTip(
                            cellTipFrom(
                              event.currentTarget,
                              wrapperRef.current,
                              `${cell.count} ${cell.count === 1 ? 'problem' : 'problems'} solved`,
                              dayLabel(`${cell.date}T12:00:00.000Z`),
                            ),
                          )
                        }
                        role="img"
                      />
                    )
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.7rem] text-muted-foreground">
        <dl className="flex flex-wrap gap-1.5">
          {[
            ['Active days', activeDays.toLocaleString()],
            ['Best week', `${bestWeek} solves`],
            [
              'Busiest weekday',
              busiestWeekday === undefined
                ? '—'
                : (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][
                    busiestWeekday
                  ] ?? '—'),
            ],
          ].map(([label, value]) => (
            <div
              className="flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs"
              key={label}
            >
              <dt>{label}</dt>
              <dd className="font-semibold text-foreground tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <span className="ml-auto flex items-center gap-1.5">
          Less
          {levelClass.map((className) => (
            <span
              className={cn('size-3 rounded-[3px]', className)}
              key={className}
            />
          ))}
          More
        </span>
      </div>
    </InsightCard>
  )
}
