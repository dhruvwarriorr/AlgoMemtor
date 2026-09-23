import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  AnalyticsInsights,
  ProviderKey,
} from '@algomemtor/shared-contracts'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { CellTooltip } from '@/components/ui/cell-tooltip'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { cellTipFrom, type CellTip } from '@/lib/cell-tip'
import { cn } from '@/lib/utils'

const tooltipStyle = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  color: 'var(--popover-foreground)',
  fontSize: 12,
}
const axisTick = { fill: 'var(--muted-foreground)', fontSize: 11 }

const providerColors: Record<ProviderKey, string> = {
  codeforces: '#2d6cdf',
  codechef: '#a0643c',
  leetcode: '#f2a31b',
  cses: '#14a3a3',
}

const palette = [
  '#ff4d12',
  '#2d6cdf',
  '#1f9d5c',
  '#f2b84b',
  '#8b5cf6',
  '#e0484f',
  '#14a3a3',
  '#6c7a90',
  '#d9467a',
  '#3f8f8b',
  '#b8860b',
  '#5b6ee1',
]

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
          {description ? (
            <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

export function EmptyInsight({ children }: { children: ReactNode }) {
  return (
    <p className="grid min-h-40 flex-1 place-items-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${month}-15T12:00:00.000Z`))
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value))
}

// ---------------------------------------------------------------------------
// Accounts: one card per linked platform.

export function AccountCards({
  accounts,
}: {
  accounts: AnalyticsInsights['accounts']
}) {
  if (accounts.length === 0) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {accounts.map((account) => (
        <article
          className="animate-rise relative overflow-hidden rounded-xl border border-border bg-card p-4"
          key={account.provider}
        >
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1"
            style={{ background: providerColors[account.provider] }}
          />
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-secondary">
              <ProviderLogo className="size-6" provider={account.provider} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                {providerLabels[account.provider]}
              </p>
              <p className="truncate font-heading text-lg font-bold">
                {account.handle}
              </p>
            </div>
            {account.rank ? (
              <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs font-semibold capitalize">
                {account.rank}
              </span>
            ) : null}
          </div>
          <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
            {[
              ['Rating', account.rating],
              ['Peak', account.maxRating],
              ['Solved', account.solvedCount],
              ['Contests', account.contests],
            ].map(([label, value]) => (
              <div className="rounded-lg bg-secondary/60 px-1 py-2" key={label}>
                <dt className="text-[0.68rem] text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-0.5 font-heading text-base font-bold tabular-nums">
                  {value === undefined ? '—' : Math.round(Number(value))}
                </dd>
              </div>
            ))}
          </dl>
          {account.bestContestRank || account.globalRank ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {account.bestContestRank
                ? `Best contest rank #${account.bestContestRank.toLocaleString()}`
                : ''}
              {account.bestContestRank && account.globalRank ? ' · ' : ''}
              {account.globalRank
                ? `Global rank #${account.globalRank.toLocaleString()}`
                : ''}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Year calendar: GitHub-style heatmap of solves over the last 53 weeks.

export function YearCalendar({
  solvedOverTime,
}: {
  solvedOverTime: Record<string, number>
}) {
  const { weeks, months, total, thresholds } = useMemo(() => {
    const today = new Date()
    const end = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    )
    // Start on the Monday 52 weeks before this week's Monday.
    const weekday = (end.getUTCDay() + 6) % 7
    const start = new Date(end.getTime() - (weekday + 52 * 7) * 86_400_000)
    const columns: Array<Array<{ date: string; count: number } | null>> = []
    const monthMarks: Array<{ index: number; label: string }> = []
    let sum = 0
    const activeCounts: number[] = []
    for (let column = 0; column < 53; column += 1) {
      const cells: Array<{ date: string; count: number } | null> = []
      for (let row = 0; row < 7; row += 1) {
        const date = new Date(start.getTime() + (column * 7 + row) * 86_400_000)
        if (date > end) {
          cells.push(null)
          continue
        }
        const key = date.toISOString().slice(0, 10)
        const count = solvedOverTime[key] ?? 0
        sum += count
        if (count > 0) activeCounts.push(count)
        cells.push({ date: key, count })
        if (row === 0 && date.getUTCDate() <= 7) {
          monthMarks.push({
            index: column,
            label: new Intl.DateTimeFormat(undefined, {
              month: 'short',
              timeZone: 'UTC',
            }).format(date),
          })
        }
      }
      columns.push(cells)
    }
    // Shades split the active days into quartiles (as GitHub does), so one
    // exceptional day does not wash every other day out to the lightest
    // shade.
    activeCounts.sort((left, right) => left - right)
    const quantile = (fraction: number) =>
      activeCounts[Math.floor((activeCounts.length - 1) * fraction)] ?? 0
    return {
      weeks: columns,
      months: monthMarks,
      total: sum,
      thresholds: [quantile(0.25), quantile(0.5), quantile(0.75)],
    }
  }, [solvedOverTime])

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
        <span className="rounded-md bg-secondary px-2 py-1 text-sm font-semibold tabular-nums">
          {total.toLocaleString()} solves
        </span>
      }
      description="Every dated solve over the past year."
      title="Year in practice"
    >
      <div className="relative" ref={wrapperRef}>
        <CellTooltip tip={tip} />
        <div
          className="overflow-x-auto pb-1"
          onMouseLeave={() => setTip(null)}
          onScroll={() => setTip(null)}
        >
          <div className="min-w-[44rem]">
            <div className="relative mb-1 ml-8 h-4 text-[0.68rem] text-muted-foreground">
              {months.map((mark) => (
                <span
                  className="absolute"
                  key={`${mark.index}-${mark.label}`}
                  style={{ left: `${(mark.index / 53) * 100}%` }}
                >
                  {mark.label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-[2rem_repeat(53,minmax(0,1fr))] gap-[3px]">
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
                          levelClass[level(cell.count)],
                        )}
                        key={column}
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
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[0.7rem] text-muted-foreground">
        Less
        {levelClass.map((className) => (
          <span
            className={cn('size-3 rounded-[3px]', className)}
            key={className}
          />
        ))}
        More
      </div>
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Monthly: solved bars with a submissions line on a second axis.

export function MonthlyVolume({
  monthly,
}: {
  monthly: AnalyticsInsights['monthly']
}) {
  const data = monthly.map((item) => ({
    ...item,
    label: monthLabel(item.month),
    acceptance:
      item.submissions === 0
        ? null
        : Math.round((item.accepted / item.submissions) * 100),
  }))
  const hasData = data.some((item) => item.solved > 0 || item.submissions > 0)
  return (
    <InsightCard
      className="lg:col-span-8"
      description="New solves and submissions in each of the last 24 months."
      title="Monthly volume"
    >
      {hasData ? (
        <div className="h-72" role="img" aria-label="Monthly volume">
          <ResponsiveContainer height="100%" width="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 0, left: -16, bottom: 0 }}
            >
              <defs>
                <linearGradient id="monthly-solved" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#ff7a3d" />
                  <stop offset="100%" stopColor="#c2380b" />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                interval={2}
                tick={axisTick}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={axisTick}
                tickLine={false}
                yAxisId="left"
              />
              <YAxis
                allowDecimals={false}
                orientation="right"
                tick={axisTick}
                tickLine={false}
                yAxisId="right"
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: 'var(--muted)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="solved"
                fill="url(#monthly-solved)"
                name="New solves"
                radius={[5, 5, 0, 0]}
                yAxisId="left"
              />
              <Line
                dataKey="submissions"
                dot={false}
                name="Submissions"
                stroke="#2d6cdf"
                strokeWidth={2}
                type="monotone"
                yAxisId="right"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyInsight>No dated activity in the last two years.</EmptyInsight>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Difficulty gauge: half-donut of easy / medium / hard.

export function DifficultyGauge({
  difficulty,
}: {
  difficulty: Record<'easy' | 'medium' | 'hard', number>
}) {
  const data = [
    { name: 'Easy', value: difficulty.easy, color: '#1f9d5c' },
    { name: 'Medium', value: difficulty.medium, color: '#f2b84b' },
    { name: 'Hard', value: difficulty.hard, color: '#e0484f' },
  ]
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const hardShare =
    total === 0 ? 0 : Math.round((difficulty.hard / total) * 100)
  return (
    <InsightCard
      className="lg:col-span-4"
      description="Difficulty of every solve with known difficulty."
      title="Difficulty split"
    >
      {total === 0 ? (
        <EmptyInsight>No difficulty data yet.</EmptyInsight>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="relative h-40">
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  cy="92%"
                  data={data}
                  dataKey="value"
                  endAngle={0}
                  innerRadius="115%"
                  outerRadius="170%"
                  paddingAngle={2}
                  startAngle={180}
                  stroke="none"
                >
                  {data.map((item) => (
                    <Cell fill={item.color} key={item.name} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">
              <p className="font-heading text-3xl leading-none font-bold">
                {hardShare}%
              </p>
              <p className="text-xs text-muted-foreground">hard problems</p>
            </div>
          </div>
          <ul className="mt-4 grid grid-cols-3 gap-2 text-center">
            {data.map((item) => (
              <li
                className="rounded-lg border border-border py-2"
                key={item.name}
              >
                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="size-2 rounded-sm"
                    style={{ background: item.color }}
                  />
                  {item.name}
                </p>
                <p className="mt-0.5 font-heading text-lg font-bold tabular-nums">
                  {item.value.toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Rating ladder: bands stacked by platform.

export function RatingLadder({
  bands,
}: {
  bands: AnalyticsInsights['ratingBands']
}) {
  const providers = (
    ['codeforces', 'codechef', 'leetcode', 'cses'] as const
  ).filter((provider) => bands.some((band) => band[provider] > 0))
  const data = bands.map((band) => ({ ...band, label: String(band.min) }))
  return (
    <InsightCard
      className="lg:col-span-7"
      description="Every rated solve by problem rating, stacked by platform."
      title="Rating ladder"
    >
      {data.length === 0 ? (
        <EmptyInsight>No rated solves yet.</EmptyInsight>
      ) : (
        <div className="h-72" role="img" aria-label="Solves by problem rating">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
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
                labelFormatter={(_, payload) => {
                  const band = payload[0]?.payload as
                    { min?: number; max?: number } | undefined
                  return band?.min === undefined
                    ? ''
                    : `Rating ${band.min}–${band.max}`
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {providers.map((provider, index) => (
                <Bar
                  dataKey={provider}
                  fill={providerColors[provider]}
                  key={provider}
                  name={providerLabels[provider]}
                  radius={
                    index === providers.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]
                  }
                  stackId="rating"
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Verdict donut.

const verdictMeta = [
  { key: 'accepted', label: 'Accepted', color: '#1f9d5c' },
  { key: 'wrongAnswer', label: 'Wrong answer', color: '#e0484f' },
  { key: 'timeLimit', label: 'Time limit', color: '#f2b84b' },
  { key: 'memoryLimit', label: 'Memory limit', color: '#8b5cf6' },
  { key: 'runtimeError', label: 'Runtime error', color: '#ff4d12' },
  { key: 'compileError', label: 'Compile error', color: '#14a3a3' },
  { key: 'other', label: 'Other', color: '#6c7a90' },
] as const

export function VerdictDonut({
  verdicts,
  total,
}: {
  verdicts: AnalyticsInsights['verdicts']
  total: number
}) {
  const data = verdictMeta
    .map((meta) => ({ ...meta, value: verdicts[meta.key] }))
    .filter((item) => item.value > 0)
  const accepted =
    total === 0 ? 0 : Math.round((verdicts.accepted / total) * 100)
  return (
    <InsightCard
      className="lg:col-span-5"
      description={`All ${total.toLocaleString()} observed submissions.`}
      title="Verdicts"
    >
      {data.length === 0 ? (
        <EmptyInsight>No submissions observed yet.</EmptyInsight>
      ) : (
        <div className="grid flex-1 items-center gap-4 sm:grid-cols-2">
          <div className="relative h-56">
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  innerRadius="62%"
                  nameKey="label"
                  outerRadius="92%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((item) => (
                    <Cell fill={item.color} key={item.key} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="font-heading text-3xl leading-none font-bold">
                  {accepted}%
                </p>
                <p className="text-xs text-muted-foreground">accepted</p>
              </div>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {data.map((item) => (
              <li className="flex items-center gap-2" key={item.key}>
                <span
                  className="size-3 rounded-sm"
                  style={{ background: item.color }}
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <span className="font-semibold tabular-nums">
                  {item.value.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Topic pie (all-time tag counts).

export function TopicPieChart({
  topicCounts,
}: {
  topicCounts: Record<string, number>
}) {
  const sorted = Object.entries(topicCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
  const top = sorted.slice(0, 9)
  const rest = sorted.slice(9).reduce((sum, [, count]) => sum + count, 0)
  const data = [
    ...top.map(([name, value]) => ({ name: titleCase(name), value })),
    ...(rest > 0 ? [{ name: 'Other', value: rest }] : []),
  ]
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return (
    <InsightCard
      className="lg:col-span-7"
      description="Share of tagged solves per topic (all time)."
      title="Topic mix"
    >
      {data.length === 0 ? (
        <EmptyInsight>No tagged solves yet.</EmptyInsight>
      ) : (
        <div className="grid flex-1 items-center gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="h-72" role="img" aria-label="Topic mix">
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
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
                <span className="w-10 text-right font-semibold tabular-nums">
                  {item.value.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Topic strength: diverging bars of solves (right) vs failed submissions (left).

export function TopicStrength({
  topics,
}: {
  topics: AnalyticsInsights['topicStrength']
}) {
  const data = topics.slice(0, 10).map((topic) => ({
    topic: titleCase(topic.topic),
    solved: topic.solved,
    failed: -topic.failedSubmissions,
    averageRating: topic.averageRating,
  }))
  return (
    <InsightCard
      className="lg:col-span-5"
      description="Solves to the right, failed submissions to the left."
      title="Topic strength"
    >
      {data.length === 0 ? (
        <EmptyInsight>Not enough tagged activity yet.</EmptyInsight>
      ) : (
        <div className="h-80" role="img" aria-label="Topic strength">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 8, left: 8, bottom: 0 }}
              stackOffset="sign"
            >
              <CartesianGrid
                horizontal={false}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
              <XAxis
                tick={axisTick}
                tickFormatter={(value: number) => String(Math.abs(value))}
                type="number"
              />
              <YAxis
                dataKey="topic"
                tick={axisTick}
                tickLine={false}
                type="category"
                width={132}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: 'var(--muted)' }}
                formatter={(value, name) => [Math.abs(Number(value)), name]}
              />
              <Bar
                dataKey="failed"
                fill="#e0484f"
                name="Failed submissions"
                radius={[4, 0, 0, 4]}
                stackId="topic"
              />
              <Bar
                dataKey="solved"
                fill="#1f9d5c"
                name="Solved"
                radius={[0, 4, 4, 0]}
                stackId="topic"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Languages: horizontal bars.

export function LanguageBars({
  languages,
}: {
  languages: Record<string, number>
}) {
  const data = Object.entries(languages)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }))
  return (
    <InsightCard
      className="lg:col-span-4"
      description="Accepted solutions by language."
      title="Languages"
    >
      {data.length === 0 ? (
        <EmptyInsight>No language data yet.</EmptyInsight>
      ) : (
        <div className="h-56" role="img" aria-label="Languages">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
            >
              <XAxis hide type="number" />
              <YAxis
                dataKey="name"
                tick={axisTick}
                tickLine={false}
                type="category"
                width={96}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: 'var(--muted)' }}
              />
              <Bar
                dataKey="value"
                label={{
                  fill: 'var(--muted-foreground)',
                  fontSize: 11,
                  position: 'right',
                }}
                name="Solves"
                radius={[0, 5, 5, 0]}
              >
                {data.map((item, index) => (
                  <Cell
                    fill={palette[(index + 1) % palette.length]}
                    key={item.name}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Hardest solves.

export function HardestSolves({
  problems,
}: {
  problems: AnalyticsInsights['hardestSolved']
}) {
  return (
    <InsightCard
      className="lg:col-span-4"
      description="Your highest-rated accepted problems."
      title="Hardest solves"
    >
      {problems.length === 0 ? (
        <EmptyInsight>No rated solves yet.</EmptyInsight>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {problems.map((problem, index) => (
            <li
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
              key={`${problem.provider}:${problem.externalId}`}
            >
              <span className="w-5 text-center font-heading text-sm font-bold text-muted-foreground">
                {index + 1}
              </span>
              <ProviderLogo className="size-4" provider={problem.provider} />
              <span
                className="min-w-0 flex-1 truncate text-sm font-medium"
                title={problem.title}
              >
                {problem.title}
              </span>
              <span
                className="rounded-md px-2 py-0.5 text-xs font-bold text-white tabular-nums"
                style={{
                  background: `color-mix(in oklab, #e0484f ${Math.min(100, Math.max(20, (problem.rating - 800) / 20))}%, #2d6cdf)`,
                }}
              >
                {Math.round(problem.rating)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </InsightCard>
  )
}
