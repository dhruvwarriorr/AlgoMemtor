import { useSearchParams } from 'react-router-dom'
import { LinkableProviderSchema } from '@algomemtor/shared-contracts'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

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
  limit,
}: {
  entries: readonly [string, number][]
  label: string
  limit?: number
}) {
  const sorted = entries
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
  const visible = limit === undefined ? sorted : sorted.slice(0, limit)
  const max = Math.max(1, ...visible.map(([, value]) => value))

  return (
    <section
      aria-labelledby={`${label.toLowerCase()}-distribution-heading`}
      className="min-w-0 space-y-3"
    >
      <div>
        <h3
          className="text-lg font-semibold text-foreground"
          id={`${label.toLowerCase()}-distribution-heading`}
        >
          {label} distribution
        </h3>
        {sorted.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No provider observations are available yet.
          </p>
        ) : null}
      </div>
      <ul className="space-y-2.5">
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
      {sorted.length > visible.length ? (
        <p className="text-xs text-muted-foreground">
          Showing the {visible.length} most used of {sorted.length} languages.
        </p>
      ) : null}
    </section>
  )
}

const topicColors = [
  '#21745d',
  '#428f78',
  '#69a88f',
  '#8bbc9e',
  '#b7cba4',
  '#d4c49b',
  '#bda476',
  '#b48e72',
  '#a78382',
  '#897e92',
  '#6b88a2',
  '#637697',
  '#87908a',
] as const

const shortTopicLabels: Record<string, string> = {
  'Dynamic Programming': 'Dynamic prog.',
  'Bit Manipulation': 'Bitwise',
  'Number Theory': 'Number theory',
  Implementation: 'Implement.',
  Constructive: 'Construct.',
}

function TopicDistribution({ entries }: { entries: [string, number][] }) {
  const sorted = entries
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
  const primary = sorted.slice(0, 12)
  const otherCount = sorted.slice(12).reduce((sum, [, count]) => sum + count, 0)
  const chartData = [
    ...primary.map(([name, count]) => ({ name, count })),
    ...(otherCount > 0 ? [{ name: 'Other topics', count: otherCount }] : []),
  ]

  return (
    <section
      aria-labelledby="topic-distribution-heading"
      className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div>
        <h2
          className="text-lg font-semibold text-foreground"
          id="topic-distribution-heading"
        >
          Topic distribution
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Recognized problem tags from connected providers. A problem may appear
          in more than one topic.
        </p>
      </div>
      {chartData.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No tagged solves are available yet.
        </p>
      ) : (
        <div className="mt-4 grid min-w-0 items-center gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div
            aria-label="Pie chart of the most observed problem topics. Topic counts are listed beside the chart."
            className="mx-auto h-64 w-full max-w-80"
            role="img"
          >
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="count"
                  isAnimationActive={false}
                  nameKey="name"
                  outerRadius={108}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {chartData.map((item, index) => (
                    <Cell
                      fill={topicColors[index % topicColors.length]}
                      key={item.name}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [
                    Number(value).toLocaleString(),
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul
            aria-label="Topic chart legend"
            className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-xs sm:gap-x-5 sm:text-sm"
          >
            {chartData.map((item, index) => (
              <li
                className="flex min-w-0 items-center gap-1.5 sm:gap-2"
                key={item.name}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: topicColors[index] }}
                />
                <span
                  className="min-w-0 flex-1 truncate text-foreground"
                  title={item.name}
                >
                  {shortTopicLabels[item.name] ?? item.name}
                </span>
                <span className="shrink-0 font-medium text-muted-foreground tabular-nums">
                  {item.count.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sorted.length > 12 ? (
        <details className="mt-4 border-t border-border pt-3 text-sm">
          <summary className="cursor-pointer font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            View all {sorted.length} topics
          </summary>
          <table className="mt-3 w-full max-w-lg text-left">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 font-medium" scope="col">
                  Topic
                </th>
                <th className="py-1 text-right font-medium" scope="col">
                  Tag count
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(([name, count]) => (
                <tr className="border-t border-border/70" key={name}>
                  <th className="py-1.5 font-normal" scope="row">
                    {name}
                  </th>
                  <td className="py-1.5 text-right tabular-nums">
                    {count.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
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

  const providerSolved = (
    ['codeforces', 'codechef', 'leetcode', 'cses'] as const
  ).map(
    (key) =>
      [providerLabels[key], analytics.solvedByProvider[key]] as [
        string,
        number,
      ],
  )
  const difficulty = Object.entries(analytics.solvedByDifficulty)
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
          Filter the derived view by provider. Topic tags are grouped into
          consistent learning areas; ratings and languages retain provider
          values.
        </p>
      </section>

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

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <Distribution entries={providerSolved} label="Provider" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <Distribution entries={difficulty} label="Difficulty" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 md:col-span-2 xl:col-span-1">
          <Distribution entries={languages} label="Language" limit={4} />
        </div>
      </div>

      <TopicDistribution entries={topics} />

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
