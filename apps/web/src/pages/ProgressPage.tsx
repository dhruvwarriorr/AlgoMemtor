import { Fragment, useRef, useState, type ReactNode } from 'react'
import type { ProviderKey } from '@algomemtor/shared-contracts'
import {
  Activity,
  CalendarCheck,
  CheckCheck,
  Flame,
  Send,
  Target,
  Trophy,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from 'react-router-dom'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import PageContainer from '@/components/layout/PageContainer'
import { CellTooltip } from '@/components/ui/cell-tooltip'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { useLearnerMemories } from '@/features/memory/hooks/useLearnerMemories'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { useProgressAnalytics } from '@/features/progress/hooks/useProgress'
import { cellTipFrom, type CellTip } from '@/lib/cell-tip'
import { cn } from '@/lib/utils'

type Analytics = NonNullable<
  ReturnType<typeof useProgressAnalytics>['data']
>['data']
type Breakdown = NonNullable<Analytics['breakdown']>

const tooltipStyle = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  color: 'var(--popover-foreground)',
  fontSize: 12,
}
const axisTick = { fill: 'var(--muted-foreground)', fontSize: 11 }

// A distinct, theme-friendly palette for categorical charts.
const palette = [
  '#ff4d12',
  '#2d6cdf',
  '#1f9d5c',
  '#f2b84b',
  '#8b5cf6',
  '#e0484f',
  '#14a3a3',
  '#6c7a90',
]

