import { useId, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { AnalyticsInsights } from '@algomemtor/shared-contracts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { InfoTip } from '@/components/kit/InfoTip'
import { CountUp } from '@/components/motion/CountUp'
import { CellTooltip } from '@/components/ui/cell-tooltip'
import { providerColors } from '@/features/mentor/chart-theme'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { EmptyInsight, InsightCard } from '@/features/insights/InsightsCharts'
import {
  insightEase as ease,
  insightPalette as palette,
  monthLabel,
  packBubbles,
  ratingColor,
  titleCase,
} from '@/features/insights/insights-format'
import { useReveal } from '@/features/insights/use-reveal'
import { cellTipFrom, type CellTip } from '@/lib/cell-tip'
import { cn } from '@/lib/utils'

function Chip({
  label,
  children,
  color,
}: {
  label: string
  children: ReactNode
  color?: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs">
      {color === undefined ? null : (
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ background: color }}
        />
      )}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground tabular-nums">
        {children}
      </span>
    </span>
  )
}

function percent(part: number, whole: number) {
  return whole === 0 ? 0 : Math.round((part / whole) * 100)
}

// ---------------------------------------------------------------------------
// Monthly volume: a skyline of solve columns with the submissions line
// drawn across it and a readout for the hovered month.

export function MonthlySkyline({
  monthly,
}: {
  monthly: AnalyticsInsights['monthly']
}) {
  const { ref, shown, reduceMotion } = useReveal<HTMLDivElement>()
  const gradientId = useId()
  const [active, setActive] = useState<number | null>(null)
  const hasData = monthly.some(
    (item) => item.solved > 0 || item.submissions > 0,
  )
  const tallest = Math.max(1, ...monthly.map((item) => item.solved))
  const busiest = Math.max(1, ...monthly.map((item) => item.submissions))
  const best = monthly.reduce(
    (top, item, index) =>
      item.solved > (monthly[top]?.solved ?? -1) ? index : top,
    0,
  )
  const totalSolved = monthly.reduce((sum, item) => sum + item.solved, 0)
  const totalSubmissions = monthly.reduce(
    (sum, item) => sum + item.submissions,
    0,
  )
  const totalAccepted = monthly.reduce((sum, item) => sum + item.accepted, 0)
  const focus = monthly[active ?? monthly.length - 1]
  const line = monthly
    .map(
      (item, index) =>
        `${index === 0 ? 'M' : 'L'} ${index + 0.5} ${100 - (item.submissions / busiest) * 92}`,
    )
    .join(' ')

  return (
    <InsightCard
      action={
        <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
          <Chip color="#22c55e" label="New solves">
            {totalSolved.toLocaleString()}
          </Chip>
          <Chip color="#2d6cdf" label="Accepted">
            {percent(totalAccepted, totalSubmissions)}%
          </Chip>
        </div>
      }
      className="lg:col-span-8"
      description="New solves and submissions in each of the last 24 months."
      title="Monthly volume"
    >
      {!hasData || focus === undefined ? (
        <EmptyInsight>No dated activity in the last two years.</EmptyInsight>
      ) : (
        <div className="flex flex-1 flex-col" ref={ref}>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="font-heading text-3xl font-bold tabular-nums">
              {focus.solved}
              <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                solves in{' '}
                {new Intl.DateTimeFormat(undefined, {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(`${focus.month}-15T12:00:00.000Z`))}
              </span>
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {focus.submissions} submissions ·{' '}
              {percent(focus.accepted, focus.submissions)}% accepted
            </p>
          </div>
          <div
            aria-label={`Monthly volume: ${totalSolved} new solves over ${monthly.length} months, best month ${monthLabel(monthly[best]?.month ?? focus.month)}`}
            className="relative mt-4 min-h-60 flex-1"
            onMouseLeave={() => setActive(null)}
            role="img"
          >
            {[0.25, 0.5, 0.75].map((level) => (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-dashed border-border"
                key={level}
                style={{ bottom: `${level * 100}%` }}
              />
            ))}
            <ol className="absolute inset-0 flex items-end gap-[3px] sm:gap-1.5">
              {monthly.map((item, index) => (
                <li
                  className="relative flex h-full min-w-0 flex-1 items-end"
                  key={item.month}
                  onMouseEnter={() => setActive(index)}
                >
                  {index === best && item.solved > 0 ? (
                    <motion.span
                      animate={shown ? { opacity: 1, y: 0 } : undefined}
                      className="absolute left-1/2 z-10 -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[0.62rem] font-semibold whitespace-nowrap text-ink-foreground"
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      style={{
                        bottom: `calc(${(item.solved / tallest) * 100}% + 6px)`,
                      }}
                      transition={{ delay: 1.1, duration: 0.4 }}
                    >
                      Best · {item.solved}
                    </motion.span>
                  ) : null}
                  <motion.span
                    animate={
                      shown
                        ? { height: `${(item.solved / tallest) * 100}%` }
                        : undefined
                    }
                    className={cn(
                      'block w-full rounded-t-md transition-opacity duration-200',
                      active !== null && active !== index && 'opacity-45',
                    )}
                    initial={reduceMotion ? false : { height: '0%' }}
                    style={{
                      background:
                        'linear-gradient(to top, #16a34a, #22c55e 45%, #38bdf8)',
                      height: reduceMotion
                        ? `${(item.solved / tallest) * 100}%`
                        : undefined,
                    }}
                    transition={{ duration: 0.7, ease, delay: index * 0.03 }}
                  />
                </li>
              ))}
            </ol>
            <motion.div
              animate={shown ? { clipPath: 'inset(-4% 0% -4% 0%)' } : undefined}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              initial={
                reduceMotion ? false : { clipPath: 'inset(-4% 100% -4% 0%)' }
              }
              transition={{ duration: 1.4, ease, delay: 0.5 }}
            >
              <svg
                className="size-full overflow-visible"
                preserveAspectRatio="none"
                viewBox={`0 0 ${monthly.length} 100`}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#2d6cdf" />
                  </linearGradient>
                </defs>
                <path
                  d={line}
                  fill="none"
                  stroke={`url(#${gradientId})`}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </motion.div>
          </div>
          <div className="mt-2 flex gap-[3px] text-[0.65rem] text-muted-foreground sm:gap-1.5">
            {monthly.map((item, index) => (
              <span
                className="min-w-0 flex-1 text-center whitespace-nowrap"
                key={item.month}
              >
                {index % 3 === 0 ? monthLabel(item.month) : ''}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[linear-gradient(to_top,#16a34a,#38bdf8)]" />
              New solves
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-[#2d6cdf]" />
              Submissions
            </span>
            <span className="ml-auto">Hover a month for its numbers</span>
          </div>
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Difficulty: three concentric rings, each filled to its share of solves.

const difficultyMeta = [
  { key: 'easy', label: 'Easy', color: '#1f9d5c', radius: 84 },
  { key: 'medium', label: 'Medium', color: '#f2b84b', radius: 64 },
  { key: 'hard', label: 'Hard', color: '#e0484f', radius: 44 },
] as const

export function DifficultyRings({
  difficulty,
  allTimeTotal,
}: {
  difficulty: Record<'easy' | 'medium' | 'hard', number>
  allTimeTotal?: number
}) {
  const { ref, shown, reduceMotion } = useReveal<HTMLDivElement>()
  const total = difficulty.easy + difficulty.medium + difficulty.hard
  const hardEvery =
    difficulty.hard === 0 ? undefined : Math.max(1, total / difficulty.hard)
  const untracked =
    allTimeTotal === undefined ? 0 : Math.max(0, allTimeTotal - total)
  return (
    <InsightCard
      className="lg:col-span-4"
      description="Difficulty of every solve with known difficulty — some platforms don't expose difficulty for older solves, so this can be less than your all-time total."
      title="Difficulty split"
    >
      {total === 0 ? (
        <EmptyInsight>No difficulty data yet.</EmptyInsight>
      ) : (
        <div className="flex flex-1 flex-col" ref={ref}>
          <div className="relative mx-auto w-full max-w-52">
            <svg
              aria-label={difficultyMeta
                .map(
                  (item) =>
                    `${item.label} ${difficulty[item.key]} (${percent(difficulty[item.key], total)}%)`,
                )
                .join(', ')}
              className="w-full"
              role="img"
              viewBox="0 0 200 200"
            >
              {difficultyMeta.map((item, index) => {
                const length = 2 * Math.PI * item.radius
                const share = difficulty[item.key] / total
                return (
                  <g key={item.key}>
                    <circle
                      cx="100"
                      cy="100"
                      fill="none"
                      r={item.radius}
                      stroke={item.color}
                      strokeOpacity="0.14"
                      strokeWidth="14"
                    />
                    <motion.circle
                      animate={
                        shown
                          ? { strokeDasharray: `${share * length} ${length}` }
                          : undefined
                      }
                      cx="100"
                      cy="100"
                      fill="none"
                      initial={
                        reduceMotion
                          ? false
                          : { strokeDasharray: `0 ${length}` }
                      }
                      r={item.radius}
                      stroke={item.color}
                      strokeDasharray={`${share * length} ${length}`}
                      strokeLinecap="round"
                      strokeWidth="14"
                      transform="rotate(-90 100 100)"
                      transition={{ duration: 1.2, ease, delay: index * 0.2 }}
                    />
                  </g>
                )
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <CountUp
                  className="font-heading text-2xl leading-none font-bold tabular-nums"
                  value={total}
                />
                <p className="text-[0.68rem] text-muted-foreground">tracked</p>
              </div>
            </div>
          </div>
          <ul className="mt-4 grid gap-1.5">
            {difficultyMeta.map((item) => (
              <li
                className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-1.5 text-sm"
                key={item.key}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ background: item.color }}
                />
                <span className="flex-1 font-medium">{item.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {percent(difficulty[item.key], total)}%
                </span>
                <span className="w-12 text-right font-semibold tabular-nums">
                  {difficulty[item.key].toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          {hardEvery === undefined ? null : (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              About 1 in {Math.round(hardEvery)} of your tracked solves is Hard.
            </p>
          )}
          {untracked === 0 ? null : (
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {untracked.toLocaleString()} more all-time solve
              {untracked === 1 ? '' : 's'} have no difficulty on record.
            </p>
          )}
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Rating ladder: stacked columns per rating band that rise into place, with
// each band's rank colour under it.

const ladderProviders = ['codeforces', 'codechef', 'leetcode', 'cses'] as const

export function RatingStaircase({
  bands,
}: {
  bands: AnalyticsInsights['ratingBands']
}) {
  const { ref, shown, reduceMotion } = useReveal<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const providers = ladderProviders.filter((provider) =>
    bands.some((band) => band[provider] > 0),
  )
  const totals = bands.map((band) =>
    providers.reduce((sum, provider) => sum + band[provider], 0),
  )
  const tallest = Math.max(1, ...totals)
  const peak = totals.indexOf(Math.max(...totals, 0))
  const focusIndex = active ?? peak
  const focus = bands[focusIndex]
  return (
    <InsightCard
      className="lg:col-span-7"
      description="Every rated solve by problem rating, stacked by platform."
      title="Rating ladder"
    >
      {bands.length === 0 || focus === undefined ? (
        <EmptyInsight>No rated solves yet.</EmptyInsight>
      ) : (
        <div className="flex flex-1 flex-col" ref={ref}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-sm">
              <span className="font-semibold">
                Rating {focus.min}–{focus.max}
              </span>
              <span className="text-muted-foreground">
                {' '}
                · {totals[focusIndex] ?? 0} solves
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {providers.map((provider) => (
                <Chip
                  color={providerColors[provider]}
                  key={provider}
                  label={providerLabels[provider]}
                >
                  {focus[provider]}
                </Chip>
              ))}
            </div>
          </div>
          <div
            aria-label="Solves by problem rating"
            className="relative mt-5 min-h-56 flex-1"
            onMouseLeave={() => setActive(null)}
            role="img"
          >
            {[0.33, 0.66].map((level) => (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-dashed border-border"
                key={level}
                style={{ bottom: `${level * 100}%` }}
              />
            ))}
            <ol className="absolute inset-0 flex items-end gap-2 sm:gap-3">
              {bands.map((band, index) => {
                const total = totals[index] ?? 0
                const height = `${(total / tallest) * 100}%`
                return (
                  <li
                    className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
                    key={band.min}
                    onMouseEnter={() => setActive(index)}
                  >
                    <motion.span
                      animate={shown ? { opacity: 1 } : undefined}
                      className="mb-1 text-center text-[0.65rem] font-semibold text-muted-foreground tabular-nums"
                      initial={reduceMotion ? false : { opacity: 0 }}
                      transition={{ delay: 0.6 + index * 0.06 }}
                    >
                      {total > 0 ? total : ''}
                    </motion.span>
                    <motion.span
                      animate={shown ? { height } : undefined}
                      className={cn(
                        'flex w-full flex-col-reverse overflow-hidden rounded-t-lg transition-[opacity,transform] duration-200',
                        focusIndex === index
                          ? 'ring-2 ring-foreground/15'
                          : active !== null && 'opacity-50',
                      )}
                      initial={reduceMotion ? false : { height: '0%' }}
                      style={{ height: reduceMotion ? height : undefined }}
                      transition={{
                        type: 'spring',
                        stiffness: 90,
                        damping: 16,
                        delay: index * 0.07,
                      }}
                    >
                      {providers.map((provider) => (
                        <span
                          className="block w-full"
                          key={provider}
                          style={{
                            flexGrow: band[provider],
                            background: providerColors[provider],
                          }}
                        />
                      ))}
                    </motion.span>
                  </li>
                )
              })}
            </ol>
          </div>
          <div className="mt-2 flex gap-2 sm:gap-3">
            {bands.map((band) => (
              <span className="min-w-0 flex-1 text-center" key={band.min}>
                <span
                  aria-hidden="true"
                  className="block h-1.5 rounded-full"
                  style={{ background: ratingColor(band.min) }}
                />
                <span className="mt-1 block text-[0.65rem] text-muted-foreground tabular-nums">
                  {band.min}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Verdicts: a donut whose arcs sweep in one after another; hovering a
// verdict lifts its arc and shows its share in the centre.

const verdictMeta = [
  { key: 'accepted', label: 'Accepted', color: '#1f9d5c' },
  { key: 'wrongAnswer', label: 'Wrong answer', color: '#e0484f' },
  { key: 'timeLimit', label: 'Time limit', color: '#f2b84b' },
  { key: 'memoryLimit', label: 'Memory limit', color: '#8b5cf6' },
  { key: 'runtimeError', label: 'Runtime error', color: '#ec4899' },
  { key: 'compileError', label: 'Compile error', color: '#14a3a3' },
  { key: 'other', label: 'Other', color: '#6c7a90' },
] as const

type VerdictKey = (typeof verdictMeta)[number]['key']

export function VerdictOrbit({
  verdicts,
  total,
}: {
  verdicts: AnalyticsInsights['verdicts']
  total: number
}) {
  const { ref, shown, reduceMotion } = useReveal<HTMLDivElement>()
  const [active, setActive] = useState<VerdictKey | null>(null)
  const items = verdictMeta
    .map((meta) => ({ ...meta, value: verdicts[meta.key] }))
    .filter((item) => item.value > 0)
  const sum = items.reduce((acc, item) => acc + item.value, 0)
  const radius = 76
  const length = 2 * Math.PI * radius
  const gap = items.length > 1 ? 3 : 0
  const arcs = items.map((item, index) => {
    const start = items
      .slice(0, index)
      .reduce((acc, previous) => acc + previous.value, 0)
    return {
      ...item,
      offset: (start / sum) * length,
      size: Math.max(0.5, (item.value / sum) * length - gap),
    }
  })
  const focus =
    items.find((item) => item.key === (active ?? 'accepted')) ?? items[0]
  const triesPerAccept =
    verdicts.accepted === 0 ? undefined : total / verdicts.accepted
  return (
    <InsightCard
      className="lg:col-span-5"
      description={`All ${total.toLocaleString()} observed submissions.`}
      title="Verdicts"
    >
      {items.length === 0 || focus === undefined ? (
        <EmptyInsight>No submissions observed yet.</EmptyInsight>
      ) : (
        <div
          className="grid flex-1 items-center gap-5 sm:grid-cols-2"
          ref={ref}
        >
          <div className="relative mx-auto w-full max-w-56">
            <svg
              aria-label={items
                .map((item) => `${item.label} ${item.value}`)
                .join(', ')}
              className="w-full overflow-visible"
              role="img"
              viewBox="0 0 200 200"
            >
              <circle
                cx="100"
                cy="100"
                fill="none"
                r={radius}
                stroke="color-mix(in oklab, var(--muted-foreground) 12%, transparent)"
                strokeWidth="22"
              />
              {arcs.map((arc, index) => (
                <motion.circle
                  animate={
                    shown
                      ? {
                          strokeDasharray: `${arc.size} ${length}`,
                          strokeWidth: active === arc.key ? 30 : 22,
                          opacity:
                            active === null || active === arc.key ? 1 : 0.3,
                        }
                      : undefined
                  }
                  cx="100"
                  cy="100"
                  fill="none"
                  initial={
                    reduceMotion ? false : { strokeDasharray: `0 ${length}` }
                  }
                  key={arc.key}
                  onMouseEnter={() => setActive(arc.key)}
                  onMouseLeave={() => setActive(null)}
                  r={radius}
                  stroke={arc.color}
                  strokeDasharray={`${arc.size} ${length}`}
                  strokeDashoffset={-arc.offset}
                  strokeWidth="22"
                  transform="rotate(-90 100 100)"
                  transition={{
                    strokeDasharray: {
                      duration: 0.7,
                      ease,
                      delay: 0.1 + index * 0.18,
                    },
                    default: { duration: 0.25 },
                  }}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p
                  className="font-heading text-3xl leading-none font-bold tabular-nums"
                  style={{ color: active === null ? undefined : focus.color }}
                >
                  {percent(focus.value, sum)}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {focus.label.toLowerCase()}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-0.5 text-sm">
              {items.map((item) => (
                <li key={item.key}>
                  <button
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                      active === item.key && 'bg-muted',
                    )}
                    onBlur={() => setActive(null)}
                    onFocus={() => setActive(item.key)}
                    onMouseEnter={() => setActive(item.key)}
                    onMouseLeave={() => setActive(null)}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-full"
                      style={{ background: item.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {item.value.toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {triesPerAccept === undefined ? null : (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-heading text-base font-bold text-foreground tabular-nums">
                  {triesPerAccept.toFixed(1)}
                </span>{' '}
                submissions per accepted solution
              </p>
            )}
          </div>
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Topic mix: packed bubbles sized by solves, popping in largest first.

export function TopicBubbles({
  topicCounts,
}: {
  topicCounts: Record<string, number>
}) {
  const { ref, shown, reduceMotion } = useReveal<HTMLDivElement>()
  const [active, setActive] = useState<string | null>(null)
  const sorted = Object.entries(topicCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
  const top = sorted.slice(0, 10)
  const rest = sorted.slice(10).reduce((sum, [, count]) => sum + count, 0)
  const total = sorted.reduce((sum, [, count]) => sum + count, 0)
  const layout = packBubbles(top.map(([, count]) => count))
  return (
    <InsightCard
      className="lg:col-span-7"
      description="Share of tagged solves per topic (all time)."
      title="Topic mix"
    >
      {top.length === 0 ? (
        <EmptyInsight>No tagged solves yet.</EmptyInsight>
      ) : (
        <div
          className="grid flex-1 items-center gap-5 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
          ref={ref}
        >
          <svg
            aria-label={top
              .map(([name, count]) => `${titleCase(name)} ${count}`)
              .join(', ')}
            className="max-h-80 w-full"
            role="img"
            viewBox={layout.viewBox}
          >
            {top.map(([name, count], index) => {
              const bubble = layout.bubbles[index]
              if (bubble === undefined) return null
              const color = palette[index % palette.length] ?? '#0ea5e9'
              const dim = active !== null && active !== name
              return (
                <g
                  key={name}
                  onMouseEnter={() => setActive(name)}
                  onMouseLeave={() => setActive(null)}
                  opacity={dim ? 0.35 : 1}
                  style={{ transition: 'opacity 200ms' }}
                >
                  <title>{`${titleCase(name)}: ${count}`}</title>
                  <motion.circle
                    animate={shown ? { r: bubble.r } : undefined}
                    cx={bubble.x}
                    cy={bubble.y}
                    fill={color}
                    fillOpacity="0.88"
                    initial={reduceMotion ? false : { r: 0 }}
                    r={bubble.r}
                    stroke={active === name ? 'var(--foreground)' : 'none'}
                    strokeWidth="0.03"
                    transition={{
                      type: 'spring',
                      stiffness: 140,
                      damping: 13,
                      delay: index * 0.08,
                    }}
                  />
                  {bubble.r >= 0.3 ? (
                    <motion.text
                      animate={shown ? { opacity: 1 } : undefined}
                      className="pointer-events-none font-heading"
                      fill="#fff"
                      fontSize={bubble.r * 0.34}
                      fontWeight="700"
                      initial={reduceMotion ? false : { opacity: 0 }}
                      textAnchor="middle"
                      transition={{ delay: 0.4 + index * 0.08 }}
                      x={bubble.x}
                      y={bubble.y + (bubble.r >= 0.45 ? 0 : bubble.r * 0.12)}
                    >
                      {count}
                      {bubble.r >= 0.45 ? (
                        <tspan
                          dy={bubble.r * 0.34}
                          fontSize={bubble.r * 0.2}
                          fontWeight="500"
                          x={bubble.x}
                        >
                          {titleCase(name).slice(0, 14)}
                        </tspan>
                      ) : null}
                    </motion.text>
                  ) : null}
                </g>
              )
            })}
          </svg>
          <ul className="flex flex-col gap-0.5 text-sm">
            {[
              ...top.map(([name, count], index) => ({
                name,
                count,
                color: palette[index % palette.length] ?? '#0ea5e9',
              })),
              ...(rest > 0
                ? [{ name: 'other', count: rest, color: '#6c7a90' }]
                : []),
            ].map((item) => (
              <li
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2 py-1 transition-colors',
                  active === item.name && 'bg-muted',
                )}
                key={item.name}
                onMouseEnter={() => setActive(item.name)}
                onMouseLeave={() => setActive(null)}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: item.color }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {titleCase(item.name)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {percent(item.count, total)}%
                </span>
                <span className="w-9 text-right font-semibold tabular-nums">
                  {item.count.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Topic strength: a tug of war per topic, solves pulling right and failed
// submissions pulling left, with the balance as a ratio.

function balanceTone(ratio: number) {
  if (ratio >= 2) return 'bg-go-soft text-go-foreground'
  if (ratio >= 1) return 'bg-[#f2b84b]/18 text-[#9a6700] dark:text-[#fcd34d]'
  return 'bg-danger-soft text-danger-foreground'
}

export function TopicTugOfWar({
  topics,
}: {
  topics: AnalyticsInsights['topicStrength']
}) {
  const { ref, shown, reduceMotion } = useReveal<HTMLOListElement>()
  const rows = topics.slice(0, 10)
  const widest = Math.max(
    1,
    ...rows.map((topic) => Math.max(topic.solved, topic.failedSubmissions)),
  )
  return (
    <InsightCard
      className="lg:col-span-5"
      description="Solves pull right, failed submissions pull left."
      title="Topic strength"
    >
      {rows.length === 0 ? (
        <EmptyInsight>Not enough tagged activity yet.</EmptyInsight>
      ) : (
        <>
          <p className="mb-2 grid grid-cols-[6.5rem_1fr_1fr_3rem] gap-2 text-[0.68rem] text-muted-foreground">
            <span />
            <span className="text-right">← Failed</span>
            <span>Solved →</span>
            <span className="text-right">Ratio</span>
          </p>
          <ol className="flex flex-col gap-2" ref={ref}>
            {rows.map((topic, index) => {
              const ratio =
                topic.failedSubmissions === 0
                  ? topic.solved
                  : topic.solved / topic.failedSubmissions
              const title = `${titleCase(topic.topic)}: ${topic.solved} solved, ${topic.failedSubmissions} failed submissions${topic.averageRating === undefined ? '' : `, average rating ${Math.round(topic.averageRating)}`}`
              return (
                <li
                  aria-label={title}
                  className="group grid grid-cols-[6.5rem_1fr_1fr_3rem] items-center gap-x-2"
                  key={topic.topic}
                  title={title}
                >
                  <span className="truncate text-xs font-medium">
                    {titleCase(topic.topic)}
                  </span>
                  <span className="flex h-4 justify-end">
                    <motion.span
                      animate={
                        shown
                          ? {
                              width: `${(topic.failedSubmissions / widest) * 100}%`,
                            }
                          : undefined
                      }
                      className="flex items-center justify-start rounded-l-full bg-[#e0484f]/80 pl-1.5 text-[0.6rem] font-semibold text-white transition-colors group-hover:bg-[#e0484f]"
                      initial={reduceMotion ? false : { width: '0%' }}
                      style={{
                        width: reduceMotion
                          ? `${(topic.failedSubmissions / widest) * 100}%`
                          : undefined,
                      }}
                      transition={{ duration: 0.7, ease, delay: index * 0.05 }}
                    >
                      {topic.failedSubmissions >= widest * 0.18
                        ? topic.failedSubmissions
                        : ''}
                    </motion.span>
                  </span>
                  <span className="flex h-4 border-l-2 border-foreground/30">
                    <motion.span
                      animate={
                        shown
                          ? { width: `${(topic.solved / widest) * 100}%` }
                          : undefined
                      }
                      className="flex items-center justify-end rounded-r-full bg-[#1f9d5c]/85 pr-1.5 text-[0.6rem] font-semibold text-white transition-colors group-hover:bg-[#1f9d5c]"
                      initial={reduceMotion ? false : { width: '0%' }}
                      style={{
                        width: reduceMotion
                          ? `${(topic.solved / widest) * 100}%`
                          : undefined,
                      }}
                      transition={{
                        duration: 0.7,
                        ease,
                        delay: 0.15 + index * 0.05,
                      }}
                    >
                      {topic.solved >= widest * 0.18 ? topic.solved : ''}
                    </motion.span>
                  </span>
                  <span
                    className={cn(
                      'justify-self-end rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums',
                      balanceTone(ratio),
                    )}
                  >
                    {ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}×
                  </span>
                </li>
              )
            })}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Ratio is solves per failed submission; below 1× means more misses
            than solves.
          </p>
        </>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Languages: one capsule split by language share, then a row per language.

function languageBadge(name: string) {
  const known: Record<string, string> = {
    'C++': 'C++',
    Python: 'Py',
    Java: 'Jv',
    JavaScript: 'JS',
    TypeScript: 'TS',
    Kotlin: 'Kt',
    Rust: 'Rs',
    Go: 'Go',
    'C#': 'C#',
    C: 'C',
  }
  return known[name] ?? name.slice(0, 2)
}

export function LanguageCapsules({
  languages,
}: {
  languages: Record<string, number>
}) {
  const { ref, shown, reduceMotion } = useReveal<HTMLDivElement>()
  const data = Object.entries(languages)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([name, value], index) => ({
      name,
      value,
      color: palette[(index + 1) % palette.length] ?? '#22c55e',
    }))
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const lead = data[0]
  return (
    <InsightCard
      className="lg:col-span-4"
      description="Accepted solutions by language."
      title="Languages"
    >
      {data.length === 0 || lead === undefined ? (
        <EmptyInsight>No language data yet.</EmptyInsight>
      ) : (
        <div className="flex flex-1 flex-col" ref={ref}>
          <p className="text-sm text-muted-foreground">
            <span className="font-heading text-2xl font-bold text-foreground">
              {lead.name}
            </span>{' '}
            writes {percent(lead.value, total)}% of your accepted code
          </p>
          <div
            aria-hidden="true"
            className="mt-3 flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-muted"
          >
            {data.map((item, index) => (
              <motion.span
                animate={
                  shown
                    ? { width: `${(item.value / total) * 100}%` }
                    : undefined
                }
                className="block h-full first:rounded-l-full last:rounded-r-full"
                initial={reduceMotion ? false : { width: '0%' }}
                key={item.name}
                style={{
                  background: item.color,
                  width: reduceMotion
                    ? `${(item.value / total) * 100}%`
                    : undefined,
                }}
                transition={{ duration: 0.6, ease, delay: index * 0.15 }}
              />
            ))}
          </div>
          <ul className="mt-4 flex flex-col gap-2.5">
            {data.map((item, index) => (
              <motion.li
                animate={shown ? { opacity: 1, x: 0 } : undefined}
                className="flex items-center gap-3"
                initial={reduceMotion ? false : { opacity: 0, x: -10 }}
                key={item.name}
                transition={{ delay: 0.3 + index * 0.08, duration: 0.4 }}
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-xl font-mono text-xs font-bold text-white shadow-sm"
                  style={{ background: item.color }}
                >
                  {languageBadge(item.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="font-semibold tabular-nums">
                      {item.value.toLocaleString()}
                    </span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(item.value / lead.value) * 100}%`,
                        background: item.color,
                      }}
                    />
                  </span>
                </span>
              </motion.li>
            ))}
          </ul>
          <dl className="mt-auto grid grid-cols-2 gap-2 pt-4">
            {[
              ['Languages', data.length.toLocaleString()],
              ['Accepted', total.toLocaleString()],
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
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Hardest solves: a podium for the top three, the rest listed below.

const podiumOrder = [1, 0, 2] as const
const podiumMedals = ['#f2b84b', '#a3adbb', '#c7834f'] as const

export function SummitPodium({
  problems,
}: {
  problems: AnalyticsInsights['hardestSolved']
}) {
  const { ref, shown, reduceMotion } = useReveal<HTMLDivElement>()
  const podium = problems.slice(0, 3)
  const others = problems.slice(3)
  const highest = Math.max(1, ...podium.map((problem) => problem.rating))
  const lowest = Math.min(...podium.map((problem) => problem.rating))
  return (
    <InsightCard
      className="lg:col-span-6"
      description="Your highest-rated accepted problems."
      title="Hardest solves"
    >
      {problems.length === 0 ? (
        <EmptyInsight>No rated solves yet.</EmptyInsight>
      ) : (
        <div className="flex flex-1 flex-col gap-4" ref={ref}>
          <ol className="grid grid-cols-3 items-end gap-2 sm:gap-3">
            {podiumOrder.map((rank) => {
              const problem = podium[rank]
              if (problem === undefined) return <li key={rank} />
              const spread = highest - lowest
              const height =
                spread === 0
                  ? 100 - rank * 18
                  : 55 + ((problem.rating - lowest) / spread) * 45
              return (
                <li
                  className="flex min-w-0 flex-col items-center gap-1.5 text-center"
                  key={`${problem.provider}:${problem.externalId}`}
                >
                  <ProviderLogo
                    className="size-5"
                    provider={problem.provider}
                  />
                  <p
                    className="line-clamp-2 min-h-8 text-xs leading-4 font-medium"
                    title={problem.title}
                  >
                    {problem.title}
                  </p>
                  <div className="flex h-32 w-full items-end">
                    <motion.div
                      animate={shown ? { height: `${height}%` } : undefined}
                      className="relative flex w-full flex-col items-center justify-start overflow-hidden rounded-t-xl pt-2 text-white"
                      initial={reduceMotion ? false : { height: '0%' }}
                      style={{
                        background: `linear-gradient(to bottom, ${ratingColor(problem.rating)}, color-mix(in oklab, ${ratingColor(problem.rating)} 55%, #0f172a))`,
                        height: reduceMotion ? `${height}%` : undefined,
                      }}
                      transition={{
                        type: 'spring',
                        stiffness: 80,
                        damping: 14,
                        delay: 0.15 + (2 - rank) * 0.15,
                      }}
                    >
                      <span
                        className="grid size-6 place-items-center rounded-full text-[0.7rem] font-bold text-[#1f2937]"
                        style={{ background: podiumMedals[rank] }}
                      >
                        {rank + 1}
                      </span>
                      <span className="mt-1 font-heading text-lg font-bold tabular-nums">
                        {Math.round(problem.rating)}
                      </span>
                    </motion.div>
                  </div>
                </li>
              )
            })}
          </ol>
          {others.length > 0 ? (
            <ol className="flex flex-col gap-1.5" start={4}>
              {others.map((problem, index) => (
                <li
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-1.5"
                  key={`${problem.provider}:${problem.externalId}`}
                >
                  <span className="w-4 text-center font-heading text-xs font-bold text-muted-foreground">
                    {index + 4}
                  </span>
                  <ProviderLogo
                    className="size-4"
                    provider={problem.provider}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-medium"
                    title={problem.title}
                  >
                    {problem.title}
                  </span>
                  <span
                    className="rounded-md px-2 py-0.5 text-xs font-bold text-white tabular-nums"
                    style={{ background: ratingColor(problem.rating) }}
                  >
                    {Math.round(problem.rating)}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Weekly rhythm: a punch card of submissions by weekday and hour.

const weekdays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`
}

// Punch-card dates are local calendar days (YYYY-MM-DD).
const punchDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatPunchDate(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  if (year === undefined || month === undefined || date === undefined)
    return day
  return punchDate.format(new Date(Date.UTC(year, month - 1, date)))
}

export function WeeklyRhythm({
  punchCard,
  punchCardDates,
  timezone,
}: {
  punchCard: AnalyticsInsights['punchCard']
  punchCardDates?: AnalyticsInsights['punchCardDates']
  timezone?: string
}) {
  const { ref, shown } = useReveal<HTMLDivElement>()
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [tip, setTip] = useState<CellTip | null>(null)
  const busiest = Math.max(0, ...punchCard.flat())
  const dayTotals = punchCard.map((row) =>
    row.reduce((sum, value) => sum + value, 0),
  )
  const hourTotals = Array.from({ length: 24 }, (_, hour) =>
    punchCard.reduce((sum, row) => sum + (row[hour] ?? 0), 0),
  )
  const total = dayTotals.reduce((sum, value) => sum + value, 0)
  const peakDay = dayTotals.indexOf(Math.max(...dayTotals))
  const peakHour = hourTotals.indexOf(Math.max(...hourTotals))
  const nightShare = percent(
    [22, 23, 0, 1, 2, 3].reduce(
      (sum, hour) => sum + (hourTotals[hour] ?? 0),
      0,
    ),
    total,
  )
  const weekendShare = percent((dayTotals[5] ?? 0) + (dayTotals[6] ?? 0), total)
  return (
    <InsightCard
      action={
        <InfoTip align="end" label="Explain the Weekly rhythm chart">
          <span className="block font-semibold">How to read this chart</span>
          <span className="mt-1 block">
            Each row is a weekday and each column is an hour. A circle counts
            submissions in that day and hour across your dated activity, not
            just one week. Times use {timezone ?? 'your local timezone'}.
          </span>
          <span className="mt-3 block font-semibold">Legend</span>
          <span className="mt-1 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-muted-foreground/30"
            />
            Gray dot: no submissions
          </span>
          <span className="mt-1 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full bg-[#5987f5]"
            />
            Blue circle: some submissions
          </span>
          <span className="mt-1 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-5 shrink-0 rounded-full bg-[#8b5cf6]"
            />
            Larger, more purple circle: more submissions
          </span>
          <span className="mt-2 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-4 w-3 shrink-0 rounded-sm bg-[#8b5cf6]"
            />
            Bars: totals for each hour across all days; purple marks the peak
            hour
          </span>
          <span className="mt-2 block text-muted-foreground">
            Late night means 22:00–03:59; weekends means Saturday and Sunday.
            Both percentages are shares of all dated submissions. Hover a circle
            or bar for its exact count.
          </span>
        </InfoTip>
      }
      className="lg:col-span-8"
      description={`Submissions by weekday and hour${timezone ? ` (${timezone})` : ''}.`}
      title="Weekly rhythm"
    >
      {total === 0 ? (
        <EmptyInsight>No dated submissions yet.</EmptyInsight>
      ) : (
        <div className="flex flex-1 flex-col" ref={ref}>
          <div className="flex flex-wrap gap-1.5">
            <Chip label="Busiest day">{weekdays[peakDay]}</Chip>
            <Chip label="Peak hour">{hourLabel(peakHour)}</Chip>
            <Chip label="Late night">{nightShare}%</Chip>
            <Chip label="Weekends">{weekendShare}%</Chip>
          </div>
          <div className="relative mt-4" ref={wrapperRef}>
            <CellTooltip tip={tip} />
            <div
              className="overflow-x-auto pb-1"
              onMouseLeave={() => setTip(null)}
              onScroll={() => setTip(null)}
            >
              <div className="grid min-w-[36rem] grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-y-1">
                {punchCard.map((row, day) => (
                  <div className="contents" key={weekdays[day]}>
                    <span className="self-center text-[0.65rem] text-muted-foreground">
                      {weekdays[day]?.slice(0, 3)}
                    </span>
                    {row.map((value, hour) => {
                      const scale =
                        value === 0 || busiest === 0
                          ? 0.18
                          : 0.3 + 0.7 * Math.sqrt(value / busiest)
                      return (
                        <span
                          className="grid h-6 place-items-center sm:h-7"
                          key={hour}
                          onMouseEnter={(event) => {
                            const dates = punchCardDates?.[day]?.[hour]
                            setTip(
                              cellTipFrom(
                                event.currentTarget,
                                wrapperRef.current,
                                `${value} ${value === 1 ? 'submission' : 'submissions'}`,
                                `${weekdays[day]}, ${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`,
                                dates === null || dates === undefined
                                  ? []
                                  : dates.latest === dates.busiest
                                    ? [
                                        `Last on ${formatPunchDate(dates.latest)}`,
                                      ]
                                    : [
                                        `Last on ${formatPunchDate(dates.latest)}`,
                                        `Busiest ${formatPunchDate(dates.busiest)} (${dates.busiestCount})`,
                                      ],
                              ),
                            )
                          }}
                        >
                          <motion.span
                            animate={shown ? { scale } : { scale: 0 }}
                            className="block size-5 rounded-full sm:size-6"
                            initial={false}
                            style={{
                              background:
                                value === 0
                                  ? 'color-mix(in oklab, var(--muted-foreground) 30%, transparent)'
                                  : `color-mix(in oklab, #8b5cf6 ${Math.round(35 + 65 * (value / Math.max(1, busiest)))}%, #0ea5e9)`,
                            }}
                            transition={{
                              type: 'spring',
                              stiffness: 260,
                              damping: 18,
                              delay: (day + hour) * 0.018,
                            }}
                          />
                        </span>
                      )
                    })}
                  </div>
                ))}
                <span className="self-end pb-0.5 text-[0.6rem] leading-3 text-muted-foreground">
                  All days
                </span>
                {hourTotals.map((value, hour) => (
                  <span
                    className="flex h-14 items-end px-[3px] pt-4"
                    key={hour}
                    onMouseEnter={(event) =>
                      setTip(
                        cellTipFrom(
                          event.currentTarget,
                          wrapperRef.current,
                          `${value} ${value === 1 ? 'submission' : 'submissions'}`,
                          `${hourLabel(hour)}, all days`,
                        ),
                      )
                    }
                  >
                    <motion.span
                      animate={{
                        height: shown
                          ? `${Math.max(6, (value / Math.max(1, ...hourTotals)) * 100)}%`
                          : '6%',
                      }}
                      className={cn(
                        'block w-full rounded-sm',
                        hour === peakHour ? 'bg-[#8b5cf6]' : 'bg-[#8b5cf6]/35',
                      )}
                      initial={false}
                      transition={{
                        duration: 0.6,
                        ease,
                        delay: 0.5 + hour * 0.02,
                      }}
                    />
                  </span>
                ))}
                <span />
                {Array.from({ length: 24 }, (_, hour) => (
                  <span
                    className="mt-1 text-center text-[0.6rem] text-muted-foreground tabular-nums"
                    key={hour}
                  >
                    {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </InsightCard>
  )
}

// ---------------------------------------------------------------------------
// Contest pulse: each rated contest as a bar up or down from the zero line,
// oldest to newest.

export function ContestPulse({
  deltas,
  className,
}: {
  deltas: ReadonlyArray<{ key: string; delta: number; label: string }>
  className?: string
}) {
  const { ref, shown, reduceMotion } = useReveal<HTMLDivElement>()
  const largest = Math.max(1, ...deltas.map((item) => Math.abs(item.delta)))
  if (deltas.length === 0) return null
  return (
    <div
      aria-label={`${deltas.length} rated contests: ${deltas.filter((item) => item.delta > 0).length} gains, ${deltas.filter((item) => item.delta < 0).length} drops`}
      className={cn('relative flex h-36 items-center gap-[3px]', className)}
      ref={ref}
      role="img"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 border-t border-dashed border-border"
      />
      {deltas.map((item, index) => {
        const height = `${(Math.abs(item.delta) / largest) * 100}%`
        const bar = (
          <motion.span
            animate={shown ? { height } : undefined}
            className={cn(
              'block w-full',
              item.delta > 0
                ? 'rounded-t-sm bg-go'
                : 'rounded-b-sm bg-destructive/80',
            )}
            initial={reduceMotion ? false : { height: '0%' }}
            style={{ height: reduceMotion ? height : undefined }}
            transition={{ duration: 0.5, ease, delay: index * 0.04 }}
          />
        )
        return (
          <span
            className="relative flex h-full min-w-0 flex-1 flex-col"
            key={item.key}
            title={`${item.label}: ${item.delta >= 0 ? '+' : ''}${Math.round(item.delta)}`}
          >
            <span className="flex flex-1 items-end">
              {item.delta > 0 ? bar : null}
            </span>
            <span className="flex flex-1 items-start">
              {item.delta < 0 ? bar : null}
            </span>
          </span>
        )
      })}
    </div>
  )
}
