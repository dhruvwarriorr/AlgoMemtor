import { useSearchParams } from 'react-router-dom'
import { LinkableProviderSchema } from '@algomemtor/shared-contracts'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { ProviderFilter } from '@/features/platform/components/ProviderFilter'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { useAnalytics } from '@/features/platform/hooks'

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </dd>
      {detail ? (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  )
}

function Distribution({
  entries,
  label,
}: {
  entries: readonly [string, number][]
  label: string
}) {
  const visible = entries
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
  const max = Math.max(1, ...visible.map(([, value]) => value))

  return (
    <section
      aria-labelledby={`${label.toLowerCase()}-distribution-heading`}
      className="space-y-3"
    >
      <div>
        <h3
          className="text-lg font-semibold text-foreground"
          id={`${label.toLowerCase()}-distribution-heading`}
        >
          {label} distribution
        </h3>
        {visible.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No provider observations are available yet.
          </p>
        ) : null}
      </div>
      <ul className="space-y-3">
        {visible.map(([name, value]) => (
          <li className="min-w-0" key={name}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 break-words text-foreground">
                {name}
              </span>
              <span className="shrink-0 font-medium text-muted-foreground">
                {value.toLocaleString()}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="mt-1 h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
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
  const analytics = analyticsQuery.data

  function updateProvider(next: typeof provider) {
    const nextParams = new URLSearchParams(searchParams)
    if (next === undefined) nextParams.delete('provider')
    else nextParams.set('provider', next)
    setSearchParams(nextParams)
  }

  if (analyticsQuery.isPending) {
    return (
      <PageContainer>
        <PageHeader
          description="Understand your problem-solving patterns across connected providers."
          title="Analytics"
        />
        <PageSkeleton label="Loading unified analytics" rows={5} />
      </PageContainer>
    )
  }

  if (analyticsQuery.isError || analytics === undefined) {
    return (
      <PageContainer>
        <PageHeader
          description="Understand your problem-solving patterns across connected providers."
          title="Analytics"
        />
        <ErrorState
          message={
            analyticsQuery.error instanceof Error
              ? analyticsQuery.error.message
              : 'Analytics could not be loaded.'
          }
          onRetry={() => void analyticsQuery.refetch()}
          title="Unable to load analytics"
        />
      </PageContainer>
    )
  }

  const providerSolved = (['codeforces', 'codechef', 'leetcode'] as const).map(
    (key) =>
      [providerLabels[key], analytics.solvedByProvider[key]] as [
        string,
        number,
      ],
  )
  const difficulty = Object.entries(analytics.solvedByDifficulty)
  const solvedOverTime = Object.entries(analytics.solvedOverTime).sort(
    ([left], [right]) => right.localeCompare(left),
  )
  const topics = Object.entries(analytics.topicCounts)
  const languages = Object.entries(analytics.languageCounts)

  return (
    <PageContainer>
      <PageHeader
        description="Understand your problem-solving patterns across connected providers. Totals are provider-reported and are not deduplicated across platforms."
        title="Analytics"
      />

      <section
        aria-label="Analytics filters"
        className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <ProviderFilter
          id="analytics-provider"
          onChange={updateProvider}
          value={provider}
        />
        <p className="max-w-xl text-sm text-muted-foreground">
          Filter the derived view by provider. Native ratings, tags, and
          language names remain unchanged.
        </p>
      </section>

      {analytics.dataCompleteness !== 'complete' ||
      analytics.staleProviders.length > 0 ? (
        <aside
          className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
          role="status"
        >
          Analytics are based on partial or stale provider data. Connect and
          synchronize profiles to improve coverage.
          {analytics.staleProviders.length > 0 ? (
            <span className="block mt-1">
              Stale:{' '}
              {analytics.staleProviders
                .map((item) => providerLabels[item])
                .join(', ')}
              .
            </span>
          ) : null}
        </aside>
      ) : null}

      <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          detail={
            provider === undefined
              ? 'Across active provider links'
              : providerLabels[provider]
          }
          label="Total solved"
          value={analytics.solvedTotal.toLocaleString()}
        />
        <MetricCard
          detail="From the available recent submission window"
          label="Acceptance rate"
          value={
            analytics.acceptanceRate === undefined
              ? 'Not available'
              : `${analytics.acceptanceRate.toFixed(1)}%`
          }
        />
        <MetricCard
          detail="Native provider rating changes"
          label="Rating changes"
          value={analytics.ratingHistory.length.toLocaleString()}
        />
        <MetricCard
          detail="Provider contest observations"
          label="Contests"
          value={analytics.contestParticipation.length.toLocaleString()}
        />
      </dl>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="space-y-6 rounded-xl border border-border bg-card p-4 sm:p-5">
          <Distribution entries={providerSolved} label="Provider" />
          <Distribution entries={difficulty} label="Difficulty" />
          <Distribution entries={solvedOverTime} label="Daily solves" />
        </div>
        <div className="space-y-6 rounded-xl border border-border bg-card p-4 sm:p-5">
          <Distribution entries={topics} label="Topic" />
          <Distribution entries={languages} label="Language" />
        </div>
      </div>

      <section aria-labelledby="rating-history-heading" className="space-y-3">
        <div>
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="rating-history-heading"
          >
            Rating progression
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Native rating changes are shown exactly as reported by each
            provider.
          </p>
        </div>
        {analytics.ratingHistory.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            No rating history has been synchronized yet.
          </p>
        ) : (
          <ul className="grid min-w-0 gap-3 md:grid-cols-2">
            {analytics.ratingHistory.map((change) => (
              <li
                className="rounded-lg border border-border bg-card p-4"
                key={`${change.provider}:${change.eventId}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {providerLabels[change.provider]}
                    </p>
                    <p className="mt-1 break-words font-medium text-foreground">
                      {change.contestName ?? change.contestId ?? 'Rating event'}
                    </p>
                  </div>
                  <span
                    className={
                      change.delta >= 0
                        ? 'font-semibold text-emerald-700 dark:text-emerald-300'
                        : 'font-semibold text-destructive'
                    }
                  >
                    {change.delta >= 0 ? '+' : ''}
                    {change.delta}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {change.oldRating} → {change.newRating} ·{' '}
                  {formatDate(change.occurredAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="contest-activity-heading" className="space-y-3">
        <div>
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="contest-activity-heading"
          >
            Contest participation
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Participation records are provider observations and may be
            incomplete when a provider exposes only a bounded history.
          </p>
        </div>
        {analytics.contestParticipation.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            No contest participation has been synchronized yet.
          </p>
        ) : (
          <ul className="grid min-w-0 gap-3 md:grid-cols-2">
            {analytics.contestParticipation.map((participation) => (
              <li
                className="rounded-lg border border-border bg-card p-4"
                key={`${participation.provider}:${participation.contestId}`}
              >
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {providerLabels[participation.provider]}
                </p>
                <p className="mt-1 break-words font-medium text-foreground">
                  {participation.contestName ?? participation.contestId}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {participation.rank === undefined
                    ? 'Rank not reported'
                    : `Rank ${participation.rank}`}
                  {participation.score === undefined
                    ? ''
                    : ` · Score ${participation.score}`}
                  {participation.attendedAt === undefined
                    ? ''
                    : ` · ${formatDate(participation.attendedAt)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  )
}

export default AnalyticsPage
