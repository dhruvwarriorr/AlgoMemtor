import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  CoachRichBlock,
  ExternalProblemSummary,
  ProviderKey,
} from '@algomemtor/shared-contracts'

const providerLabels = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
} as const

const colors = [
  'var(--chart-1)',
  'var(--chart-3)',
  'var(--chart-2)',
  'var(--chart-4)',
]

function formatDisplayDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    ...(value.includes('T') ? { timeStyle: 'short' as const } : {}),
  }).format(date)
}

function ProblemLink({ problem }: { problem: ExternalProblemSummary }) {
  return (
    <a
      className="min-w-0 rounded-md border border-border bg-background p-3 transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={problem.canonicalUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="block truncate font-medium text-foreground">
        {problem.title}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">
        {providerLabels[problem.provider]} ·{' '}
        {problem.normalizedDifficulty ?? 'difficulty unknown'}
        {problem.acceptanceRate === undefined
          ? ''
          : ` · ${problem.acceptanceRate.toFixed(1)}% acceptance`}
      </span>
    </a>
  )
}

function WebProblemLink({
  problem,
}: {
  problem: Extract<
    CoachRichBlock,
    { type: 'web_problem_list' }
  >['problems'][number]
}) {
  return (
    <a
      className="min-w-0 rounded-md border border-border bg-background p-3 transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={problem.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="block font-medium text-foreground">{problem.title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">
        {problem.publisher ?? 'Public problem source'} · Web-grounded
      </span>
    </a>
  )
}

