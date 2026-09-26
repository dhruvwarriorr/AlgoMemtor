import type { ReactNode } from 'react'
import type { ContestPlatformSummary } from '@algomemtor/shared-contracts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { providerColors } from '@/features/mentor/chart-theme'
import { SignedDelta } from '@/features/mentor/components/visuals'
import { formatDateTime, providerLabels } from '@/features/mentor/format'
import { cn } from '@/lib/utils'

// Rating over the platform's stored history, drawn as a small line.
function RatingSparkline({
  points,
  color,
  label,
}: {
  points: ContestPlatformSummary['ratingTrend']
  color: string
  label: string
}) {
  if (points.length < 2) return null
  const ratings = points.map((point) => point.rating)
  const min = Math.min(...ratings)
  const max = Math.max(...ratings)
  const span = Math.max(1, max - min)
  const width = 240
  const height = 48
  const coords = ratings.map((rating, index) => ({
    x: (index / (ratings.length - 1)) * width,
    y: height - 4 - ((rating - min) / span) * (height - 8),
  }))
  const line = coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
  const last = coords.at(-1)
  return (
    <svg
      aria-label={label}
      className="h-12 w-full overflow-visible"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <polygon
        fill={color}
        fillOpacity={0.12}
        points={`0,${height} ${line.join(' ')} ${width},${height}`}
      />
      <polyline
        fill="none"
        points={line.join(' ')}
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {last === undefined ? null : (
        <circle cx={last.x} cy={last.y} fill={color} r={3} />
      )}
    </svg>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[0.7rem] text-muted-foreground">{label}</dt>
      <dd className="font-heading text-sm font-bold tabular-nums">{value}</dd>
    </div>
  )
}

function PlatformCard({ platform }: { platform: ContestPlatformSummary }) {
  const color = providerColors[platform.provider]
  const name = providerLabels[platform.provider]
  const recent = platform.recent
  const analyzed = recent.contestsAnalyzed
  return (
    <article
      aria-label={`${name} contests`}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4"
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      <header className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-background">
          <ProviderLogo className="size-5" provider={platform.provider} />
        </span>
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-foreground">{name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {platform.contests.toLocaleString()} contest
            {platform.contests === 1 ? '' : 's'}
            {platform.lastContestAt === undefined
              ? ''
              : ` · last ${formatDateTime(platform.lastContestAt, false)}`}
          </p>
        </div>
      </header>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-heading text-3xl leading-none font-bold tracking-[-0.02em] tabular-nums">
            {platform.currentRating?.toLocaleString() ?? '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {platform.currentRating === undefined ? 'No rating yet' : 'Rating'}
            {platform.peakRating === undefined
              ? ''
              : ` · peak ${platform.peakRating.toLocaleString()}`}
          </p>
        </div>
        <div className="w-1/2 min-w-0">
          <RatingSparkline
            color={color}
            label={`${name} rating from ${platform.ratingTrend[0]?.rating ?? ''} to ${platform.ratingTrend.at(-1)?.rating ?? ''}`}
            points={platform.ratingTrend}
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 border-t border-dashed border-border pt-3">
        <Stat
          label="Best rank"
          value={
            platform.bestRank === undefined
              ? '—'
              : `#${platform.bestRank.toLocaleString()}`
          }
        />
        <Stat
          label="Average rank"
          value={
            platform.averageRank === undefined
              ? '—'
              : `#${platform.averageRank.toLocaleString()}`
          }
        />
      </dl>

      <div className="border-t border-dashed border-border pt-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {analyzed === 0
            ? 'No analysed contests here in the recent window.'
            : `Last ${analyzed} analysed contest${analyzed === 1 ? '' : 's'}`}
        </p>
        {analyzed === 0 ? null : (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Avg solved" value={recent.averageSolved ?? '—'} />
              <Stat
                label="First accept"
                value={
                  recent.averageFirstAcceptedMinute === null
                    ? '—'
                    : `${Math.round(recent.averageFirstAcceptedMinute)}m`
                }
              />
              <Stat
                label="Wrong / contest"
                value={recent.averageWrongPerContest ?? '—'}
              />
              <Stat
                label="Net rating"
                value={<SignedDelta value={recent.ratingDeltaTotal} />}
              />
            </dl>
            <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {(
                [
                  ['Slow starts', recent.slowStarts],
                  ['Early stops', recent.earlyStops],
                  ['Rushed', recent.rapidResubmitContests],
                  ['Rating drops', recent.ratingDrops],
                ] as const
              ).map(([label, count]) => (
                <li
                  className={cn(
                    'rounded-full px-2.5 py-0.5',
                    count === 0
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-[#f59e0b]/12 text-[#b45309] dark:text-[#fcd34d]',
                  )}
                  key={label}
                >
                  {label} {count}/{analyzed}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </article>
  )
}

// One card per platform with contest history, side by side for comparison.
export function PlatformContestCards({
  platforms,
}: {
  platforms: readonly ContestPlatformSummary[]
}) {
  if (platforms.length === 0) return null
  return (
    <section
      aria-labelledby="platforms-heading"
      className="flex min-w-0 flex-col gap-3"
    >
      <div>
        <h2
          className="text-xl font-semibold text-foreground"
          id="platforms-heading"
        >
          By platform
        </h2>
        <p className="text-sm text-muted-foreground">
          Rating and ranks cover each platform&apos;s full history; habits cover
          its contests among your most recent ones.
        </p>
      </div>
      <div
        className={cn(
          'grid min-w-0 gap-4',
          platforms.length === 2 && 'md:grid-cols-2',
          platforms.length >= 3 && 'md:grid-cols-2 xl:grid-cols-3',
        )}
      >
        {platforms.map((platform) => (
          <PlatformCard key={platform.provider} platform={platform} />
        ))}
      </div>
    </section>
  )
}
