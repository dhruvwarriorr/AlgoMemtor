import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  ProgressInsight,
  ProgressNarrative,
  ProgressReport,
} from '@algomemtor/shared-contracts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Crosshair,
  Flame,
  Lightbulb,
  Lock,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
} from '@/components/icons/algo-icons'
import { RadialProgress } from '@/components/motion/RadialProgress'
import { AiLoader, type AiLoaderStep } from '@/components/motion/AiLoader'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { useNotification } from '@/app/useNotification'
import {
  axisTick,
  chartColors,
  providerColors,
  tooltipStyle,
} from '@/features/mentor/chart-theme'
import { SectionCard } from '@/features/mentor/components/shared'
import {
  ChartCard,
  ChartEmpty,
  KpiTile,
} from '@/features/mentor/components/visuals'
import {
  formatDateTime,
  mentorErrorMessage,
  providerLabels,
} from '@/features/mentor/format'
import { insightTargetPath } from '@/features/mentor/feature-routes'
import {
  useProgressNarrative,
  useProgressReport,
} from '@/features/mentor/hooks'
import { cn } from '@/lib/utils'

const narrativeSteps: readonly AiLoaderStep[] = [
  { label: 'Reading your trends', indicator: 'bar' },
  { label: 'Finding what changed', indicator: 'grid' },
  { label: 'Writing your report', indicator: 'dots' },
]

const pct = (value: number | null) =>
  value === null ? '-' : `${Math.round(value * 100)}%`

const shortDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(new Date(`${value}T00:00:00`))
  } catch {
    return value
  }
}

function InsightItem({ insight }: { insight: ProgressInsight }) {
  const Icon =
    insight.tone === 'positive'
      ? CheckCircle2
      : insight.tone === 'warning'
        ? TrendingDown
        : Sparkles
  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between',
        insight.tone === 'positive'
          ? 'border-go/40 bg-go-soft/60'
          : insight.tone === 'warning'
            ? 'border-sun/50 bg-sun-soft/60'
            : 'border-border bg-card',
      )}
    >
      <p className="flex min-w-0 gap-2.5 text-sm leading-6 text-foreground">
        <Icon
          aria-hidden="true"
          className={cn(
            'mt-0.5 size-4 shrink-0',
            insight.tone === 'positive'
              ? 'text-go-foreground'
              : insight.tone === 'warning'
                ? 'text-sun-foreground'
                : 'text-primary',
          )}
        />
        <span>{insight.text}</span>
      </p>
      {insight.link ? (
        <Link
          className={cn(
            buttonVariants({ size: 'sm', variant: 'outline' }),
            'shrink-0',
          )}
          to={insightTargetPath(insight.link.target)}
        >
          {insight.link.label} <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </li>
  )
}