const providerColors: Record<ProviderKey, string> = {
  codeforces: '#2d6cdf',
  codechef: '#8b5a2b',
  leetcode: '#f2a31b',
  cses: '#6c7a90',
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00.000Z`))
}

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function Card({
  title,
  description,
  className,
  action,
  children,
}: {
  title: string
  description: string
  className?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'animate-rise flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="grid flex-1 place-items-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function Kpi({
  icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'animate-rise min-w-0 rounded-xl p-4',
        accent
          ? 'text-white [background:linear-gradient(155deg,#ff7a3d,#ff4d12_45%,#9a2e0b)]'
          : 'border border-border bg-card',
      )}
    >
      <dt
        className={cn(
          'flex items-center gap-2 text-sm font-medium',
          accent ? 'text-white/85' : 'text-muted-foreground',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-8 place-items-center rounded-lg',
            accent ? 'bg-white/20' : 'bg-accent text-accent-foreground',
          )}
        >
          {icon}
        </span>
        {label}
      </dt>
      <dd className="mt-3 truncate font-heading text-[1.9rem] leading-none font-bold tracking-[-0.01em] tabular-nums">
        {value}
      </dd>
      <p
        className={cn(
          'mt-1.5 truncate text-xs',
          accent ? 'text-white/80' : 'text-muted-foreground',
        )}
      >
        {detail}
      </p>
    </div>
  )
}

// Area chart: attempted vs newly solved per local day.
function DailyPractice({ analytics }: { analytics: Analytics }) {
  const data = analytics.trend.map((point) => ({
    ...point,
    label: shortDate(point.date),
  }))
  const hasActivity = data.some(
    (point) => point.solved > 0 || point.attempted > 0,
  )
  return (
    <Card
      className="lg:col-span-8"
      description={`Problems attempted and newly solved each day (${analytics.timezone}).`}
      title="Daily practice"
    >
      {hasActivity ? (
        <div className="h-64 w-full" role="img" aria-label="Daily practice">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart
              data={data}
              margin={{ top: 6, right: 6, left: -22, bottom: 0 }}
            >
              <defs>
                <linearGradient id="solved-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#ff4d12" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#ff4d12" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="attempted-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2d6cdf" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#2d6cdf" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                interval={4}
                tick={axisTick}
                tickLine={false}
              />
              <YAxis allowDecimals={false} tick={axisTick} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                dataKey="attempted"
                fill="url(#attempted-fill)"
                name="Attempted"
                stroke="#2d6cdf"
                strokeWidth={1.5}
                type="monotone"
              />
              <Area
                dataKey="solved"
                fill="url(#solved-fill)"
                name="Newly solved"
                stroke="#ff4d12"
                strokeWidth={2.2}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Empty>No dated practice was observed in the last 30 days.</Empty>
      )}
    </Card>
  )
}

// Radial bars: solved per platform, with a detail list.
function PlatformBreakdown({
  breakdown,
}: {
  breakdown: Breakdown | undefined
}) {
  const providers = breakdown?.providers ?? []
  const total = providers.reduce((sum, item) => sum + item.solved, 0)
  const data = providers.map((item) => ({
    name: providerLabels[item.provider],
    value: item.solved,
    fill: providerColors[item.provider],
  }))
  return (
    <Card
      className="lg:col-span-4"
      description="Newly solved problems by platform."
      title="Platforms"
    >
      {providers.length === 0 ? (
        <Empty>Link a platform to see where you practice.</Empty>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <div className="relative h-40">
            <ResponsiveContainer height="100%" width="100%">
              <RadialBarChart
                barSize={11}
                data={data}
                endAngle={-270}
                innerRadius="38%"
                outerRadius="100%"
                startAngle={90}
              >
                <RadialBar
                  background={{ fill: 'var(--muted)' }}
                  cornerRadius={6}
                  dataKey="value"
                />
                <Tooltip contentStyle={tooltipStyle} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="font-heading text-2xl leading-none font-bold">
                  {total}
                </p>
                <p className="text-[0.7rem] text-muted-foreground">solved</p>
              </div>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5">
            {providers.map((item) => (
              <li
                className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm"
                key={item.provider}
              >
                <ProviderLogo className="size-5" provider={item.provider} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {providerLabels[item.provider]}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {item.attempted} tried · {item.submissions} subs
                </span>
                <span className="w-7 text-right font-heading font-bold tabular-nums">
                  {item.solved}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

// Pie chart: share of newly solved problems per topic in the window.
function TopicPie({ analytics }: { analytics: Analytics }) {
  const sorted = [...analytics.topicActivity]
    .filter((topic) => topic.solved > 0)
    .sort((left, right) => right.solved - left.solved)
  const top = sorted.slice(0, 7)
  const rest = sorted.slice(7).reduce((sum, topic) => sum + topic.solved, 0)
  const data = [
    ...top.map((topic) => ({
      name: titleCase(topic.topic),
      value: topic.solved,
    })),
    ...(rest > 0 ? [{ name: 'Other', value: rest }] : []),
  ]
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return (
    <Card
      className="lg:col-span-6"
      description="Topics on problems you newly solved in the last 30 days."
      title="Topics practiced"
    >
      {data.length === 0 ? (
        <Empty>No tagged solves in the last 30 days.</Empty>
      ) : (
        <div className="grid flex-1 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="h-60" role="img" aria-label="Topics practiced">
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  innerRadius={0}
                  nameKey="name"
                  outerRadius="95%"
                  paddingAngle={1}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {data.map((item, index) => (
                    <Cell
                      fill={palette[index % palette.length]}
                      key={item.name}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {data.map((item, index) => (
              <li className="flex items-center gap-2.5" key={item.name}>
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-sm"
                  style={{ background: palette[index % palette.length] }}
                />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {Math.round((item.value / total) * 100)}%
                </span>
                <span className="w-6 text-right font-semibold tabular-nums">
                  {item.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

const verdictMeta = [
  { key: 'accepted', label: 'Accepted', color: '#1f9d5c' },
  { key: 'wrongAnswer', label: 'Wrong answer', color: '#e0484f' },
  { key: 'timeLimit', label: 'Time limit', color: '#f2b84b' },
  { key: 'memoryLimit', label: 'Memory limit', color: '#8b5cf6' },
  { key: 'runtimeError', label: 'Runtime error', color: '#ff4d12' },
  { key: 'compileError', label: 'Compile error', color: '#14a3a3' },
  { key: 'other', label: 'Other', color: '#6c7a90' },
] as const

// Segmented 100% bar: how submissions ended.
function VerdictMix({ breakdown }: { breakdown: Breakdown | undefined }) {
  const total = breakdown?.submissions ?? 0
  const items = verdictMeta
    .map((meta) => ({ ...meta, count: breakdown?.verdicts[meta.key] ?? 0 }))
    .filter((item) => item.count > 0)
  const accepted = breakdown?.verdicts.accepted ?? 0
  return (
    <Card
      action={
        total > 0 ? (
          <span className="rounded-md bg-go-soft px-2 py-1 text-sm font-semibold text-go-foreground tabular-nums">
            {Math.round((accepted / total) * 100)}% AC
          </span>
        ) : null
      }
      className="lg:col-span-6"
      description={`How your ${total} submissions ended.`}
      title="Verdict mix"
    >
      {total === 0 ? (
        <Empty>No dated submissions in the last 30 days.</Empty>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-5">
          <div
            aria-label={items
              .map((item) => `${item.label}: ${item.count}`)
              .join(', ')}
            className="flex h-10 w-full overflow-hidden rounded-lg"
            role="img"
          >
            {items.map((item) => (
              <span
                className="h-full transition-[filter] hover:brightness-110"
                key={item.key}
                style={{
                  width: `${(item.count / total) * 100}%`,
                  background: item.color,
                }}
                title={`${item.label}: ${item.count}`}
              />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((item) => (
              <li
                className="rounded-lg border border-border px-3 py-2"
                key={item.key}
              >
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-sm"
                    style={{ background: item.color }}
                  />
                  {item.label}
                </p>
                <p className="mt-1 font-heading text-xl font-bold tabular-nums">
                  {item.count}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {Math.round((item.count / total) * 100)}%
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

// Histogram: rating bands of newly solved problems, plus difficulty chips.
function DifficultyProfile({
  breakdown,
}: {
  breakdown: Breakdown | undefined
}) {
  const bands = (breakdown?.ratingBands ?? []).map((band) => ({
    label: String(band.min),
    range: `${band.min}–${band.max}`,
    solved: band.solved,
  }))
  const difficulty = breakdown?.difficulty
  const chips = [
    {
      label: 'Easy',
      value: difficulty?.easy ?? 0,
      className: 'bg-go-soft text-go-foreground',
    },
    {
      label: 'Medium',
      value: difficulty?.medium ?? 0,
      className: 'bg-sun-soft text-sun-foreground',
    },
    {
      label: 'Hard',
      value: difficulty?.hard ?? 0,
      className: 'bg-danger-soft text-destructive',
    },
  ]
  return (
    <Card
      className="lg:col-span-6"
      description="Rating bands and difficulty of problems you newly solved."
      title="Difficulty profile"
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            className={cn(
              'rounded-md px-2.5 py-1 text-sm font-medium',
              chip.className,
            )}
            key={chip.label}
          >
            {chip.label} <b className="tabular-nums">{chip.value}</b>
          </span>
        ))}
      </div>
      {bands.length === 0 ? (
        <Empty>No rated problems solved in the last 30 days.</Empty>
      ) : (
        <div className="h-52" role="img" aria-label="Solved problems by rating">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              data={bands}
              margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
            >
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} />
              <YAxis allowDecimals={false} tick={axisTick} tickLine={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: 'var(--muted)' }}
                formatter={(value) => [value, 'Solved']}
                labelFormatter={(_, payload) =>
                  (payload[0]?.payload as { range?: string } | undefined)
                    ?.range ?? ''
                }
              />
              <Bar dataKey="solved" radius={[6, 6, 0, 0]}>
                {bands.map((band, index) => (
                  <Cell
                    fill={`color-mix(in oklab, #ff4d12 ${45 + Math.round((index / Math.max(1, bands.length - 1)) * 55)}%, #2d6cdf)`}
                    key={band.label}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

// Radar: which weekdays carry the practice.
function WeekdayRhythm({ breakdown }: { breakdown: Breakdown | undefined }) {
  const data = breakdown?.weekdays ?? []
  const hasData = data.some((day) => day.solved > 0 || day.submissions > 0)
  return (
    <Card
      className="lg:col-span-3"
      description="Solves and submissions by weekday."
      title="Weekly rhythm"
    >
      {hasData ? (
        <div className="h-56" role="img" aria-label="Weekly rhythm">
          <ResponsiveContainer height="100%" width="100%">
            <RadarChart data={data} outerRadius="72%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="day" tick={axisTick} />
              <PolarRadiusAxis
                axisLine={false}
                domain={[0, 'dataMax']}
                tick={false}
              />
              <Radar
                dataKey="submissions"
                fill="#2d6cdf"
                fillOpacity={0.18}
                name="Submissions"
                stroke="#2d6cdf"
              />
              <Radar
                dataKey="solved"
                fill="#ff4d12"
                fillOpacity={0.35}
                name="Solved"
                stroke="#ff4d12"
              />
              <Tooltip contentStyle={tooltipStyle} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Empty>No weekday pattern yet.</Empty>
      )}
    </Card>
  )
}

// Heat strip: submissions by local hour.
function TimeOfDay({
  breakdown,
  timezone,
}: {
  breakdown: Breakdown | undefined
  timezone: string
}) {
  const hours = breakdown?.hours ?? []
  const max = Math.max(0, ...hours)
  const peak = max > 0 ? hours.indexOf(max) : -1
  const label = (hour: number) =>
    `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [tip, setTip] = useState<CellTip | null>(null)
  const showTip = (cell: Element, hour: number, count: number) =>
    setTip(
      cellTipFrom(
        cell,
        wrapperRef.current,
        `${count} ${count === 1 ? 'submission' : 'submissions'}`,
        `${label(hour)} – ${label((hour + 1) % 24)}`,
      ),
    )
  return (
    <Card
      className="lg:col-span-3"
      description={`Submissions by hour (${timezone}).`}
      title="Time of day"
    >
      {max === 0 ? (
        <Empty>No timed submissions yet.</Empty>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-4">
          <p className="text-sm">
            Peak around <b className="font-heading text-lg">{label(peak)}</b>
          </p>
          <div
            className="relative grid grid-cols-[auto_repeat(6,minmax(0,1fr))] items-center gap-1.5"
            onMouseLeave={() => setTip(null)}
            ref={wrapperRef}
          >
            <CellTooltip tip={tip} />
            {[0, 6, 12, 18].map((start) => (
              <Fragment key={start}>
                <span className="pr-1 text-right text-[0.7rem] text-muted-foreground tabular-nums">
                  {label(start)}
                </span>
                {hours.slice(start, start + 6).map((count, offset) => {
                  const hour = start + offset
                  return (
                    <span
                      aria-label={`${count} submissions between ${label(hour)} and ${label((hour + 1) % 24)}`}
                      className="aspect-square rounded-md outline-none transition-[box-shadow,transform] duration-150 hover:scale-110 hover:ring-2 hover:ring-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
                      key={hour}
                      onBlur={() => setTip(null)}
                      onFocus={(event) =>
                        showTip(event.currentTarget, hour, count)
                      }
                      onMouseEnter={(event) =>
                        showTip(event.currentTarget, hour, count)
                      }
                      role="img"
                      style={{
                        background:
                          count === 0
                            ? 'var(--muted)'
                            : `color-mix(in oklab, #ff4d12 ${25 + Math.round((count / max) * 75)}%, transparent)`,
                      }}
                      tabIndex={0}
                    />
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function AnalyticsSection({ analytics }: { analytics: Analytics }) {
  const breakdown = analytics.breakdown
  const activeDays = analytics.trend.filter(
    (day) => day.attempted > 0 || day.solved > 0,
  ).length
  const submissions = breakdown?.submissions ?? 0
  const accepted = breakdown?.verdicts.accepted ?? 0
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi
          accent
          detail="Unique problems, last 30 days"
          icon={<CheckCheck aria-hidden="true" className="size-4" />}
          label="Newly solved"
          value={String(analytics.window.solved)}
        />
        <Kpi
          detail={
            analytics.currentStreak > 0
              ? 'Solve today to keep it'
              : 'Solve today to start one'
          }
          icon={<Flame aria-hidden="true" className="size-4" />}
          label="Current streak"
          value={`${analytics.currentStreak}d`}
        />
        <Kpi
          detail="Best run of solve days"
          icon={<Trophy aria-hidden="true" className="size-4" />}
          label="Longest streak"
          value={`${analytics.longestStreak}d`}
        />
        <Kpi
          detail={`of the last ${analytics.window.days} days`}
          icon={<CalendarCheck aria-hidden="true" className="size-4" />}
          label="Active days"
          value={String(activeDays)}
        />
        <Kpi
          detail={`${analytics.window.attempted} problems attempted`}
          icon={<Send aria-hidden="true" className="size-4" />}
          label="Submissions"
          value={String(submissions)}
        />
        <Kpi
          detail={`${accepted} accepted`}
          icon={<Target aria-hidden="true" className="size-4" />}
          label="Acceptance"
          value={
            submissions === 0
              ? '—'
              : `${Math.round((accepted / submissions) * 100)}%`
          }
        />
      </dl>

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <DailyPractice analytics={analytics} />
        <PlatformBreakdown breakdown={breakdown} />
        <TopicPie analytics={analytics} />
        <VerdictMix breakdown={breakdown} />
        <DifficultyProfile breakdown={breakdown} />
        <WeekdayRhythm breakdown={breakdown} />
        <TimeOfDay breakdown={breakdown} timezone={analytics.timezone} />
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Activity aria-hidden="true" className="size-3.5" />
        Counts use dated activity available to AlgoMemtor; public provider
        history can be partial.
      </p>
    </div>
  )
}

function MemoryProcessingNotice() {
  const memoriesQuery = useLearnerMemories()
  const pendingJobs = memoriesQuery.data?.meta.pendingJobs ?? 0
  if (pendingJobs === 0) return null
  return (
    <aside
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 p-4"
      role="status"
    >
      <p className="text-sm text-muted-foreground">
        {pendingJobs} learner-memory job{pendingJobs === 1 ? '' : 's'} are
        processing. This page will refresh when they finish.
      </p>
      <Link
        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        to="/memory"
      >
        Review memory
      </Link>
    </aside>
  )
}

function ProgressPage() {
  const analyticsQuery = useProgressAnalytics(30)
  return (
    <PageContainer>
      <PageHeader
        description="Your last 30 days of practice: where, what, how well and when."
        title="Progress"
      />
      <MemoryProcessingNotice />
      {analyticsQuery.isPending ? (
        <PageSkeleton label="Loading progress analytics" rows={4} />
      ) : analyticsQuery.isError ? (
        <ErrorState
          message={
            analyticsQuery.error instanceof Error
              ? analyticsQuery.error.message
              : 'Progress analytics could not be loaded.'
          }
          onRetry={() => void analyticsQuery.refetch()}
          title="Progress unavailable"
        />
      ) : analyticsQuery.data ? (
        <AnalyticsSection analytics={analyticsQuery.data.data} />
      ) : null}
    </PageContainer>
  )
}

export default ProgressPage
