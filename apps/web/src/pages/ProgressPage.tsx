import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from 'react-router-dom'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { useLearnerMemories } from '@/features/memory/hooks/useLearnerMemories'
import { useProgressAnalytics } from '@/features/progress/hooks/useProgress'

type Analytics = NonNullable<
  ReturnType<typeof useProgressAnalytics>['data']
>['data']

const chartTooltipStyle = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  color: 'var(--popover-foreground)',
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00.000Z`))
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </dd>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  )
}

function ChartCard({
  children,
  description,
  title,
}: {
  children: React.ReactNode
  description: string
  title: string
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        {description}
      </p>
      {children}
    </section>
  )
}

function DailyPractice({ analytics }: { analytics: Analytics }) {
  const data = analytics.trend.map((point) => ({
    ...point,
    dateLabel: shortDate(point.date),
  }))
  const hasActivity = data.some((point) => point.solved > 0)

  return (
    <ChartCard
      description={`Newly solved problems on each local day in ${analytics.timezone}.`}
      title="Daily practice"
    >
      {hasActivity ? (
        <>
          <div
            aria-label={`Daily solved problems: ${data
              .filter((point) => point.solved > 0)
              .map((point) => `${point.date}: ${point.solved}`)
              .join(', ')}`}
            className="mt-5 h-64 w-full"
            role="img"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                data={data}
                margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="dateLabel"
                  interval={4}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value) => [value, 'Problems solved']}
                />
                <Bar
                  dataKey="solved"
                  fill="var(--primary)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          No dated solves were observed in this period.
        </p>
      )}
    </ChartCard>
  )
}

function PracticeSignals({ analytics }: { analytics: Analytics }) {
  const activeDays = analytics.trend.filter((day) => day.solved > 0).length
  const recent = analytics.trend.slice(-15)
  const previous = analytics.trend.slice(0, -15)
  const last15Active = recent.filter((day) => day.solved > 0).length
  const previousActive = previous.filter((day) => day.solved > 0).length
  const daysSincePractice = [...analytics.trend]
    .reverse()
    .findIndex((day) => day.solved > 0)

  return (
    <ChartCard
      description="Based on dated solves from connected providers and your recorded statuses."
      title="Practice signals"
    >
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric
          detail={`Out of ${analytics.window.days} local days`}
          label="Active days"
          value={String(activeDays)}
        />
        <Metric
          detail={
            daysSincePractice < 0
              ? 'No recorded solve in this window'
              : daysSincePractice === 0
                ? 'You practiced today'
                : `${daysSincePractice} full local days since practice`
          }
          label="Last practiced"
          value={
            daysSincePractice < 0
              ? '—'
              : daysSincePractice === 0
                ? 'Today'
                : `${daysSincePractice}d ago`
          }
        />
        <Metric
          detail={`${previousActive} active days in the preceding ${previous.length} days`}
          label="Recent rhythm"
          value={`${last15Active}/${recent.length} days`}
        />
      </dl>
    </ChartCard>
  )
}

function TopicPractice({ analytics }: { analytics: Analytics }) {
  const topics = [...analytics.topicActivity]
    .filter((topic) => topic.solved > 0)
    .sort((left, right) => right.solved - left.solved)
    .slice(0, 8)

  return (
    <ChartCard
      description="Recognized topics on newly solved problems in the last 30 days. A problem can appear under more than one topic; untagged problems are excluded."
      title="Topics practiced"
    >
      {topics.length ? (
        <>
          <div
            aria-label={`Most solved topics: ${topics
              .map((topic) => `${topic.topic}: ${topic.solved}`)
              .join(', ')}`}
            className="mt-5 h-72 w-full"
            role="img"
          >
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                data={topics}
                layout="vertical"
                margin={{ top: 0, right: 8, bottom: 0, left: 8 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  allowDecimals={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  type="number"
                />
                <YAxis
                  dataKey="topic"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  type="category"
                  width={118}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(value) => [value, 'Problems solved']}
                />
                <Bar
                  dataKey="solved"
                  fill="var(--primary)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          No tagged, dated practice was found in this period.
        </p>
      )}
    </ChartCard>
  )
}

function AnalyticsSection({ analytics }: { analytics: Analytics }) {
  let currentSolveStreak = 0
  for (const day of [...analytics.trend].reverse()) {
    if (day.solved === 0) break
    currentSolveStreak += 1
  }
  return (
    <div className="space-y-5">
      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Metric
          detail="Unique problems newly solved in this period"
          label="Problems practiced"
          value={String(analytics.window.solved)}
        />
        <Metric
          detail="Consecutive days with a recorded solve"
          label="Current solve streak"
          value={`${currentSolveStreak} days`}
        />
      </dl>
      <DailyPractice analytics={analytics} />
      <PracticeSignals analytics={analytics} />
      <TopicPractice analytics={analytics} />
      <p className="text-xs text-muted-foreground">
        Provider observations can be partial. Counts include only dated activity
        currently available to AlgoMemtor.
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
        description="See how your practice has developed over the last 30 local days."
        title="Progress"
      />
      <MemoryProcessingNotice />
      <section
        aria-labelledby="progress-analytics-heading"
        className="space-y-4"
      >
        <div>
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="progress-analytics-heading"
          >
            30-day overview
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent solves, practice rhythm, and the topics behind them.
          </p>
        </div>
        {analyticsQuery.isPending ? (
          <PageSkeleton label="Loading progress analytics" rows={3} />
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
      </section>
    </PageContainer>
  )
}

export default ProgressPage
