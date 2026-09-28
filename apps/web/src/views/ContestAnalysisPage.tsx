import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useSearchParams } from '@/lib/router'
import type {
  ContestMetrics,
  ContestNarrative,
  ContestPatternMetrics,
  ContestPatternsReport,
  ContestSummary,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import { Link } from '@/lib/router'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import {
  Activity,
  Check,
  CheckCheck,
  RefreshCw,
  Sparkles,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from '@/components/icons/algo-icons'
import { RadialProgress } from '@/components/motion/RadialProgress'
import { AiLoader, type AiLoaderStep } from '@/components/motion/AiLoader'
import { PanelStyle } from '@/components/kit/Panel'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { useNotification } from '@/providers/useNotification'
import { providerShort, shortDay } from '@/features/mentor/chart-theme'
import {
  PressureMeters,
  ProblemScoreboard,
  RatingJourney,
  StartLanes,
} from '@/features/mentor/components/contest-visuals'
import { PlatformContestCards } from '@/features/mentor/components/contest-platforms'
import {
  ProviderProblemLink,
  SectionCard,
} from '@/features/mentor/components/shared'
import {
  ChartCard,
  ChartEmpty,
  KpiTile,
  ParticipationBadge,
  SignedDelta,
} from '@/features/mentor/components/visuals'
import {
  formatDateTime,
  humanTopic,
  mentorErrorMessage,
} from '@/features/mentor/format'
import {
  useContestDetail,
  useContestNarrative,
  useContestOverview,
  useContestPatterns,
  useRefreshContestOverview,
} from '@/features/mentor/hooks'
import { cn } from '@/lib/utils'
import { keepScrollState } from '@/routes/scroll-location'

const narrativeSteps: readonly AiLoaderStep[] = [
  { label: 'Replaying your submission timeline', indicator: 'bar' },
  { label: 'Looking for time and pressure patterns', indicator: 'grid' },
  { label: 'Writing strategy for next time', indicator: 'dots' },
]

const minutes = (value: number | undefined) =>
  value === undefined ? '-' : `${Math.round(value)} min`

function contestKey(provider: ProviderKey, contestId: string) {
  return `${provider}:${contestId}`
}

function parseContestKey(value: string | null) {
  if (value === null) return null
  const index = value.indexOf(':')
  if (index <= 0) return null
  const provider = value.slice(0, index)
  if (!['codeforces', 'codechef', 'leetcode', 'cses'].includes(provider)) {
    return null
  }
  return {
    provider: provider as ProviderKey,
    contestId: value.slice(index + 1),
  }
}

function Timeline({ metrics }: { metrics: ContestMetrics }) {
  const reduceMotion = useReducedMotion()
  const rows = metrics.problems.filter((problem) => problem.attempts > 0)
  if (rows.length === 0) return null
  const duration = metrics.durationMinutes
  return (
    <figure className="min-w-0">
      <figcaption className="sr-only">
        Submissions over the contest, one row per problem.
      </figcaption>
      <div className="relative grid gap-2">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 left-13 grid grid-cols-4"
        >
          {[0, 1, 2, 3].map((quarter) => (
            <span
              className="border-l border-dashed border-border/70"
              key={quarter}
            />
          ))}
        </span>
        {rows.map((problem, rowIndex) => {
          const events = metrics.timeline.filter(
            (event) => event.label === problem.label,
          )
          return (
            <div
              className="flex min-w-0 items-center gap-3"
              key={problem.label}
            >
              <span className="w-10 shrink-0 text-xs font-semibold text-foreground">
                {problem.label}
              </span>
              <div className="relative h-7 min-w-0 flex-1 rounded-lg bg-secondary/50">
                {problem.firstSubmitMinute !== undefined ? (
                  <motion.span
                    animate={{ scaleX: 1, opacity: 1 }}
                    className={cn(
                      'absolute inset-y-2.5 origin-left rounded-full',
                      problem.solved
                        ? 'bg-linear-to-r from-destructive/60 to-go'
                        : 'bg-destructive/40',
                    )}
                    initial={reduceMotion ? false : { scaleX: 0, opacity: 0 }}
                    transition={{
                      duration: 0.8,
                      ease: [0.16, 1, 0.3, 1],
                      delay: rowIndex * 0.1,
                    }}
                    style={{
                      left: `${(problem.firstSubmitMinute / duration) * 100}%`,
                      width: `${(((problem.solvedMinute ?? events.at(-1)?.minute ?? problem.firstSubmitMinute) - problem.firstSubmitMinute) / duration) * 100}%`,
                    }}
                  />
                ) : null}
                {events.map((event, index) => (
                  <motion.span
                    animate={{ scale: 1 }}
                    aria-hidden="true"
                    className={cn(
                      'absolute top-1/2 -mt-1.5 -ml-1.5 size-3 rounded-full ring-2 ring-card',
                      event.accepted
                        ? 'size-3.5 bg-go shadow-[0_0_10px_var(--go)]'
                        : 'bg-destructive',
                    )}
                    initial={reduceMotion ? false : { scale: 0 }}
                    key={`${event.minute}-${index}`}
                    style={{
                      left: `${Math.min(100, (event.minute / duration) * 100)}%`,
                    }}
                    title={`${event.verdict} at ${Math.round(event.minute)} min`}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 20,
                      delay: 0.3 + rowIndex * 0.1 + index * 0.05,
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between pl-13 text-[0.7rem] text-muted-foreground">
        <span>0 min</span>
        <span>{Math.round(duration / 2)} min</span>
        <span>{duration} min</span>
      </div>
      <p className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-go" /> Accepted
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive" /> Rejected
        </span>
      </p>
    </figure>
  )
}

function NarrativeView({ narrative }: { narrative: ContestNarrative }) {
  const list = (title: string, items: readonly string[], empty?: string) =>
    items.length === 0 && empty === undefined ? null : (
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {items.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground/90">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    )
  return (
    <div className="grid gap-5">
      <p className="text-base font-medium text-foreground">
        {narrative.headline}
      </p>
      <div>
        <h4 className="text-sm font-semibold text-foreground">
          Time management
        </h4>
        <p className="mt-1 text-sm leading-6 text-foreground/90">
          {narrative.timeManagement}
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {list(
          'Pressure signals',
          narrative.panicSignals,
          'No signs of panic in this contest.',
        )}
        {list('Weak contest topics', narrative.weakTopics)}
        {list('What drove the rating change', narrative.ratingChangeCauses)}
      </div>
      <div className="rounded-lg border border-[color-mix(in_oklab,var(--primary)_30%,var(--border))] bg-primary/5 px-4 py-3">
        {list('Strategy for your next contest', narrative.strategy)}
      </div>
      <p className="text-xs text-muted-foreground">
        Written {formatDateTime(narrative.generatedAt)} from your submission
        timestamps. Time between submissions is inferred, not observed.
      </p>
    </div>
  )
}

function ContestDetail({
  contest,
}: {
  contest: { provider: ProviderKey; contestId: string }
}) {
  const { notify } = useNotification()
  const detailQuery = useContestDetail(contest)
  const narrative = useContestNarrative()

  if (detailQuery.isPending) {
    return <PageSkeleton label="Analyzing contest" rows={4} />
  }
  if (detailQuery.isError) {
    return (
      <ErrorState
        message={mentorErrorMessage(
          detailQuery.error,
          'This contest could not be analyzed.',
        )}
        onRetry={() => void detailQuery.refetch()}
        title="Contest unavailable"
      />
    )
  }
  const { metrics, narrative: stored } = detailQuery.data.data
  const generate = (refresh: boolean) =>
    narrative.mutate(
      { ...contest, refresh },
      {
        onError: (error) =>
          notify({
            title: 'Analysis could not be written',
            description: mentorErrorMessage(error, 'Try again shortly.'),
            tone: 'error',
          }),
      },
    )
  const delta = metrics.ratingChange
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ProviderLogo className="size-5" provider={metrics.provider} />
          <span className="text-xs text-muted-foreground">
            {formatDateTime(metrics.startsAt)}, {metrics.durationMinutes} min
          </span>
        </div>
        <h2 className="mt-2 text-xl text-foreground sm:text-2xl">
          <ProviderProblemLink
            href={metrics.canonicalUrl}
            provider={metrics.provider}
            title={metrics.name}
          />
        </h2>
        {metrics.oldRating !== undefined && metrics.newRating !== undefined ? (
          <p className="mt-2 inline-flex items-center gap-2 rounded-md bg-secondary px-2.5 py-1 text-xs tabular-nums">
            <span className="text-muted-foreground">
              {Math.round(metrics.oldRating)}
            </span>
            <span aria-hidden="true">→</span>
            <span className="font-semibold text-foreground">
              {Math.round(metrics.newRating)}
            </span>
          </p>
        ) : null}
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile
            detail={`${metrics.attemptedCount} attempted`}
            icon={CheckCheck}
            label="Solved"
            tone="accent"
            value={`${metrics.solvedCount}/${metrics.problems.length}`}
          />
          <KpiTile
            detail={
              metrics.rank === undefined ? 'Not ranked' : `Rank ${metrics.rank}`
            }
            icon={delta !== undefined && delta < 0 ? TrendingDown : TrendingUp}
            label="Rating change"
            tone="sky"
            value={
              delta === undefined
                ? '-'
                : `${delta > 0 ? '+' : ''}${Math.round(delta)}`
            }
          />
          <KpiTile
            detail={`Longest gap ${minutes(metrics.longestGapMinutes)}`}
            icon={Zap}
            label="First accept"
            tone="green"
            value={minutes(metrics.firstAcceptedMinute)}
          />
          <KpiTile
            detail={`${metrics.rapidWrongResubmits} rushed, ${metrics.problemSwitches} switches`}
            icon={XCircle}
            label="Wrong submissions"
            tone="sand"
            value={metrics.wrongSubmissions}
          />
        </dl>
        {metrics.coverageNotes.length > 0 ? (
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
            {metrics.coverageNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <SectionCard
        description="Each dot is a submission; the bar spans first submission to acceptance."
        id="timeline-heading"
        title="Submission timeline"
      >
        {metrics.submissionCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            No submissions from this contest are in your synced activity.
          </p>
        ) : (
          <Timeline metrics={metrics} />
        )}
      </SectionCard>

      <SectionCard id="problems-heading" title="Problem breakdown">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium" scope="col">
                  Problem
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Rating
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Attempts
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Solved at
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Time spent
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Topics
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.problems.map((problem) => (
                <tr className="border-t border-border/60" key={problem.label}>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'grid size-7 shrink-0 place-items-center rounded-md text-xs font-semibold',
                          problem.solved
                            ? 'bg-go text-white'
                            : problem.attempts > 0
                              ? 'bg-danger-soft text-danger-foreground'
                              : 'bg-secondary text-secondary-foreground',
                        )}
                      >
                        {problem.label}
                      </span>
                      <span className="text-foreground/85">
                        {problem.title ?? ''}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {problem.rating ?? '—'}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {problem.attempts}
                    {problem.wrongAttempts > 0 ? (
                      <span className="text-destructive">
                        {' '}
                        ({problem.wrongAttempts} wrong)
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={cn(
                      'px-2 py-2 tabular-nums',
                      problem.solved
                        ? 'text-go-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    {problem.solved
                      ? minutes(problem.solvedMinute)
                      : 'Unsolved'}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
                      >
                        <span
                          className={cn(
                            'block h-full rounded-full',
                            problem.solved ? 'bg-go' : 'bg-destructive/70',
                          )}
                          style={{
                            width: `${Math.min(100, ((problem.minutesSpent ?? 0) / Math.max(1, ...metrics.problems.map((item) => item.minutesSpent ?? 0))) * 100)}%`,
                          }}
                        />
                      </span>
                      {minutes(problem.minutesSpent)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {problem.tags.slice(0, 3).map(humanTopic).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        action={
          stored !== undefined && !narrative.isPending ? (
            <Button
              onClick={() => generate(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" /> Rewrite
            </Button>
          ) : null
        }
        description="Panic patterns, time use, weak topics, rating-change causes and strategy."
        id="coach-analysis-heading"
        title="Mentor analysis"
      >
        {narrative.isPending ? (
          <div role="status">
            <AiLoader steps={narrativeSteps} title="Analyzing your contest" />
          </div>
        ) : stored !== undefined ? (
          <NarrativeView narrative={stored} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-sm text-muted-foreground">
              Get a written breakdown of this contest with concrete changes for
              next time. It is saved, so it only needs to be written once.
            </p>
            <Button
              disabled={metrics.submissionCount === 0}
              onClick={() => generate(false)}
              type="button"
            >
              <Sparkles aria-hidden="true" /> Analyze this contest
            </Button>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function PatternKpis({ patterns }: { patterns: ContestPatternMetrics }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        detail="With synced submissions"
        icon={Swords}
        label="Contests analyzed"
        tone="accent"
        value={patterns.contestsAnalyzed}
      />
      <KpiTile
        detail="Problems per contest"
        icon={CheckCheck}
        label="Average solved"
        tone="green"
        value={patterns.averageSolved ?? '-'}
      />
      <KpiTile
        detail="Minutes to the first accept"
        icon={Zap}
        label="First accept"
        tone="sky"
        value={
          patterns.averageFirstAcceptedMinute === null
            ? '-'
            : `${Math.round(patterns.averageFirstAcceptedMinute)}m`
        }
      />
      <KpiTile
        detail="Rejected before acceptance"
        icon={XCircle}
        label="Wrong per contest"
        tone="sand"
        value={patterns.averageWrongPerContest ?? '-'}
      />
      <KpiTile
        detail={`${patterns.ratingDrops} contests lost rating`}
        icon={patterns.ratingDeltaTotal >= 0 ? TrendingUp : TrendingDown}
        label="Net rating"
        tone="sky"
        value={`${patterns.ratingDeltaTotal > 0 ? '+' : ''}${Math.round(patterns.ratingDeltaTotal)}`}
      />
      <KpiTile
        detail="Two or more quick wrong resubmits"
        icon={Activity}
        label="Rushed contests"
        tone="sand"
        value={patterns.rapidResubmitContests}
      />
    </dl>
  )
}

type ChartContest = ContestSummary & { label: string }

function chartContests(contests: readonly ContestSummary[]): ChartContest[] {
  return contests
    .filter((item) => item.analyzable)
    .slice(0, 12)
    .reverse()
    .map((item) => ({
      ...item,
      label: `${providerShort[item.provider]}|${shortDay(item.startsAt)}`,
    }))
}

// Solved against the problems in each contest, oldest to newest.
function SolvedChart({ data }: { data: readonly ChartContest[] }) {
  return (
    <ChartCard
      className="lg:col-span-7"
      description="Problems solved in each contest against its full problem set."
      title="Solved per contest"
    >
      {data.length === 0 ? (
        <ChartEmpty>Analyzed contests appear here.</ChartEmpty>
      ) : (
        <ProblemScoreboard contests={data} />
      )}
    </ChartCard>
  )
}

// Rating change per rated contest, green up and red down.
function RatingChart({ data }: { data: readonly ChartContest[] }) {
  const rows = data.filter((item) => item.ratingChange !== undefined)
  return (
    <ChartCard
      className="lg:col-span-5"
      description="How each rated contest moved your rating."
      title="Rating change"
    >
      {rows.length === 0 ? (
        <ChartEmpty>No rated contests in this window.</ChartEmpty>
      ) : (
        <RatingJourney contests={data} />
      )}
    </ChartCard>
  )
}

// Minutes to the first accepted submission, a proxy for how fast you start.
function StartSpeedChart({ data }: { data: readonly ChartContest[] }) {
  const rows = data.filter((item) => item.firstAcceptedMinute !== undefined)
  return (
    <ChartCard
      className="lg:col-span-7"
      description="Minutes to your first accepted submission, and wrong submissions, per contest."
      title="Start speed"
    >
      {rows.length === 0 ? (
        <ChartEmpty>No accepted submissions yet.</ChartEmpty>
      ) : (
        <StartLanes contests={data} />
      )}
    </ChartCard>
  )
}

// Pressure habits counted across analyzed contests.
function PressureCard({ patterns }: { patterns: ContestPatternMetrics }) {
  const signals: [string, number, string][] = [
    [
      'Slow starts',
      patterns.slowStarts,
      'First accept after a quarter of the time',
    ],
    ['Early stops', patterns.earlyStops, 'A long idle stretch at the end'],
    [
      'Rushed resubmits',
      patterns.rapidResubmitContests,
      'Wrong resubmits within 3 minutes',
    ],
    ['Rating drops', patterns.ratingDrops, 'Contests that lost rating'],
  ]
  return (
    <ChartCard
      className="lg:col-span-5"
      description={`Out of ${patterns.contestsAnalyzed} analyzed contests.`}
      title="Pressure signals"
    >
      <PressureMeters
        signals={signals.map(([label, count, hint]) => ({
          label,
          count,
          hint,
        }))}
        total={patterns.contestsAnalyzed}
      />
      {patterns.recurringUnsolvedTopics.length > 0 ||
      patterns.stuckPositions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {patterns.recurringUnsolvedTopics.map((item) => (
            <span
              className="rounded-full bg-[#f59e0b]/12 px-2.5 py-0.5 text-xs text-[#b45309] dark:text-[#fcd34d]"
              key={item.topic}
            >
              {humanTopic(item.topic)} unsolved {item.count}x
            </span>
          ))}
          {patterns.stuckPositions.map((item) => (
            <span
              className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
              key={item.label}
            >
              Stuck at {item.label} {item.count}x
            </span>
          ))}
        </div>
      ) : null}
    </ChartCard>
  )
}

function PatternReport({
  patterns,
  report,
}: {
  patterns: ContestPatternMetrics
  report: ContestPatternsReport | undefined
}) {
  const { notify } = useNotification()
  const generate = useContestPatterns()
  const run = () =>
    generate.mutate(report !== undefined, {
      onError: (error) =>
        notify({
          title: 'Pattern report could not be written',
          description: mentorErrorMessage(error, 'Try again shortly.'),
          tone: 'error',
        }),
    })
  const column = (
    icon: ReactNode,
    title: string,
    items: readonly string[],
    empty: string,
  ) => (
    <div className="min-w-0 rounded-lg bg-secondary/40 p-4">
      <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-1.5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-foreground/90">
          {items.map((item) => (
            <li className="flex gap-2" key={item}>
              <Check
                aria-hidden="true"
                className="mt-1 size-3.5 shrink-0 text-primary"
              />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return (
    <ChartCard
      action={
        patterns.contestsAnalyzed > 0 ? (
          <Button
            disabled={generate.isPending}
            onClick={run}
            size="sm"
            type="button"
            variant={report === undefined ? 'default' : 'outline'}
          >
            <Sparkles aria-hidden="true" />
            {report === undefined ? 'Write pattern report' : 'Rewrite'}
          </Button>
        ) : null
      }
      description="What you consistently do under contest pressure, in the mentor's words."
      title="Pattern report"
    >
      {generate.isPending ? (
        <div role="status">
          <AiLoader
            steps={narrativeSteps}
            title="Reading your contest history"
          />
        </div>
      ) : report !== undefined ? (
        <div className="grid gap-4">
          <p className="rounded-lg border border-[color-mix(in_oklab,var(--primary)_30%,var(--border))] bg-primary/5 px-4 py-3 text-base font-medium text-foreground">
            {report.headline}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {column(
              <TrendingDown
                aria-hidden="true"
                className="size-4 text-sun-foreground"
              />,
              'Tendencies',
              report.tendencies,
              'Nothing recurring yet.',
            )}
            {column(
              <TrendingUp
                aria-hidden="true"
                className="size-4 text-go-foreground"
              />,
              'Strengths',
              report.strengths,
              'Keep building evidence.',
            )}
            {column(
              <Target aria-hidden="true" className="size-4 text-primary" />,
              'Contest strategy',
              report.recommendations,
              'No changes suggested.',
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Written {formatDateTime(report.generatedAt)}.
          </p>
        </div>
      ) : (
        <ChartEmpty>
          Write a report to turn these numbers into tendencies, strengths and a
          contest strategy.
        </ChartEmpty>
      )}
    </ChartCard>
  )
}

function ContestList({
  contests,
  selected,
  onSelect,
}: {
  contests: readonly ContestSummary[]
  selected: { provider: ProviderKey; contestId: string } | null
  onSelect: (key: string) => void
}) {
  return (
    <nav aria-label="Your contests" className="min-w-0">
      <ul className="flex flex-col gap-2 xl:max-h-[calc(100dvh-var(--app-header)-6rem)] xl:overflow-y-auto xl:pr-1">
        {contests.map((contest) => {
          const key = contestKey(contest.provider, contest.contestId)
          const active =
            selected !== null &&
            key === contestKey(selected.provider, selected.contestId)
          const share =
            contest.problemCount === undefined || contest.problemCount === 0
              ? 0
              : contest.solvedCount / contest.problemCount
          return (
            <li key={key}>
              <button
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-[border-color,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-55',
                  active
                    ? 'border-primary bg-primary/5 shadow-soft'
                    : 'border-border bg-card hover:shadow-soft',
                )}
                disabled={!contest.analyzable}
                onClick={() => onSelect(key)}
                type="button"
              >
                <RadialProgress
                  className="size-11 shrink-0"
                  thickness={12}
                  value={share}
                >
                  <ProviderLogo
                    className="size-4"
                    provider={contest.provider}
                  />
                </RadialProgress>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {contest.name}
                    </span>
                    <SignedDelta value={contest.ratingChange} />
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {contest.startsAt
                      ? formatDateTime(contest.startsAt, false)
                      : null}
                    {contest.analyzable ? (
                      <span>
                        {contest.solvedCount}
                        {contest.problemCount === undefined
                          ? ''
                          : `/${contest.problemCount}`}{' '}
                        solved
                      </span>
                    ) : (
                      <span>no synced submissions</span>
                    )}
                    {contest.participation !== undefined &&
                    contest.participation !== 'rated' ? (
                      <ParticipationBadge mode={contest.participation} />
                    ) : null}
                    {contest.narrativeAvailable ? (
                      <Sparkles
                        aria-label="Analyzed"
                        className="size-3.5 text-primary"
                      />
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function ContestAnalysisPage() {
  const { notify } = useNotification()
  const overviewQuery = useContestOverview()
  const refresh = useRefreshContestOverview()
  const [searchParams, setSearchParams] = useSearchParams()

  const header = (
    <PageHeader
      action={
        <Button
          disabled={refresh.isPending || overviewQuery.isFetching}
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
      description="How you spend contest time, where pressure shows, which topics cost you, and why your rating moves."
      title="Contest analysis"
    />
  )

  if (overviewQuery.isPending) {
    return (
      <PageContainer>
        {header}
        <PageSkeleton label="Loading your contests" rows={5} />
      </PageContainer>
    )
  }
  if (overviewQuery.isError) {
    return (
      <PageContainer>
        {header}
        <ErrorState
          message={mentorErrorMessage(
            overviewQuery.error,
            'Your contests could not be loaded.',
          )}
          onRetry={() => void overviewQuery.refetch()}
          title="Contest analysis unavailable"
        />
      </PageContainer>
    )
  }

  const { contests, patterns, patternsReport, platforms } =
    overviewQuery.data.data
  if (contests.length === 0) {
    return (
      <PageContainer>
        {header}
        <EmptyState
          action={
            <Link className={buttonVariants()} to="/settings#platforms">
              Link a platform
            </Link>
          }
          description="Link your Codeforces, CodeChef or LeetCode account and take part in a contest. Each one you enter can be analyzed here."
          title="No contests yet"
        />
      </PageContainer>
    )
  }

  const selected =
    parseContestKey(searchParams.get('contest')) ??
    (() => {
      const first = contests.find((item) => item.analyzable) ?? contests[0]
      return first === undefined
        ? null
        : { provider: first.provider, contestId: first.contestId }
    })()
  const chartData = chartContests(contests)

  return (
    <PageContainer>
      {header}
      <PatternKpis patterns={patterns} />
      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <SolvedChart data={chartData} />
        <RatingChart data={chartData} />
        <StartSpeedChart data={chartData} />
        <PressureCard patterns={patterns} />
      </div>
      <PlatformContestCards platforms={platforms} />
      <PatternReport patterns={patterns} report={patternsReport} />

      <section
        aria-labelledby="contests-heading"
        className="flex min-w-0 flex-col gap-3"
      >
        <h2
          className="text-xl font-semibold text-foreground"
          id="contests-heading"
        >
          Your contests
        </h2>
        <div className="grid min-w-0 gap-6 xl:grid-cols-[21rem_minmax(0,1fr)]">
          <ContestList
            contests={contests}
            onSelect={(key) =>
              setSearchParams({ contest: key }, { state: keepScrollState })
            }
            selected={selected}
          />
          <div className="min-w-0">
            {selected === null ? null : (
              <ContestDetail
                contest={selected}
                key={contestKey(selected.provider, selected.contestId)}
              />
            )}
          </div>
        </div>
      </section>
    </PageContainer>
  )
}

function ContestAnalysisPageWithPanels() {
  return (
    <PanelStyle variant="classic">
      <ContestAnalysisPage />
    </PanelStyle>
  )
}

export default ContestAnalysisPageWithPanels
