import { Link } from 'react-router-dom'
import type {
  ProgressInsight,
  ProgressNarrative,
  ProgressReport,
} from '@algomemtor/shared-contracts'

import {
  ArrowRight,
  CheckCircle2,
  Flame,
  RefreshCw,
  Sparkles,
  TrendingDown,
} from '@/components/icons/algo-icons'
import { AiLoader, type AiLoaderStep } from '@/components/motion/AiLoader'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { useNotification } from '@/app/useNotification'
import { SectionCard, StatTile } from '@/features/mentor/components/shared'
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
  value === null ? '—' : `${Math.round(value * 100)}%`

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

function Bars({
  values,
  labels,
  format,
  label,
}: {
  values: readonly (number | null)[]
  labels: readonly string[]
  format: (value: number | null) => string
  label: string
}) {
  const max = Math.max(1e-9, ...values.map((value) => value ?? 0))
  return (
    <ul
      aria-label={label}
      className="flex min-w-0 items-end gap-1.5 overflow-x-auto pb-1"
    >
      {values.map((value, index) => (
        <li
          aria-label={`${labels[index]}: ${format(value)}`}
          className="flex w-9 shrink-0 flex-col items-center gap-1"
          key={labels[index] ?? index}
        >
          <span className="text-[0.65rem] tabular-nums text-muted-foreground">
            {value === null ? '' : format(value)}
          </span>
          <div className="flex h-24 w-6 items-end overflow-hidden rounded-sm bg-secondary">
            <div
              className={cn(
                'w-full',
                value === null ? 'bg-transparent' : 'bg-primary',
              )}
              style={{ height: `${((value ?? 0) / max) * 100}%` }}
            />
          </div>
          <span className="text-[0.65rem] text-muted-foreground">
            {labels[index]}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Sparkline({ points }: { points: readonly { rating: number }[] }) {
  if (points.length < 2) return null
  const ratings = points.map((point) => point.rating)
  const min = Math.min(...ratings)
  const max = Math.max(...ratings)
  const span = Math.max(1, max - min)
  const path = ratings
    .map((rating, index) => {
      const x = (index / (ratings.length - 1)) * 100
      const y = 36 - ((rating - min) / span) * 32
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
  return (
    <svg
      aria-hidden="true"
      className="h-12 w-full text-primary"
      preserveAspectRatio="none"
      viewBox="0 0 100 40"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
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

function ReportBody({ report }: { report: ProgressReport }) {
  const weeks = report.accuracy.map((week) => shortDate(week.weekStart))
  return (
    <>
      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <SectionCard
          description="Share of new problems accepted on the first submission, by week."
          id="accuracy-heading"
          title="First-attempt accuracy"
        >
          <Bars
            format={pct}
            label="First-attempt accuracy by week"
            labels={weeks}
            values={report.accuracy.map((week) => week.rate)}
          />
        </SectionCard>
        <SectionCard
          description="Active days and problems solved per week."
          id="consistency-heading"
          title="Consistency"
        >
          <dl className="mb-4 grid grid-cols-3 gap-3">
            <StatTile
              label="Current streak"
              value={`${report.consistency.currentStreak}d`}
            />
            <StatTile
              label="Longest streak"
              value={`${report.consistency.longestStreak}d`}
            />
            <StatTile
              label="Active days (30d)"
              value={report.consistency.activeDaysLast30}
            />
          </dl>
          <Bars
            format={(value) => `${value ?? 0}`}
            label="Problems solved by week"
            labels={weeks}
            values={report.consistency.weekly.map((week) => week.solved)}
          />
        </SectionCard>
      </div>

      <SectionCard
        description="Recent contest ratings, change per contest and a projection if the recent pace continues. Projections are estimates, not promises."
        id="rating-heading"
        title="Rating trajectory"
      >
        {report.ratingTrend.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rated contests yet. Take part in one to start your trajectory.
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {report.ratingTrend.map((trend) => (
              <li
                className="rounded-lg border border-border p-4"
                key={trend.provider}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">
                    {providerLabels[trend.provider]}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums text-foreground">
                    {trend.current ?? '—'}
                  </p>
                </div>
                <Sparkline points={trend.points} />
                <p className="mt-1 text-xs text-muted-foreground">
                  {trend.changePerContest === null
                    ? 'Needs three rated contests for a trend.'
                    : `${trend.changePerContest > 0 ? '+' : ''}${trend.changePerContest} per contest`}
                  {trend.projection90d === null
                    ? ''
                    : ` · about ${trend.projection90d} in 90 days at this pace`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <SectionCard
          description="Median minutes per solved contest problem, earlier vs recent contests, by difficulty."
          id="speed-heading"
          title="Solving speed"
        >
          {report.solvingSpeed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Solving speed comes from contest submissions. Analyze a contest
              with synced submissions to see it.
            </p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium" scope="col">
                    Difficulty
                  </th>
                  <th className="py-2 font-medium" scope="col">
                    Earlier
                  </th>
                  <th className="py-2 font-medium" scope="col">
                    Recent
                  </th>
                  <th className="py-2 font-medium" scope="col">
                    Samples
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.solvingSpeed.map((row) => (
                  <tr className="border-t border-border" key={row.band}>
                    <td className="py-2">{row.band}</td>
                    <td className="py-2 tabular-nums">
                      {row.earlierMedianMinutes === null
                        ? '—'
                        : `${row.earlierMedianMinutes} min`}
                    </td>
                    <td
                      className={cn(
                        'py-2 tabular-nums',
                        row.earlierMedianMinutes !== null &&
                          row.recentMedianMinutes !== null &&
                          (row.recentMedianMinutes < row.earlierMedianMinutes
                            ? 'text-go-foreground'
                            : row.recentMedianMinutes > row.earlierMedianMinutes
                              ? 'text-sun-foreground'
                              : ''),
                      )}
                    >
                      {row.recentMedianMinutes === null
                        ? '—'
                        : `${row.recentMedianMinutes} min`}
                    </td>
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {row.samples}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
        <SectionCard
          description="How much you lean on the Doubt Helper. Falling hint levels mean growing independence."
          id="hints-heading"
          title="Hint dependency"
        >
          <dl className="mb-4 grid grid-cols-3 gap-3">
            <StatTile
              label="Sessions (12w)"
              value={report.hintDependency.sessions}
            />
            <StatTile
              label="Avg hint level"
              value={report.hintDependency.averageHintLevel ?? '—'}
            />
            <StatTile
              label="Full reveals"
              value={pct(report.hintDependency.solutionRevealRate)}
            />
          </dl>
          <p className="text-xs text-muted-foreground">
            Trend:{' '}
            {report.hintDependency.trend === 'insufficient_data'
              ? 'not enough sessions yet'
              : report.hintDependency.trend}
          </p>
        </SectionCard>
      </div>

      <SectionCard
        description="Assessed from your provider evidence and learning pathway."
        id="topics-heading"
        title="Topic progress"
      >
        {report.topicProgress.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Topic progress appears once your pathway has evidence.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {report.topicProgress.map((topic) => (
              <li className="min-w-0" key={topic.topic}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-foreground">
                    {topic.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {topic.solved} solved ·{' '}
                    {topic.recentDays === 0
                      ? 'not recent'
                      : `${topic.recentDays}d ago`}
                  </span>
                </div>
                <div
                  aria-label={`${topic.name} score ${Math.round(topic.score * 100)}%`}
                  className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary"
                  role="img"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(3, topic.score * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[0.7rem] text-muted-foreground capitalize">
                  {topic.assessment.replaceAll('_', ' ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
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