function NarrativeCard({
  narrative,
  onRefresh,
  pending,
}: {
  narrative: ProgressNarrative
  onRefresh: () => void
  pending: boolean
}) {
  return (
    <section className="rounded-xl border border-[color-mix(in_oklab,var(--primary)_35%,var(--border))] bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-primary uppercase">
          <Sparkles aria-hidden="true" className="size-3.5" /> This week's
          insight report
        </p>
        <Button
          disabled={pending}
          onClick={onRefresh}
          size="sm"
          type="button"
          variant="ghost"
        >
          <RefreshCw aria-hidden="true" /> Rewrite
        </Button>
      </div>
      <h2 className="mt-2 text-xl text-foreground sm:text-2xl">
        {narrative.headline}
      </h2>
      <p className="mt-2 max-w-3xl text-[0.95rem] leading-7 text-foreground/90">
        {narrative.summary}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {(
          [
            ['Wins', narrative.wins],
            ['Watch out', narrative.concerns],
            ['Next steps', narrative.nextSteps],
          ] as const
        ).map(([title, items]) =>
          items.length === 0 ? null : (
            <div key={title}>
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6">
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Written {formatDateTime(narrative.generatedAt)} from the metrics below.
      </p>
    </section>
  )
}

function ReportKpis({ report }: { report: ProgressReport }) {
  const latestAccuracy = [...report.accuracy]
    .reverse()
    .find((week) => week.rate !== null)
  const hints = report.hintDependency
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        detail={`Longest ${report.consistency.longestStreak} days`}
        icon={Flame}
        label="Current streak"
        tone="accent"
        value={`${report.consistency.currentStreak}d`}
      />
      <KpiTile
        detail="Of the last 30 days"
        icon={CalendarCheck}
        label="Active days"
        tone="green"
        value={report.consistency.activeDaysLast30}
      />
      <KpiTile
        detail={
          latestAccuracy === undefined
            ? 'No attempts yet'
            : `${latestAccuracy.firstTryAccepted} of ${latestAccuracy.attempted} in the latest week`
        }
        icon={Target}
        label="First-try accuracy"
        tone="sky"
        value={pct(latestAccuracy?.rate ?? null)}
      />
      <KpiTile
        detail="Doubt Helper, last 12 weeks"
        icon={Crosshair}
        label="Help sessions"
        tone="sand"
        value={hints.sessions}
      />
      <KpiTile
        detail="1 nudge to 5 full solution"
        icon={Lightbulb}
        label="Average hint"
        tone="sky"
        value={hints.averageHintLevel ?? '-'}
      />
      <KpiTile
        detail="Sessions that revealed the solution"
        icon={Lock}
        label="Full reveals"
        tone="sand"
        value={pct(hints.solutionRevealRate)}
      />
    </dl>
  )
}

function ReportBody({ report }: { report: ProgressReport }) {
  const accuracy = report.accuracy.map((week) => ({
    label: shortDate(week.weekStart),
    rate: week.rate === null ? null : Math.round(week.rate * 100),
  }))
  const weekly = report.consistency.weekly.map((week) => ({
    label: shortDate(week.weekStart),
    solved: week.solved,
    activeDays: week.activeDays,
  }))
  const speed = report.solvingSpeed.map((row) => ({
    band: row.band,
    earlier: row.earlierMedianMinutes,
    recent: row.recentMedianMinutes,
  }))
  const hints = report.hintDependency
  return (
    <>
      <ReportKpis report={report} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          description="Share of new problems accepted on the first submission, by week."
          title="First-attempt accuracy"
        >
          {accuracy.every((week) => week.rate === null) ? (
            <ChartEmpty>
              Accuracy appears once you attempt new problems.
            </ChartEmpty>
          ) : (
            <div
              aria-label="First-attempt accuracy by week"
              className="h-56 w-full"
              role="img"
            >
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart
                  data={accuracy}
                  margin={{ top: 6, right: 6, left: -22, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="accuracy-fill"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={chartColors.accent}
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="100%"
                        stopColor={chartColors.accent}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    tick={axisTick}
                    tickFormatter={(value: number) => `${value}%`}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [`${String(value)}%`, 'First try']}
                  />
                  <Area
                    connectNulls
                    dataKey="rate"
                    fill="url(#accuracy-fill)"
                    stroke={chartColors.accent}
                    strokeWidth={2.2}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
        <ChartCard
          className="lg:col-span-5"
          description="Problems solved and active days per week."
          title="Consistency"
        >
          {weekly.length === 0 ? (
            <ChartEmpty>Weekly activity appears once you practice.</ChartEmpty>
          ) : (
            <div
              aria-label="Problems solved by week"
              className="h-56 w-full"
              role="img"
            >
              <ResponsiveContainer height="100%" width="100%">
                <BarChart
                  data={weekly}
                  margin={{ top: 6, right: 6, left: -24, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} />
                  <YAxis
                    allowDecimals={false}
                    tick={axisTick}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                  />
                  <Bar
                    dataKey="solved"
                    fill={chartColors.solved}
                    name="Solved"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="activeDays"
                    fill={chartColors.accent}
                    name="Active days"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard
        description="Rating after each recent contest, the change per contest, and a projection if the pace holds. Projections are estimates, not promises."
        title="Rating trajectory"
      >
        {report.ratingTrend.length === 0 ? (
          <ChartEmpty>
            No rated contests yet. Take part in one to start your trajectory.
          </ChartEmpty>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {report.ratingTrend.map((trend) => (
              <li
                className="rounded-xl bg-secondary/40 p-4"
                key={trend.provider}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ProviderLogo
                      className="size-5"
                      provider={trend.provider}
                    />
                    {providerLabels[trend.provider]}
                  </p>
                  <p className="font-heading text-2xl font-bold tabular-nums text-foreground">
                    {trend.current ?? '-'}
                  </p>
                </div>
                {trend.points.length >= 2 ? (
                  <div
                    aria-label={`${providerLabels[trend.provider]} rating`}
                    className="mt-2 h-28 w-full"
                    role="img"
                  >
                    <ResponsiveContainer height="100%" width="100%">
                      <LineChart
                        data={trend.points.map((point) => ({
                          label: shortDate(point.date.slice(0, 10)),
                          rating: Math.round(point.rating),
                        }))}
                        margin={{ top: 6, right: 6, left: -18, bottom: 0 }}
                      >
                        <XAxis dataKey="label" hide />
                        <YAxis
                          domain={['dataMin - 40', 'dataMax + 40']}
                          tick={axisTick}
                          tickLine={false}
                          width={48}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line
                          dataKey="rating"
                          dot={{ r: 2.5 }}
                          name="Rating"
                          stroke={providerColors[trend.provider]}
                          strokeWidth={2.2}
                          type="monotone"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {trend.changePerContest === null
                    ? 'Needs three rated contests for a trend.'
                    : `${trend.changePerContest > 0 ? '+' : ''}${trend.changePerContest} per contest`}
                  {trend.projection90d === null
                    ? ''
                    : `, about ${trend.projection90d} in 90 days at this pace`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          description="Median minutes per solved contest problem, earlier against recent contests, by difficulty."
          title="Solving speed"
        >
          {speed.length === 0 ? (
            <ChartEmpty>
              Solving speed comes from contest submissions.
            </ChartEmpty>
          ) : (
            <div
              aria-label="Solving speed by difficulty"
              className="h-56 w-full"
              role="img"
            >
              <ResponsiveContainer height="100%" width="100%">
                <BarChart
                  data={speed}
                  margin={{ top: 6, right: 6, left: -22, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis dataKey="band" tick={axisTick} tickLine={false} />
                  <YAxis tick={axisTick} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                  />
                  <Bar
                    dataKey="earlier"
                    fill="var(--muted-foreground)"
                    fillOpacity={0.45}
                    name="Earlier (min)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="recent"
                    fill={chartColors.accent}
                    name="Recent (min)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
        <ChartCard
          className="lg:col-span-5"
          description="How much you lean on the Doubt Helper. Lower hint levels mean growing independence."
          title="Hint dependency"
        >
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <RadialProgress
              className="size-36"
              thickness={10}
              value={(hints.averageHintLevel ?? 0) / 5}
            >
              <span className="text-center">
                <span className="block font-heading text-3xl font-bold tabular-nums">
                  {hints.averageHintLevel ?? '-'}
                </span>
                <span className="text-xs text-muted-foreground">of 5</span>
              </span>
            </RadialProgress>
            <p className="text-center text-sm text-muted-foreground">
              {hints.trend === 'insufficient_data'
                ? 'Not enough sessions for a trend yet.'
                : hints.trend === 'falling'
                  ? 'Hint levels are falling: you need less help.'
                  : hints.trend === 'rising'
                    ? 'Hint levels are rising lately.'
                    : 'Hint levels are steady.'}
            </p>
          </div>
        </ChartCard>
      </div>

      <ChartCard
        description="Assessed from your provider evidence and recent practice."
        title="Topic progress"
      >
        {report.topicProgress.length === 0 ? (
          <ChartEmpty>
            Topic progress appears once enough practice evidence is available.
          </ChartEmpty>
        ) : (
          <ul className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
            {report.topicProgress.map((topic) => (
              <li className="min-w-0" key={topic.topic}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-foreground">
                    {topic.name}
                  </span>
                  <span className="shrink-0 font-heading font-bold tabular-nums">
                    {Math.round(topic.score * 100)}
                  </span>
                </div>
                <div
                  aria-label={`${topic.name} score ${Math.round(topic.score * 100)}%`}
                  className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary"
                  role="img"
                >
                  <div
                    className="h-full rounded-full bg-linear-to-r from-[var(--brand-a)] to-[var(--brand-b)]"
                    style={{ width: `${Math.max(3, topic.score * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[0.7rem] text-muted-foreground">
                  <span className="capitalize">
                    {topic.assessment.replaceAll('_', ' ')}
                  </span>
                  , {topic.solved} solved,{' '}
                  {topic.recentDays === 0
                    ? 'not recent'
                    : `${topic.recentDays}d ago`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </>
  )
}

function ProgressReportPage() {
  const { notify } = useNotification()
  const reportQuery = useProgressReport()
  const narrative = useProgressNarrative()

  const generate = (refresh: boolean) =>
    narrative.mutate(refresh, {
      onError: (error) =>
        notify({
          title: 'The insight report could not be written',
          description: mentorErrorMessage(error, 'Try again shortly.'),
          tone: 'error',
        }),
    })

  const stored = reportQuery.data?.narrative
  const header = (
    <PageHeader
      action={
        <>
          <Link
            className={buttonVariants({ variant: 'outline' })}
            to="/progress"
          >
            Practice log
          </Link>
          {stored === undefined ? (
            <Button
              disabled={narrative.isPending || reportQuery.isPending}
              onClick={() => generate(false)}
              type="button"
            >
              <Sparkles aria-hidden="true" /> Write insight report
            </Button>
          ) : null}
        </>
      }
      description="Your growth, interpreted: topic progress, first-try accuracy, solving speed, rating trajectory, consistency and how much you rely on hints."
      title="Progress report"
    />
  )

  if (reportQuery.isPending) {
    return (
      <PageContainer>
        {header}
        <PageSkeleton label="Evaluating your progress" rows={5} />
      </PageContainer>
    )
  }
  if (reportQuery.isError) {
    return (
      <PageContainer>
        {header}
        <ErrorState
          message={mentorErrorMessage(
            reportQuery.error,
            'Your progress report could not be built.',
          )}
          onRetry={() => void reportQuery.refetch()}
          title="Report unavailable"
        />
      </PageContainer>
    )
  }

  const report = reportQuery.data.data
  return (
    <PageContainer>
      {header}
      {narrative.isPending ? (
        <div
          className="rounded-xl border border-border bg-card p-6"
          role="status"
        >
          <AiLoader
            steps={narrativeSteps}
            title="Writing your insight report"
          />
        </div>
      ) : stored !== undefined ? (
        <NarrativeCard
          narrative={stored}
          onRefresh={() => generate(true)}
          pending={narrative.isPending}
        />
      ) : null}

      <SectionCard
        action={
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Flame aria-hidden="true" className="size-3.5 text-primary" />
            Updated {formatDateTime(report.generatedAt)}
          </span>
        }
        description="Specific, evidence-based observations and what to do about them."
        id="insights-heading"
        title="Insights"
      >
        {report.insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keep practicing. Insights appear once there is enough activity to
            compare.
          </p>
        ) : (
          <ul className="grid gap-2">
            {report.insights.map((insight) => (
              <InsightItem insight={insight} key={insight.id} />
            ))}
          </ul>
        )}
      </SectionCard>

      <ReportBody report={report} />
    </PageContainer>
  )
}

export default ProgressReportPage
