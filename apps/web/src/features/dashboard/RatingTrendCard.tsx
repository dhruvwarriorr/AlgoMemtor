import { useId, useMemo, useState, type PointerEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from '@/lib/router'
import type {
  ProviderKey,
  ProviderRatingChange,
} from '@algomemtor/shared-contracts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { TrendingDown, TrendingUp } from '@/components/icons/algo-icons'
import { PlatformTierBadge } from '@/components/kit/PlatformTierBadge'
import { SpotlightCard } from '@/components/kit/surfaces'
import { CountUp } from '@/components/motion/CountUp'
import {
  dashEase as ease,
  ratingTiers,
  tierFor,
} from '@/features/dashboard/dashboard-format'
import { useElementWidth } from '@/features/dashboard/use-element-width'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { cn } from '@/lib/utils'

type RatingPoint = {
  date: string
  rating: number
  delta: number
  contest: string
}

const HEIGHT = 236
const PAD = { top: 26, right: 14, bottom: 28, left: 10 }

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function longDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(value))
}

// A smooth curve through the points (Catmull-Rom as cubic Béziers).
function smoothPath(points: readonly { x: number; y: number }[]) {
  if (points.length === 0) return ''
  const first = points[0]
  if (first === undefined) return ''
  let path = `M ${first.x} ${first.y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[index + 2] ?? p2
    if (!p0 || !p1 || !p2 || !p3) continue
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return path
}

// A ring that fills with progress through the current tier.
function TierRing({ progress, color }: { progress: number; color: string }) {
  const reduceMotion = useReducedMotion()
  const length = 2 * Math.PI * 7
  return (
    <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 18 18">
      <circle
        cx="9"
        cy="9"
        fill="none"
        r="7"
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeWidth="3"
      />
      <motion.circle
        animate={{ strokeDasharray: `${progress * length} ${length}` }}
        cx="9"
        cy="9"
        fill="none"
        initial={reduceMotion ? false : { strokeDasharray: `0 ${length}` }}
        r="7"
        stroke={color}
        strokeLinecap="round"
        strokeWidth="3"
        transform="rotate(-90 9 9)"
        transition={{ duration: 1.2, ease, delay: 0.6 }}
      />
    </svg>
  )
}

// Contest rating as a flight path through the platform's rank bands, drawn
// in from the left, with a crosshair that snaps to the nearest contest.
export function RatingTrendCard({
  history,
  accounts = [],
  className,
}: {
  history: readonly ProviderRatingChange[]
  // Linked accounts' reported standing (a LeetCode badge is not derivable
  // from the rating).
  accounts?: readonly { provider: ProviderKey; rank?: string | undefined }[]
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const id = useId().replace(/[^\w-]/g, '')
  const { ref, width: measured } = useElementWidth<HTMLDivElement>()
  const width = measured > 0 ? measured : 640
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
  const [hover, setHover] = useState<number | null>(null)
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
          date: change.occurredAt,
          rating: Math.round(change.newRating),
          delta: Math.round(change.delta),
          contest: change.contestName ?? change.contestId ?? 'Contest',
        })),
    [history, provider],
  )

  const latest = points.at(-1)
  const peakIndex = points.reduce(
    (top, point, index) =>
      point.rating > (points[top]?.rating ?? -Infinity) ? index : top,
    0,
  )
  const peak = points[peakIndex]
  const rising = (latest?.delta ?? 0) >= 0
  const tiers = ratingTiers(provider)
  const standing =
    tiers !== undefined && latest !== undefined
      ? tierFor(tiers, latest.rating)
      : undefined

  const ratings = points.map((point) => point.rating)
  const low =
    ratings.length === 0 ? 0 : Math.floor((Math.min(...ratings) - 70) / 50) * 50
  const high =
    ratings.length === 0
      ? 100
      : Math.ceil((Math.max(...ratings) + 70) / 50) * 50
  const plotWidth = width - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const x = (index: number) =>
    PAD.left +
    (points.length <= 1
      ? plotWidth / 2
      : (index / (points.length - 1)) * plotWidth)
  const y = (rating: number) =>
    PAD.top + (1 - (rating - low) / Math.max(1, high - low)) * plotHeight
  const coords = points.map((point, index) => ({
    x: x(index),
    y: y(point.rating),
  }))
  const line = smoothPath(coords)
  const area =
    coords.length > 1
      ? `${line} L ${coords.at(-1)?.x ?? 0} ${HEIGHT - PAD.bottom} L ${coords[0]?.x ?? 0} ${HEIGHT - PAD.bottom} Z`
      : ''
  const bands = (tiers ?? [])
    .map((tier, index) => {
      const top = Math.min(high, tiers?.[index + 1]?.min ?? Infinity)
      const bottom = Math.max(low, tier.min)
      return { tier, top, bottom }
    })
    .filter((band) => band.top > band.bottom)
  const labelCount = Math.min(
    points.length,
    Math.max(2, Math.floor(width / 120)),
  )
  const labelIndexes = Array.from({ length: labelCount }, (_, index) =>
    Math.round((index / Math.max(1, labelCount - 1)) * (points.length - 1)),
  )
  const deltas = points.map((point) => point.delta)
  const net = deltas.reduce((sum, delta) => sum + delta, 0)
  const hovered = hover === null ? undefined : points[hover]
  const hoveredAt = hover === null ? undefined : coords[hover]

  function onPointerMove(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const offset = event.clientX - rect.left
    const ratio = offset / Math.max(1, rect.width)
    setHover(
      Math.max(
        0,
        Math.min(points.length - 1, Math.round(ratio * (points.length - 1))),
      ),
    )
  }

  return (
    <SpotlightCard
      aria-labelledby="rating-heading"
      as="section"
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-soft',
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
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <CountUp
                className="font-heading text-[2.6rem] leading-none font-bold tracking-[-0.02em] text-foreground"
                value={latest.rating}
              />
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold',
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
              {provider === 'codechef' || provider === 'leetcode' ? (
                <PlatformTierBadge
                  provider={provider}
                  rank={
                    accounts.find((account) => account.provider === provider)
                      ?.rank
                  }
                  rating={latest.rating}
                  size="md"
                />
              ) : standing?.tier ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
                  style={{
                    borderColor: `color-mix(in oklab, ${standing.tier.color} 45%, transparent)`,
                    color: standing.tier.color,
                    background: `color-mix(in oklab, ${standing.tier.color} 12%, transparent)`,
                  }}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: standing.tier.color }}
                  />
                  {standing.tier.name}
                </span>
              ) : null}
              {standing?.tier && standing.next ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <TierRing
                    color={standing.next.color}
                    progress={
                      (latest.rating - standing.tier.min) /
                      Math.max(1, standing.next.min - standing.tier.min)
                    }
                  />
                  <span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {standing.next.min - latest.rating}
                    </span>{' '}
                    to {standing.next.name}
                  </span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {providers.length > 1 ? (
          <div
            aria-label="Platform"
            className="flex gap-1 rounded-xl bg-secondary p-1"
            role="radiogroup"
          >
            {providers.map((item) => (
              <button
                aria-checked={item === provider}
                className={cn(
                  'relative flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors duration-300',
                  item === provider
                    ? 'text-foreground'
                    : 'text-foreground/60 hover:text-foreground',
                )}
                key={item}
                onClick={() => {
                  setPicked(item)
                  setHover(null)
                }}
                role="radio"
                type="button"
              >
                {item === provider ? (
                  <motion.span
                    className="absolute inset-0 -z-0 rounded-lg bg-card shadow-soft"
                    layoutId={`${id}-provider`}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                ) : null}
                <span className="relative flex items-center gap-1.5">
                  <ProviderLogo className="size-4" provider={item} />
                  {providerLabels[item]}
                </span>
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

      <div className="relative mt-3 min-w-0 flex-1" ref={ref}>
        {points.length > 1 ? (
          <>
            <svg
              aria-label={`${providerLabels[provider]} rating over ${points.length} contests, now ${latest?.rating}, peak ${peak?.rating}`}
              className="block overflow-visible"
              height={HEIGHT}
              role="img"
              width={width}
            >
              <defs>
                <linearGradient id={`${id}-stroke`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="60%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#4ade80" />
                </linearGradient>
                <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                </linearGradient>
                <clipPath id={`${id}-wipe`}>
                  <motion.rect
                    animate={{ width: width + 20 }}
                    height={HEIGHT + 20}
                    initial={reduceMotion ? false : { width: 0 }}
                    key={provider}
                    transition={{ duration: 1.8, ease, delay: 0.2 }}
                    width={width + 20}
                    x={-10}
                    y={-10}
                  />
                </clipPath>
              </defs>
              {bands.map((band) => (
                <g key={band.tier.name}>
                  <rect
                    fill={band.tier.color}
                    fillOpacity="0.07"
                    height={y(band.bottom) - y(band.top)}
                    width={plotWidth}
                    x={PAD.left}
                    y={y(band.top)}
                  />
                  {band.bottom > low ? (
                    <line
                      stroke={band.tier.color}
                      strokeDasharray="3 5"
                      strokeOpacity="0.45"
                      x1={PAD.left}
                      x2={PAD.left + plotWidth}
                      y1={y(band.bottom)}
                      y2={y(band.bottom)}
                    />
                  ) : null}
                  {y(band.bottom) - y(band.top) >= 16 ? (
                    <text
                      fill={band.tier.color}
                      fontSize="10"
                      fontWeight="600"
                      opacity="0.85"
                      textAnchor="start"
                      x={PAD.left + 6}
                      y={y(band.bottom) - 5}
                    >
                      {band.tier.name}
                    </text>
                  ) : null}
                </g>
              ))}
              {bands.length === 0
                ? [0.25, 0.5, 0.75].map((level) => (
                    <line
                      key={level}
                      stroke="var(--border)"
                      strokeDasharray="3 5"
                      x1={PAD.left}
                      x2={PAD.left + plotWidth}
                      y1={PAD.top + plotHeight * level}
                      y2={PAD.top + plotHeight * level}
                    />
                  ))
                : null}
              <g clipPath={`url(#${id}-wipe)`}>
                <path d={area} fill={`url(#${id}-fill)`} />
                <path
                  d={line}
                  fill="none"
                  stroke={`url(#${id}-stroke)`}
                  strokeLinecap="round"
                  strokeWidth="2.75"
                />
                {coords.length <= 40
                  ? coords.map((point, index) => (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        fill="var(--card)"
                        key={points[index]?.date ?? index}
                        r={hover === index ? 5.5 : 3.2}
                        stroke={
                          (points[index]?.delta ?? 0) >= 0
                            ? '#38bdf8'
                            : '#f87171'
                        }
                        strokeWidth="2"
                      />
                    ))
                  : null}
              </g>
              {peak !== undefined && coords[peakIndex] !== undefined ? (
                <motion.g
                  animate={{ opacity: 1, y: 0 }}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  transition={{ delay: 1.9, duration: 0.5 }}
                >
                  <circle
                    cx={coords[peakIndex]?.x}
                    cy={coords[peakIndex]?.y}
                    fill="#fbbf24"
                    r="4.5"
                  />
                  <text
                    fill="#f59e0b"
                    fontSize="10.5"
                    fontWeight="700"
                    textAnchor={
                      (coords[peakIndex]?.x ?? 0) > width - 60
                        ? 'end'
                        : (coords[peakIndex]?.x ?? 0) < 60
                          ? 'start'
                          : 'middle'
                    }
                    x={coords[peakIndex]?.x}
                    y={(coords[peakIndex]?.y ?? 0) - 11}
                  >
                    ★ Peak {peak.rating}
                  </text>
                </motion.g>
              ) : null}
              {coords.at(-1) !== undefined && !reduceMotion ? (
                <motion.circle
                  animate={{ r: [4, 12, 4], opacity: [0.9, 0, 0.9] }}
                  cx={coords.at(-1)?.x}
                  cy={coords.at(-1)?.y}
                  fill="none"
                  initial={{ r: 4 }}
                  stroke="#4ade80"
                  strokeWidth="2"
                  transition={{ duration: 2.4, repeat: Infinity, delay: 2 }}
                />
              ) : null}
              {hoveredAt !== undefined ? (
                <line
                  stroke="var(--foreground)"
                  strokeDasharray="3 4"
                  strokeOpacity="0.35"
                  x1={hoveredAt.x}
                  x2={hoveredAt.x}
                  y1={PAD.top - 6}
                  y2={HEIGHT - PAD.bottom}
                />
              ) : null}
              {labelIndexes.map((index, position) => (
                <text
                  fill="var(--muted-foreground)"
                  fontSize="11"
                  key={`${index}-${position}`}
                  textAnchor={
                    position === 0
                      ? 'start'
                      : position === labelIndexes.length - 1
                        ? 'end'
                        : 'middle'
                  }
                  x={coords[index]?.x}
                  y={HEIGHT - 6}
                >
                  {points[index] ? shortDate(points[index].date) : ''}
                </text>
              ))}
              <rect
                fill="transparent"
                height={HEIGHT - PAD.bottom}
                onPointerLeave={() => setHover(null)}
                onPointerMove={onPointerMove}
                width={plotWidth}
                x={PAD.left}
                y={0}
              />
            </svg>
            {hovered !== undefined && hoveredAt !== undefined ? (
              <div
                className="pointer-events-none absolute z-10 w-max max-w-56 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-xl border border-border bg-popover/95 px-3 py-2 text-popover-foreground shadow-lift backdrop-blur"
                role="status"
                style={{
                  left: Math.min(Math.max(hoveredAt.x, 100), width - 100),
                  top: hoveredAt.y,
                }}
              >
                <p className="truncate text-xs font-semibold">
                  {hovered.contest}
                </p>
                <p className="text-[0.68rem] text-muted-foreground">
                  {longDate(hovered.date)}
                </p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="font-heading text-lg font-bold tabular-nums">
                    {hovered.rating}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-bold tabular-nums',
                      hovered.delta >= 0 ? 'text-go' : 'text-destructive',
                    )}
                  >
                    {hovered.delta >= 0 ? '+' : ''}
                    {hovered.delta}
                  </span>
                </p>
              </div>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Contests', String(points.length)],
                ['Best gain', `+${Math.max(0, ...deltas)}`],
                ['Worst drop', String(Math.min(0, ...deltas))],
                ['Net change', `${net >= 0 ? '+' : ''}${net}`],
              ].map(([label, value]) => (
                <div
                  className="rounded-xl bg-secondary/70 px-3 py-2"
                  key={label}
                >
                  <dt className="text-[0.68rem] text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="font-heading text-base font-bold tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <div className="relative flex min-h-56 flex-1 flex-col justify-center gap-2 text-sm text-muted-foreground">
            <svg
              aria-hidden="true"
              className="absolute inset-0 size-full opacity-40"
              preserveAspectRatio="none"
              viewBox="0 0 400 160"
            >
              <path
                d="M 0 130 C 60 120, 90 90, 140 100 S 230 60, 280 70 S 360 30, 400 24"
                fill="none"
                stroke="#38bdf8"
                strokeDasharray="4 7"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <p className="relative">
              {points.length === 1
                ? 'One rated contest so far. The flight path appears after your next one.'
                : 'No rated contests yet.'}
            </p>
            <Link
              className="relative w-fit font-medium text-primary underline-offset-4 hover:underline"
              to="/settings#platforms"
            >
              Link a rated profile
            </Link>
          </div>
        )}
      </div>
    </SpotlightCard>
  )
}
