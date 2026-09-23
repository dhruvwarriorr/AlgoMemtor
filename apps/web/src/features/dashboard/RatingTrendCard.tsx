import { useMemo, useState } from 'react'
import type {
  ProviderKey,
  ProviderRatingChange,
} from '@algomemtor/shared-contracts'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { cn } from '@/lib/utils'

const tooltipStyle = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  color: 'var(--popover-foreground)',
  fontSize: '0.8rem',
}

type RatingPoint = {
  label: string
  rating: number
  delta: number
  contest: string
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

// Contest rating over time for one platform, with a switcher when the learner
// has rated history on more than one.
export function RatingTrendCard({
  history,
  className,
}: {
  history: readonly ProviderRatingChange[]
  className?: string
}) {
  const providers = useMemo(() => {
    const counts = new Map<ProviderKey, number>()
    for (const change of history) {
      counts.set(change.provider, (counts.get(change.provider) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([provider]) => provider)
  }, [history])
  const [picked, setPicked] = useState<ProviderKey | null>(null)
  const provider =
    picked !== null && providers.includes(picked) ? picked : providers[0]

  const points = useMemo<RatingPoint[]>(
    () =>
      history
        .filter((change) => change.provider === provider)
        .sort(
          (a, b) =>
            new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
        )
        .map((change) => ({
          label: shortDate(change.occurredAt),
          rating: Math.round(change.newRating),
          delta: Math.round(change.delta),
          contest: change.contestName ?? change.contestId ?? 'Contest',
        })),
    [history, provider],
  )

  const latest = points.at(-1)
  const peak = points.reduce((max, point) => Math.max(max, point.rating), 0)
  const rising = (latest?.delta ?? 0) >= 0

  return (
    <section
      aria-labelledby="rating-heading"
      className={cn(
        'flex min-h-72 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="font-sans text-sm font-medium text-muted-foreground"
            id="rating-heading"
          >
            Contest rating
          </h2>
          {latest ? (
            <div className="mt-1 flex items-baseline gap-3">
              <p className="font-heading text-4xl leading-none font-bold tracking-[-0.04em] text-foreground">
                {latest.rating}
              </p>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold',
                  rising
                    ? 'bg-go-soft text-go-foreground'
                    : 'bg-danger-soft text-danger-foreground',
                )}
              >
                {rising ? (
                  <TrendingUp aria-hidden="true" className="size-4" />
                ) : (
                  <TrendingDown aria-hidden="true" className="size-4" />
                )}
                {rising ? '+' : ''}
                {latest.delta}
              </span>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                Peak {peak}
              </span>
            </div>
          ) : null}
        </div>
        {providers.length > 1 ? (
          <div
            aria-label="Platform"
            className="flex gap-1 rounded-md bg-secondary p-1"
            role="radiogroup"
          >
            {providers.map((item) => (
              <button
                aria-checked={item === provider}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
                  item === provider
                    ? 'bg-card text-foreground shadow-soft'
                    : 'text-foreground/60 hover:text-foreground',
                )}
                key={item}
                onClick={() => setPicked(item)}
                role="radio"
                type="button"
              >
                <ProviderLogo className="size-4" provider={item} />
                {providerLabels[item]}
              </button>
            ))}
          </div>
        ) : provider ? (
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ProviderLogo className="size-5 text-primary" provider={provider} />
            {providerLabels[provider]}
          </span>
        ) : null}
      </div>

      {points.length > 1 ? (
        <div
          aria-label={`${providerLabels[provider]} rating over ${points.length} contests, now ${latest?.rating}`}
          className="mt-3 min-h-0 flex-1"
          role="img"
        >
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart
              data={points}
              margin={{ top: 8, right: 8, left: -4, bottom: 0 }}
            >
              <defs>
                <linearGradient id="rating-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--primary)"
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--primary)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                axisLine={false}
                dataKey="label"
                minTickGap={24}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                domain={['dataMin - 50', 'dataMax + 50']}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, _name, item) => {
                  const point = item.payload as RatingPoint
                  const sign = point.delta >= 0 ? '+' : ''
                  return [
                    `${String(value)} (${sign}${point.delta})`,
                    point.contest,
                  ]
                }}
              />
              <Area
                activeDot={{ r: 5, fill: 'var(--primary)' }}
                dataKey="rating"
                fill="url(#rating-fill)"
                isAnimationActive={false}
                stroke="var(--primary)"
                strokeWidth={2.5}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-4 flex flex-1 flex-col justify-center gap-2 text-sm text-muted-foreground">
          <p>
            {points.length === 1
              ? 'One rated contest so far. The chart appears after your next one.'
              : 'No rated contests yet.'}
          </p>
          <Link
            className="w-fit font-medium text-primary underline-offset-4 hover:underline"
            to="/settings#platforms"
          >
            Link a rated profile
          </Link>
        </div>
      )}
    </section>
  )
}
