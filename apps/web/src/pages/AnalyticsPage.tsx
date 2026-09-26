import { useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  LinkableProviderSchema,
  programmingLanguageFamily,
} from '@algomemtor/shared-contracts'
import {
  Sparkles,
  Swords,
  type IconComponent,
} from '@/components/icons/algo-icons'
import {
  GradientCard,
  type GradientTone,
} from '@/components/motion/GradientCard'
import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { Sparkline } from '@/components/kit/charts'
import { SegmentedControl } from '@/components/kit/SegmentedControl'
import {
  ActiveDaysIcon,
  BestDayIcon,
  DifficultyIcon,
  PeakIcon,
  StreakIcon,
  TopicIcon,
} from '@/components/icons/app-icons'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { AccountCards, YearCalendar } from '@/features/insights/InsightsCharts'
import {
  ContestPulse,
  DifficultyRings,
  LanguageCapsules,
  MonthlySkyline,
  RatingStaircase,
  SummitPodium,
  TopicBubbles,
  TopicTugOfWar,
  VerdictOrbit,
  WeeklyRhythm,
} from '@/features/insights/insights-visuals'
import {
  mergeContestHistory,
  type ContestHistoryEntry,
} from '@/features/platform/contest-history'
import {
  providerLabels,
  providerOptions,
} from '@/features/platform/components/provider-labels'
import { useActivity, useAnalytics } from '@/features/platform/hooks'
import {
  dashboardActivity,
  isAcceptedSubmission,
} from '@/pages/dashboard-activity'
import { cn } from '@/lib/utils'

const title = 'Insights'
const description =
  'Your complete competitive-programming history across every linked platform.'

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
      new Date(value),
    )
  } catch {
    return value
  }
}

// All-time streaks and active days from the per-day solve counts.
function dayStats(solvedOverTime: Record<string, number>) {
  const days = Object.entries(solvedOverTime)
    .filter(([, count]) => count > 0)
    .map(([day]) => day)
    .sort()
  let longest = 0
  let run = 0
  let previous: number | undefined
  for (const day of days) {
    const value = Date.parse(`${day}T00:00:00Z`) / 86_400_000
    run = previous !== undefined && value - previous === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = value
  }
  const busiest = Object.entries(solvedOverTime).sort((a, b) => b[1] - a[1])[0]
  return { activeDays: days.length, longest, busiest }
}