function ChartBlock({
  block,
}: {
  block: Extract<CoachRichBlock, { type: 'chart' }>
}) {
  const summary =
    block.datasetId === 'topic-assessments'
      ? 'Compare your current readiness, attempts, accuracy, and recent practice across focus topics.'
      : block.datasetId === 'practice-trend-30d'
        ? 'Your recent attempted and solved practice activity.'
        : block.summary
  const data = block.points.map((point) => ({
    label: point.label,
    ...point.values,
  }))
  return (
    <section
      className="rounded-lg border border-border bg-background p-4"
      aria-labelledby={`coach-chart-${block.title}`}
    >
      <h4
        className="font-semibold text-foreground"
        id={`coach-chart-${block.title}`}
      >
        {block.title}
      </h4>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{summary}</p>
      <div className="mt-4 h-56 min-w-0" role="img" aria-label={summary}>
        <ResponsiveContainer height="100%" width="100%">
          {block.chartType === 'line' ? (
            <LineChart
              data={data}
              margin={{ top: 8, right: 12, left: -16, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                opacity={0.12}
              />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10 }}
                tickLine={false}
              />
              <Tooltip />
              <Legend />
              {block.series.map((series, index) => (
                <Line
                  dataKey={series.key}
                  dot={false}
                  key={series.key}
                  name={series.label}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  type="monotone"
                />
              ))}
            </LineChart>
          ) : (
            <BarChart
              data={data}
              margin={{ top: 8, right: 12, left: -16, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                opacity={0.12}
              />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10 }}
                tickLine={false}
              />
              <Tooltip />
              <Legend />
              {block.series.map((series, index) => (
                <Bar
                  dataKey={series.key}
                  fill={colors[index % colors.length]}
                  key={series.key}
                  name={series.label}
                  stackId={
                    block.chartType === 'stacked_bar' ? 'activity' : undefined
                  }
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <details className="mt-3 rounded-md border border-border/70">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          View data table
        </summary>
        <div className="overflow-x-auto border-t border-border/70">
          <table className="min-w-full text-left text-xs">
            <caption className="sr-only">
              Tabular data for {block.title}
            </caption>
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium" scope="col">
                  Period
                </th>
                {block.series.map((series) => (
                  <th
                    className="px-2 py-1.5 font-medium"
                    key={series.key}
                    scope="col"
                  >
                    {series.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.points.slice(-10).map((point) => (
                <tr className="border-t border-border" key={point.label}>
                  <th
                    className="px-2 py-1.5 font-normal text-muted-foreground"
                    scope="row"
                  >
                    {point.label}
                  </th>
                  {block.series.map((series) => (
                    <td
                      className="px-2 py-1.5 text-foreground"
                      key={series.key}
                    >
                      {point.values[series.key] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

export function RichBlock({
  block,
  dismissedProblemKeys,
  onDismissProblem,
}: {
  block: CoachRichBlock
  dismissedProblemKeys?: ReadonlySet<string>
  onDismissProblem?: (provider: ProviderKey, externalId: string) => void
}) {
  if (block.type === 'metric_grid') {
    const visibleMetrics = block.metrics.filter(
      (metric) => metric.label.toLowerCase() !== 'coverage',
    )
    return (
      <section className="rounded-lg border border-border bg-background p-4">
        <h4 className="font-semibold text-foreground">{block.title}</h4>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {visibleMetrics.map((metric) => (
            <div
              className="rounded-md border border-border p-3"
              key={metric.label}
            >
              <dt className="text-xs text-muted-foreground">{metric.label}</dt>
              <dd className="mt-1 text-lg font-semibold text-foreground">
                {typeof metric.value === 'number'
                  ? metric.value.toLocaleString()
                  : metric.value}
              </dd>
              {metric.detail ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {metric.detail}
                </p>
              ) : null}
            </div>
          ))}
        </dl>
      </section>
    )
  }
  if (block.type === 'chart') return <ChartBlock block={block} />
  if (block.type === 'timeline') {
    const recentEntries = block.entries.slice(0, 6)
    const olderEntries = block.entries.slice(6)
    const renderEntries = (entries: typeof block.entries, keyPrefix: string) =>
      entries.map((entry, index) => (
        <li
          className="relative"
          key={`${keyPrefix}-${entry.date}-${entry.label}-${index}`}
        >
          <span
            aria-hidden="true"
            className="absolute -left-[1.31rem] top-1.5 size-2 rounded-full bg-primary"
          />
          <p className="text-xs text-muted-foreground">
            {formatDisplayDate(entry.date)}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {entry.label}
            {entry.value === undefined
              ? ''
              : ` · ${typeof entry.value === 'number' ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(entry.value) : entry.value}`}
          </p>
          {entry.detail ? (
            <p className="mt-1 text-xs text-muted-foreground">{entry.detail}</p>
          ) : null}
        </li>
      ))
    return (
      <section className="rounded-lg border border-border bg-background p-4">
        <h4 className="font-semibold text-foreground">{block.title}</h4>
        <ol className="mt-3 space-y-3 border-l border-border pl-4">
          {renderEntries(recentEntries, 'recent')}
        </ol>
        {olderEntries.length > 0 ? (
          <details className="mt-4 border-t border-border pt-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Show {olderEntries.length} older update
              {olderEntries.length === 1 ? '' : 's'}
            </summary>
            <ol className="mt-3 space-y-3 border-l border-border pl-4">
              {renderEntries(olderEntries, 'older')}
            </ol>
          </details>
        ) : null}
      </section>
    )
  }
  if (block.type === 'feature_redirect') {
    // Rendered inline under the answer by the Coach thread.
    return null
  }
  if (block.type === 'web_problem_list') {
    return (
      <section className="rounded-lg border border-border bg-background p-4">
        <h4 className="font-semibold text-foreground">{block.title}</h4>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {block.reason}
        </p>
        <div className="mt-3 grid gap-2">
          {block.problems.map((problem) => (
            <WebProblemLink key={problem.citationId} problem={problem} />
          ))}
        </div>
      </section>
    )
  }
  if (block.type === 'comparison_table') {
    return (
      <section className="overflow-x-auto rounded-lg border border-border bg-background p-4">
        <h4 className="font-semibold text-foreground">{block.title}</h4>
        <table className="mt-3 min-w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              {block.columns.map((column) => (
                <th className="px-2 py-2 font-medium" key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, index) => (
              <tr className="border-t border-border" key={`${row[0]}-${index}`}>
                {row.map((value, valueIndex) => (
                  <td
                    className="px-2 py-2 text-foreground"
                    key={`${value}-${valueIndex}`}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    )
  }
  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <h4 className="font-semibold text-foreground">{block.title}</h4>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {block.reason}
      </p>
      <div className="mt-3 grid gap-2">
        {block.problems
          .filter(
            (problem) =>
              !dismissedProblemKeys?.has(
                `${problem.provider}:${problem.externalId}`,
              ),
          )
          .map((problem) => (
            <div
              className="flex min-w-0 flex-col gap-1"
              key={`${problem.provider}:${problem.externalId}`}
            >
              <ProblemLink problem={problem} />
              {onDismissProblem ? (
                <button
                  className="self-end text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    onDismissProblem(problem.provider, problem.externalId)
                  }
                  type="button"
                >
                  Dismiss problem
                </button>
              ) : null}
            </div>
          ))}
      </div>
    </section>
  )
}
