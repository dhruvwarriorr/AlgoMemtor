import { useSearchParams } from 'react-router-dom'
import type {
  ContestMetrics,
  ContestNarrative,
  ContestPatternMetrics,
  ContestPatternsReport,
  ContestSummary,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import { Link } from 'react-router-dom'

import {
  Activity,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from '@/components/icons/algo-icons'
import { AiLoader, type AiLoaderStep } from '@/components/motion/AiLoader'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { useNotification } from '@/app/useNotification'
import {
  ProviderBadge,
  ProviderProblemLink,
  SectionCard,
  StatTile,
} from '@/features/mentor/components/shared'
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
} from '@/features/mentor/hooks'
import { cn } from '@/lib/utils'

const narrativeSteps: readonly AiLoaderStep[] = [
  { label: 'Replaying your submission timeline', indicator: 'bar' },
  { label: 'Looking for time and pressure patterns', indicator: 'grid' },
  { label: 'Writing strategy for next time', indicator: 'dots' },
]

const minutes = (value: number | undefined) =>
  value === undefined ? '—' : `${Math.round(value)} min`

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
  const rows = metrics.problems.filter((problem) => problem.attempts > 0)
  if (rows.length === 0) return null
  const duration = metrics.durationMinutes
  return (
    <figure className="min-w-0">
      <figcaption className="sr-only">
        Submissions over the contest, one row per problem.
      </figcaption>
      <div className="grid gap-2">
        {rows.map((problem) => {
          const events = metrics.timeline.filter(
            (event) => event.label === problem.label,
          )
          return (
            <div
              className="flex min-w-0 items-center gap-3"
              key={problem.label}
            >
              <span className="w-10 shrink-0 font-mono text-xs font-semibold text-foreground">
                {problem.label}
              </span>
              <div className="relative h-6 min-w-0 flex-1 rounded-md bg-secondary/70">
                {problem.firstSubmitMinute !== undefined ? (
                  <span
                    className="absolute inset-y-2 rounded-full bg-border"
                    style={{
                      left: `${(problem.firstSubmitMinute / duration) * 100}%`,
                      width: `${(((problem.solvedMinute ?? events.at(-1)?.minute ?? problem.firstSubmitMinute) - problem.firstSubmitMinute) / duration) * 100}%`,
                    }}
                  />
                ) : null}
                {events.map((event, index) => (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card',
                      event.accepted ? 'bg-go' : 'bg-destructive',
                    )}
                    key={`${event.minute}-${index}`}
                    style={{
                      left: `${Math.min(100, (event.minute / duration) * 100)}%`,
                    }}
                    title={`${event.verdict} at ${Math.round(event.minute)} min`}
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
      <div className="rounded-lg border-l-2 border-primary bg-primary/5 px-4 py-3">
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
          <ProviderBadge provider={metrics.provider} />
          <span className="text-xs text-muted-foreground">
            {formatDateTime(metrics.startsAt)} · {metrics.durationMinutes} min
          </span>
        </div>
        <h2 className="mt-2 text-xl text-foreground sm:text-2xl">
          <ProviderProblemLink
            href={metrics.canonicalUrl}
            provider={metrics.provider}
            title={metrics.name}
          />
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Rank" value={metrics.rank ?? '—'} />
          <StatTile
            label="Rating change"
            tone={
              delta === undefined
                ? 'neutral'
                : delta >= 0
                  ? 'positive'
                  : 'warning'
            }
            value={
              delta === undefined
                ? '—'
                : `${delta > 0 ? '+' : ''}${Math.round(delta)}`
            }
          />
          <StatTile
            hint={`${metrics.attemptedCount} attempted`}
            label="Solved"
            value={metrics.solvedCount}
          />
          <StatTile
            label="First accepted"
            value={minutes(metrics.firstAcceptedMinute)}
          />
          <StatTile
            hint="Rejected before acceptance"
            label="Wrong submissions"
            value={metrics.wrongSubmissions}
          />
          <StatTile
            hint="Wrong resubmits within 3 minutes"
            label="Rapid resubmits"
            tone={metrics.rapidWrongResubmits >= 2 ? 'warning' : 'neutral'}
            value={metrics.rapidWrongResubmits}
          />
          <StatTile
            hint="Leaving an unsolved problem"
            label="Problem switches"
            value={metrics.problemSwitches}
          />
          <StatTile
            hint={
              metrics.idleTailMinutes === undefined
                ? 'Longest gap between submissions'
                : `${Math.round(metrics.idleTailMinutes)} min after your last submission`
            }
            label="Longest gap"
            value={minutes(metrics.longestGapMinutes)}
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
                <tr className="border-t border-border" key={problem.label}>
                  <td className="px-2 py-2">
                    <span className="font-mono font-semibold">
                      {problem.label}
                    </span>{' '}
                    <span className="text-foreground/85">
                      {problem.title ?? ''}
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
                    {minutes(problem.minutesSpent)}
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

function PatternsSection({
  patterns,
  report,
}: {
  patterns: ContestPatternMetrics
  report: ContestPatternsReport | undefined
}) {
  const { notify } = useNotification()
  const generate = useContestPatterns()
  const tiles: [string, string | number, string?][] = [
    ['Contests analyzed', patterns.contestsAnalyzed],
    ['Average solved', patterns.averageSolved ?? '—'],
    [
      'Average first accept',
      patterns.averageFirstAcceptedMinute === null
        ? '—'
        : `${Math.round(patterns.averageFirstAcceptedMinute)} min`,
    ],
    ['Wrong per contest', patterns.averageWrongPerContest ?? '—'],
    ['Slow starts', patterns.slowStarts, 'First accept after 25% of the time'],
    ['Early stops', patterns.earlyStops, 'Long idle stretch at the end'],
    [
      'Rapid-resubmit contests',
      patterns.rapidResubmitContests,
      'Two or more wrong resubmits within 3 min',
    ],
    [
      'Rating drops',
      patterns.ratingDrops,
      `Net ${patterns.ratingDeltaTotal > 0 ? '+' : ''}${patterns.ratingDeltaTotal}`,
    ],
  ]
  return (
    <SectionCard
      action={
        patterns.contestsAnalyzed > 0 ? (
          <Button
            disabled={generate.isPending}
            onClick={() =>
              generate.mutate(report !== undefined, {
                onError: (error) =>
                  notify({
                    title: 'Pattern report could not be written',
                    description: mentorErrorMessage(
                      error,
                      'Try again shortly.',
                    ),
                    tone: 'error',
                  }),
              })
            }
            size="sm"
            type="button"
            variant={report === undefined ? 'default' : 'outline'}
          >
            <Sparkles aria-hidden="true" />
            {report === undefined ? 'Write pattern report' : 'Rewrite report'}
          </Button>
        ) : null
      }
      description="What you consistently do under contest pressure, across your recent contests."
      id="patterns-heading"
      title="Behavior across contests"
    >
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, hint]) => (
          <StatTile
            key={label}
            label={label}
            value={value}
            {...(hint === undefined ? {} : { hint })}
          />
        ))}
      </dl>
      {patterns.recurringUnsolvedTopics.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">
            Topics that keep going unsolved
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {patterns.recurringUnsolvedTopics.map((item) => (
              <li
                className="rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-xs text-foreground"
                key={item.topic}
              >
                {humanTopic(item.topic)} · {item.count}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {patterns.stuckPositions.length > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Where you usually get stuck:{' '}
          {patterns.stuckPositions
            .map((item) => `problem ${item.label} (${item.count}×)`)
            .join(', ')}
          .
        </p>
      ) : null}
      {generate.isPending ? (
        <div className="mt-5" role="status">
          <AiLoader
            steps={narrativeSteps}
            title="Reading your contest history"
          />
        </div>
      ) : report !== undefined ? (
        <div className="mt-5 grid gap-4 rounded-lg border border-border bg-background/50 p-4">
          <p className="font-medium text-foreground">{report.headline}</p>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <TrendingDown
                  aria-hidden="true"
                  className="size-4 text-sun-foreground"
                />{' '}
                Tendencies
              </h4>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6">
                {report.tendencies.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <TrendingUp
                  aria-hidden="true"
                  className="size-4 text-go-foreground"
                />{' '}
                Strengths
              </h4>
              {report.strengths.length === 0 ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Keep building evidence.
                </p>
              ) : (
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6">
                  {report.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Activity aria-hidden="true" className="size-4 text-primary" />{' '}
                Contest strategy
              </h4>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6">
                {report.recommendations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Written {formatDateTime(report.generatedAt)}.
          </p>
        </div>
      ) : null}
    </SectionCard>
  )
}

function ContestAnalysisPage() {
  const overviewQuery = useContestOverview()
  const [searchParams, setSearchParams] = useSearchParams()

  const header = (
    <PageHeader
      description="Post-contest analysis beyond the scoreboard: how you spent your time, where pressure showed, which topics cost you, why your rating moved, and what to change next time."
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

  const { contests, patterns, patternsReport } = overviewQuery.data.data
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

  return (
    <PageContainer>
      {header}
      <PatternsSection patterns={patterns} report={patternsReport} />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <nav aria-label="Your contests" className="min-w-0">
          <ul className="flex flex-col gap-1.5 xl:max-h-[calc(100dvh-var(--app-header)-6rem)] xl:overflow-y-auto">
            {contests.map((contest: ContestSummary) => {
              const key = contestKey(contest.provider, contest.contestId)
              const active =
                selected !== null &&
                key === contestKey(selected.provider, selected.contestId)
              return (
                <li key={key}>
                  <button
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'w-full rounded-lg border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:bg-secondary/60',
                    )}
                    disabled={!contest.analyzable}
                    onClick={() => setSearchParams({ contest: key })}
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {contest.name}
                      </span>
                      {contest.ratingChange !== undefined ? (
                        <span
                          className={cn(
                            'shrink-0 text-xs font-semibold tabular-nums',
                            contest.ratingChange >= 0
                              ? 'text-go-foreground'
                              : 'text-destructive',
                          )}
                        >
                          {contest.ratingChange > 0 ? '+' : ''}
                          {Math.round(contest.ratingChange)}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <ProviderBadge provider={contest.provider} />
                      {contest.startsAt
                        ? formatDateTime(contest.startsAt, false)
                        : null}
                      {contest.analyzable
                        ? ` · ${contest.solvedCount} solved`
                        : ' · no synced submissions'}
                      {contest.narrativeAvailable ? ' · analyzed' : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="min-w-0">
          {selected === null ? null : (
            <ContestDetail
              contest={selected}
              key={contestKey(selected.provider, selected.contestId)}
            />
          )}
        </div>
      </div>
    </PageContainer>
  )
}

export default ContestAnalysisPage