function Headline({
  icon,
  label,
  value,
  detail,
  className,
  gradient,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  className?: string
  gradient?: { tone: GradientTone; decoration: IconComponent }
}) {
  if (gradient !== undefined) {
    return (
      <GradientCard
        className={cn('animate-rise min-w-0 p-4', className)}
        icon={gradient.decoration}
        tone={gradient.tone}
      >
        <p className="flex items-center gap-2 text-sm font-medium opacity-75">
          {label}
        </p>
        <p className="mt-3 truncate font-heading text-[1.75rem] leading-none font-bold tracking-[-0.01em] tabular-nums">
          {value}
        </p>
        <p className="mt-1.5 truncate text-xs opacity-70">{detail}</p>
      </GradientCard>
    )
  }
  return (
    <div
      className={cn(
        'card-lift animate-rise min-w-0 rounded-xl border border-border bg-card p-4',
        className,
      )}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
          {icon}
        </span>
        {label}
      </p>
      <p className="mt-3 truncate font-heading text-[1.75rem] leading-none font-bold tracking-[-0.01em] tabular-nums">
        {value}
      </p>
      <p className="mt-1.5 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function ContestLog({ entries }: { entries: ContestHistoryEntry[] }) {
  if (entries.length === 0) return null
  return (
    <section className="animate-rise min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="text-lg font-semibold">Contest log</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Every synchronized contest with rank and rating change.
      </p>
      <div className="mt-4 max-h-96 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Contest</th>
              <th className="py-2 font-medium">Date</th>
              <th className="py-2 text-right font-medium">Rank</th>
              <th className="py-2 text-right font-medium">Rating</th>
              <th className="py-2 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const participation = entry.participation
              const change = entry.ratingChange
              const provider = participation?.provider ?? change?.provider
              const name =
                participation?.contestName ??
                change?.contestName ??
                participation?.contestId ??
                change?.contestId ??
                'Contest'
              const date = participation?.attendedAt ?? change?.occurredAt
              const delta = change?.delta ?? participation?.ratingChange
              const rating = change?.newRating ?? participation?.newRating
              return (
                <tr className="border-t border-border/70" key={entry.key}>
                  <td className="max-w-80 py-2 pr-3">
                    <p className="truncate font-medium" title={name}>
                      {name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {provider === undefined ? '' : providerLabels[provider]}
                    </p>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                    {date ? formatDate(date) : '—'}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {participation?.rank?.toLocaleString() ?? '—'}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {rating === undefined ? '—' : Math.round(rating)}
                  </td>
                  <td
                    className={cn(
                      'py-2 text-right font-semibold tabular-nums',
                      delta === undefined
                        ? 'text-muted-foreground'
                        : delta >= 0
                          ? 'text-go'
                          : 'text-destructive',
                    )}
                  >
                    {delta === undefined
                      ? '—'
                      : `${delta >= 0 ? '+' : ''}${Math.round(delta)}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

type ActivityEvent = NonNullable<
  ReturnType<typeof useActivity>['data']
>['data'][number]

// A provider-reported solve is an accepted solution, so it reads the same as
// an accepted submission. Only a learner's own mark stays distinguishable.
function verdictLabel(event: ActivityEvent) {
  if (event.eventType === 'solved') {
    return event.source === 'manual' ? 'Marked solved' : 'Accepted'
  }
  if (isAcceptedSubmission(event)) return 'Accepted'
  if (event.verdict === undefined) return 'Submitted'
  const text = event.verdict.replaceAll('_', ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Submitted solutions only, in the same table style as the contest log.
function ActivityLog({ events }: { events: readonly ActivityEvent[] }) {
  return (
    <section className="animate-rise min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="text-lg font-semibold">Recent activity</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Your latest submissions and solves with verdict and language.
      </p>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No dated submissions yet. Sync a platform to fill this log.
        </p>
      ) : (
        <div className="mt-4 max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Problem</th>
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Language</th>
                <th className="py-2 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const solved =
                  event.eventType === 'solved' || isAcceptedSubmission(event)
                const name = event.title ?? event.externalId ?? 'Problem'
                return (
                  <tr className="border-t border-border/70" key={event.id}>
                    <td className="max-w-72 py-2 pr-3">
                      <p className="flex min-w-0 items-center gap-2">
                        <ProviderLogo
                          className="size-4 shrink-0"
                          provider={event.provider}
                        />
                        <span className="truncate font-medium" title={name}>
                          {name}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {providerLabels[event.provider]}
                        {event.externalId ? ` · ${event.externalId}` : ''}
                      </p>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {event.occurredAt ? formatDate(event.occurredAt) : '—'}
                    </td>
                    <td className="max-w-28 truncate py-2 pr-3 text-muted-foreground">
                      {event.language === undefined
                        ? '—'
                        : programmingLanguageFamily(event.language)}
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={cn(
                          'inline-flex rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
                          solved
                            ? 'bg-go-soft text-go-foreground'
                            : 'bg-danger-soft text-danger-foreground',
                        )}
                      >
                        {verdictLabel(event)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const providerResult = LinkableProviderSchema.safeParse(
    searchParams.get('provider'),
  )
  const provider = providerResult.success ? providerResult.data : undefined
  const analyticsQuery = useAnalytics(provider)
  const activityQuery = useActivity(provider)
  const recentSolutions = useMemo(
    () => dashboardActivity(activityQuery.data?.data ?? [], 60),
    [activityQuery.data?.data],
  )
  const analytics = analyticsQuery.data
  const stats = useMemo(
    () => dayStats(analytics?.solvedOverTime ?? {}),
    [analytics?.solvedOverTime],
  )

  function updateProvider(next: typeof provider) {
    const nextParams = new URLSearchParams(searchParams)
    if (next === undefined) nextParams.delete('provider')
    else nextParams.set('provider', next)
    setSearchParams(nextParams)
  }

  if (analyticsQuery.isPending) {
    return (
      <PageContainer>
        <PageHeader description={description} title={title} />
        <PageSkeleton label="Loading your insights" rows={5} />
      </PageContainer>
    )
  }

  if (analyticsQuery.isError || analytics === undefined) {
    return (
      <PageContainer>
        <PageHeader description={description} title={title} />
        <ErrorState
          message={
            analyticsQuery.error instanceof Error
              ? analyticsQuery.error.message
              : 'Insights could not be loaded.'
          }
          onRetry={() => void analyticsQuery.refetch()}
          title="Unable to load insights"
        />
      </PageContainer>
    )
  }

  const insights = analytics.insights
  const contestHistory = mergeContestHistory(
    analytics.contestParticipation,
    analytics.ratingHistory,
  )
  const peak = Math.max(
    0,
    ...(insights?.accounts ?? []).map((account) => account.maxRating ?? 0),
  )
  const peakAccount = insights?.accounts.find(
    (account) => account.maxRating === peak,
  )
  const firstActivity = insights?.firstActivityAt

  return (
    <PageContainer>
      <PageHeader
        action={
          <SegmentedControl
            label="Provider"
            onChange={(next) =>
              updateProvider(next === 'all' ? undefined : next)
            }
            options={[
              { value: 'all', label: 'All' },
              ...providerOptions.map((option) => ({
                value: option,
                label: providerLabels[option],
                icon: <ProviderLogo className="size-3.5" provider={option} />,
              })),
            ]}
            size="sm"
            value={provider ?? 'all'}
          />
        }
        description={description}
        title={title}
      />

      {/* All-time headline */}
      <section className="animate-rise relative overflow-hidden rounded-xl p-5 text-white mesh-card sm:p-7">
        <span
          aria-hidden="true"
          className="absolute -top-24 -right-16 size-72 rounded-full bg-primary/40 blur-3xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-sm text-white/70">
              <Sparkles aria-hidden="true" className="size-4 text-primary" />
              {provider === undefined
                ? 'All platforms, all time'
                : `${providerLabels[provider]}, all time`}
            </p>
            <p className="mt-2 font-heading text-6xl leading-none font-bold tracking-[-0.01em] tabular-nums sm:text-7xl">
              {analytics.solvedTotal.toLocaleString()}
            </p>
            <p className="mt-2 text-white/70">
              problems solved
              {firstActivity
                ? ` · coding since ${new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(firstActivity))}`
                : ''}
            </p>
          </div>
          {(insights?.monthly.length ?? 0) > 1 ? (
            <Sparkline
              className="h-16 w-full max-w-72 self-center"
              color="#7dd3fc"
              values={(insights?.monthly ?? []).map((month) => month.solved)}
            />
          ) : null}
          <dl className="grid grid-cols-3 gap-x-8 gap-y-3">
            {[
              ['Contests', contestHistory.length.toLocaleString()],
              [
                'Acceptance',
                analytics.acceptanceRate === undefined
                  ? '—'
                  : `${analytics.acceptanceRate.toFixed(1)}%`,
              ],
              [
                'Submissions',
                (insights?.totalSubmissions ?? 0).toLocaleString(),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-white/60">{label}</dt>
                <dd className="font-heading text-2xl font-bold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Headline
          detail="Days with at least one solve"
          icon={<ActiveDaysIcon aria-hidden="true" className="size-4" />}
          gradient={{ tone: 'green', decoration: ActiveDaysIcon }}
          label="Active days"
          value={stats.activeDays.toLocaleString()}
        />
        <Headline
          detail="Consecutive solve days, all time"
          icon={<StreakIcon aria-hidden="true" className="size-4" />}
          gradient={{ tone: 'sand', decoration: StreakIcon }}
          label="Longest streak"
          value={`${stats.longest}d`}
        />
        <Headline
          detail={
            stats.busiest ? formatDate(`${stats.busiest[0]}T12:00:00Z`) : '—'
          }
          icon={<BestDayIcon aria-hidden="true" className="size-4" />}
          gradient={{ tone: 'sky', decoration: BestDayIcon }}
          label="Best day"
          value={stats.busiest ? `${stats.busiest[1]} solves` : '—'}
        />
        <Headline
          detail={
            peakAccount ? providerLabels[peakAccount.provider] : 'No ratings'
          }
          icon={<PeakIcon aria-hidden="true" className="size-4" />}
          gradient={{ tone: 'green', decoration: PeakIcon }}
          label="Peak rating"
          value={peak > 0 ? String(Math.round(peak)) : '—'}
        />
        <Headline
          detail={`${analytics.solvedByDifficulty.hard.toLocaleString()} hard problems`}
          icon={<DifficultyIcon aria-hidden="true" className="size-4" />}
          gradient={{ tone: 'sand', decoration: DifficultyIcon }}
          label="Hardest solve"
          value={
            insights?.hardestSolved[0]
              ? String(Math.round(insights.hardestSolved[0].rating))
              : '—'
          }
        />
        <Headline
          detail={`${Object.keys(analytics.topicCounts).length} topics touched`}
          icon={<TopicIcon aria-hidden="true" className="size-4" />}
          gradient={{ tone: 'sky', decoration: TopicIcon }}
          label="Top topic"
          value={(
            Object.entries(analytics.topicCounts).sort(
              (a, b) => b[1] - a[1],
            )[0]?.[0] ?? '—'
          ).replace(/\b\w/g, (letter) => letter.toUpperCase())}
        />
      </dl>

      {/* A single-platform view already shows that account's rating, peak and
          totals in the headline, so its account card would only repeat them. */}
      {provider === undefined ? (
        <AccountCards accounts={insights?.accounts ?? []} />
      ) : null}

      <YearCalendar
        firstActivityAt={firstActivity}
        key={provider ?? 'all'}
        solvedOverTime={analytics.solvedOverTime}
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <MonthlySkyline monthly={insights?.monthly ?? []} />
        <DifficultyRings
          allTimeTotal={analytics.solvedTotal}
          difficulty={analytics.solvedByDifficulty}
        />
        <RatingStaircase bands={insights?.ratingBands ?? []} />
        <VerdictOrbit
          total={insights?.totalSubmissions ?? 0}
          verdicts={
            insights?.verdicts ?? {
              accepted: 0,
              wrongAnswer: 0,
              timeLimit: 0,
              memoryLimit: 0,
              runtimeError: 0,
              compileError: 0,
              other: 0,
            }
          }
        />
        <TopicBubbles topicCounts={analytics.topicCounts} />
        <TopicTugOfWar topics={insights?.topicStrength ?? []} />
        {insights === undefined ? null : (
          <WeeklyRhythm
            punchCard={insights.punchCard}
            timezone={insights.timezone}
          />
        )}
        <LanguageCapsules languages={analytics.languageCounts} />
        <SummitPodium problems={insights?.hardestSolved ?? []} />
        <section className="animate-rise flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5 lg:col-span-6">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Swords aria-hidden="true" className="size-4 text-primary" />
              Contest record
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Rated contest outcomes, oldest to newest.
            </p>
          </div>
          <ContestRecord entries={contestHistory} />
        </section>
      </div>

      <div
        className={cn(
          'grid min-w-0 grid-cols-1 gap-4',
          contestHistory.length > 0 && 'xl:grid-cols-2',
        )}
      >
        <ContestLog entries={contestHistory} />
        <ActivityLog events={recentSolutions} />
      </div>

      <p className="text-xs text-muted-foreground">
        Totals are provider-reported and are not deduplicated across platforms.
        Public recent-activity windows mean some breakdowns are lower bounds.
      </p>
    </PageContainer>
  )
}

function ContestRecord({ entries }: { entries: ContestHistoryEntry[] }) {
  const rated = entries
    .map((entry) => ({
      key: entry.key,
      delta: entry.ratingChange?.delta ?? entry.participation?.ratingChange,
      label:
        entry.participation?.contestName ??
        entry.ratingChange?.contestName ??
        'Contest',
      date:
        entry.participation?.attendedAt ?? entry.ratingChange?.occurredAt ?? '',
    }))
    .filter(
      (item): item is typeof item & { delta: number } =>
        item.delta !== undefined,
    )
    .sort((left, right) => left.date.localeCompare(right.date))
  const deltas = rated.map((item) => item.delta)
  const gains = deltas.filter((value) => value > 0)
  const losses = deltas.filter((value) => value < 0)
  const best = deltas.length ? Math.max(...deltas) : undefined
  const worst = deltas.length ? Math.min(...deltas) : undefined
  const winRate = deltas.length
    ? Math.round((gains.length / deltas.length) * 100)
    : 0
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        {rated.length > 0 ? (
          <ContestPulse deltas={rated} />
        ) : (
          <div className="flex h-3 overflow-hidden rounded-md bg-muted" />
        )}
        <p className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{gains.length} rating gains</span>
          <span>{losses.length} drops</span>
        </p>
      </div>
      <dl className="mt-auto grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Win rate', deltas.length ? `${winRate}%` : '—'],
          ['Best gain', best === undefined ? '—' : `+${Math.round(best)}`],
          ['Worst drop', worst === undefined ? '—' : String(Math.round(worst))],
          [
            'Net change',
            deltas.length
              ? `${deltas.reduce((sum, value) => sum + value, 0) >= 0 ? '+' : ''}${Math.round(deltas.reduce((sum, value) => sum + value, 0))}`
              : '—',
          ],
        ].map(([label, value]) => (
          <div className="rounded-lg border border-border p-3" key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-heading text-xl font-bold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default AnalyticsPage
