import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { RecommendationBatch } from '@algomemtor/shared-contracts'

import {
  BarChart3,
  Brain,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserRound,
  type IconComponent,
} from '@/components/icons/algo-icons'
import { cn } from '@/lib/utils'

const ease = [0.16, 1, 0.3, 1] as const

const stations: readonly {
  label: string
  detail: string
  icon: IconComponent
  color: string
}[] = [
  {
    label: 'Profile',
    detail: 'Goals, level and focus',
    icon: UserRound,
    color: '#0ea5e9',
  },
  {
    label: 'Provider',
    detail: 'Live problem metadata',
    icon: BarChart3,
    color: '#6366f1',
  },
  {
    label: 'Filters',
    detail: 'Rating, topics, history',
    icon: SlidersHorizontal,
    color: '#8b5cf6',
  },
  {
    label: 'Ranking',
    detail: 'Scored and explained',
    icon: Brain,
    color: '#d946ef',
  },
  {
    label: 'Your ten',
    detail: 'Refreshed daily',
    icon: Target,
    color: '#22c55e',
  },
]

const difficultyColors = {
  easy: '#22c55e',
  medium: '#f59e0b',
  hard: '#ef4444',
} as const

type Summary = {
  counts: Record<keyof typeof difficultyColors, number>
  topics: [string, number][]
  averageRating: number | undefined
}

function summarize(feed: RecommendationBatch): Summary {
  const counts = { easy: 0, medium: 0, hard: 0 }
  const topics = new Map<string, number>()
  const ratings: number[] = []
  for (const item of feed.items) {
    const difficulty = item.problem.normalizedDifficulty
    if (difficulty) counts[difficulty] += 1
    for (const topic of item.problem.topics) {
      topics.set(topic, (topics.get(topic) ?? 0) + 1)
    }
    if (typeof item.problem.providerDifficulty === 'number') {
      ratings.push(item.problem.providerDifficulty)
    }
  }
  return {
    counts,
    topics: [...topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
    averageRating:
      ratings.length === 0
        ? undefined
        : Math.round(
            ratings.reduce((sum, value) => sum + value, 0) / ratings.length,
          ),
  }
}

// The difficulty mix as a ring of three arcs that draw themselves.
function DifficultyRing({
  counts,
  total,
}: {
  counts: Summary['counts']
  total: number
}) {
  const reduceMotion = useReducedMotion()
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const keys = ['easy', 'medium', 'hard'] as const
  const sum = Math.max(
    1,
    keys.reduce((value, key) => value + counts[key], 0),
  )
  const starts = keys.map((_, index) =>
    keys.slice(0, index).reduce((value, key) => value + counts[key] / sum, 0),
  )
  return (
    <div className="relative grid size-24 shrink-0 place-items-center">
      <svg
        aria-hidden="true"
        className="absolute inset-0 -rotate-90"
        viewBox="0 0 80 80"
      >
        <circle
          cx="40"
          cy="40"
          fill="none"
          r={radius}
          stroke="color-mix(in oklab, var(--muted-foreground) 18%, transparent)"
          strokeWidth="7"
        />
        {keys.map((key, index) => {
          const share = counts[key] / sum
          if (share === 0) return null
          const gap = share === 1 ? 0 : 0.012
          return (
            <motion.circle
              animate={{
                strokeDasharray: `${Math.max(0, share - gap) * circumference} ${circumference}`,
              }}
              cx="40"
              cy="40"
              fill="none"
              initial={
                reduceMotion ? false : { strokeDasharray: `0 ${circumference}` }
              }
              key={key}
              r={radius}
              stroke={difficultyColors[key]}
              strokeDashoffset={-(starts[index] ?? 0) * circumference}
              strokeLinecap="round"
              strokeWidth="7"
              transition={{ duration: 0.9, ease, delay: 0.2 + index * 0.15 }}
            />
          )
        })}
      </svg>
      <span className="text-center">
        <span className="block font-heading text-2xl leading-none font-bold text-foreground tabular-nums">
          {total}
        </span>
        <span className="text-[0.65rem] text-muted-foreground">picks</span>
      </span>
    </div>
  )
}

// How today's picks were made, drawn as a live pipeline, with the batch it
// produced in an output window underneath.
export function PickEngineCard({
  feed,
  refreshing,
}: {
  feed: RecommendationBatch | null | undefined
  refreshing: boolean
}) {
  const reduceMotion = useReducedMotion()
  const [pulse, setPulse] = useState(stations.length - 1)
  useEffect(() => {
    if (reduceMotion) return
    const timer = window.setInterval(
      () => setPulse((value) => (value + 1) % stations.length),
      refreshing ? 550 : 1800,
    )
    return () => window.clearInterval(timer)
  }, [reduceMotion, refreshing])
  const active = reduceMotion ? stations.length - 1 : pulse
  const current = stations[active] ?? stations[0]
  const summary = feed ? summarize(feed) : null
  const topMax = Math.max(1, ...(summary?.topics.map(([, n]) => n) ?? [1]))
  const generated = feed
    ? new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(feed.generatedAt))
    : null

  return (
    <section
      aria-label="How today's picks were made"
      className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full blur-3xl transition-colors duration-700"
        style={{
          background: `radial-gradient(closest-side, color-mix(in oklab, ${current?.color ?? '#0ea5e9'} 26%, transparent), transparent)`,
        }}
      />
      <div className="relative flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Pick engine</p>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[0.68rem] font-medium',
            refreshing ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 rounded-full',
              refreshing ? 'animate-pulse bg-[#f59e0b]' : 'bg-[#22c55e]',
            )}
          />
          {refreshing ? 'Re-ranking' : 'Up to date'}
        </span>
      </div>

      <ol aria-label="Pipeline" className="relative mt-5 grid grid-cols-5">
        <span
          aria-hidden="true"
          className="absolute top-5 right-[10%] left-[10%] h-0.5 rounded-full bg-border"
        />
        <motion.span
          animate={{ scaleX: active / (stations.length - 1) }}
          aria-hidden="true"
          className="absolute top-5 right-[10%] left-[10%] h-0.5 origin-left rounded-full bg-linear-to-r from-[#0ea5e9] via-[#8b5cf6] to-[#22c55e]"
          transition={{ duration: refreshing ? 0.4 : 0.8, ease }}
        />
        {stations.map((station, index) => {
          const on = index <= active
          const Icon = station.icon
          return (
            <li
              className="relative flex min-w-0 flex-col items-center gap-1.5"
              key={station.label}
              title={station.detail}
            >
              <motion.span
                animate={{
                  scale: index === active ? 1.12 : 1,
                  backgroundColor: on ? station.color : 'var(--card)',
                }}
                className="grid size-10 place-items-center rounded-full border-2"
                style={{ borderColor: station.color }}
                transition={{ type: 'spring', stiffness: 380, damping: 20 }}
              >
                <Icon
                  aria-hidden="true"
                  className="size-4"
                  style={{ color: on ? '#fff' : station.color }}
                />
              </motion.span>
              <span
                className={cn(
                  'w-full truncate text-center text-[0.7rem] font-medium transition-colors',
                  index === active
                    ? 'text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {station.label}
              </span>
            </li>
          )
        })}
      </ol>

      <div className="relative mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-secondary/40">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2">
          <span aria-hidden="true" className="flex gap-1">
            <span className="size-2 rounded-full bg-[#ef4444]" />
            <span className="size-2 rounded-full bg-[#f59e0b]" />
            <span className="size-2 rounded-full bg-[#22c55e]" />
          </span>
          <AnimatePresence mode="wait">
            <motion.span
              animate={{ opacity: 1, y: 0 }}
              className="truncate font-mono text-[0.68rem] font-semibold"
              exit={{ opacity: 0, y: -6 }}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              key={current?.label}
              style={{ color: current?.color }}
            >
              {current?.detail}
            </motion.span>
          </AnimatePresence>
        </div>
        {summary !== null && feed ? (
          <div className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex items-center gap-4">
              <DifficultyRing
                counts={summary.counts}
                total={feed.items.length}
              />
              <dl className="grid gap-1 text-xs">
                {(['easy', 'medium', 'hard'] as const).map((key) => (
                  <div className="flex items-center gap-2" key={key}>
                    <dt className="flex items-center gap-1.5 text-muted-foreground capitalize">
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full"
                        style={{ background: difficultyColors[key] }}
                      />
                      {key}
                    </dt>
                    <dd className="font-mono font-semibold text-foreground">
                      {summary.counts[key]}
                    </dd>
                  </div>
                ))}
                {summary.averageRating !== undefined ? (
                  <div className="mt-1 flex items-center gap-2">
                    <dt className="text-muted-foreground">Avg rating</dt>
                    <dd className="font-mono font-semibold text-foreground">
                      {summary.averageRating}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <div className="min-w-0">
              <p className="text-[0.68rem] font-medium text-muted-foreground">
                Topics in play
              </p>
              <ul className="mt-2 grid gap-1.5">
                {summary.topics.map(([topic, count], index) => (
                  <li
                    className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_1.25rem] items-center gap-2 text-xs"
                    key={topic}
                  >
                    <span className="truncate text-foreground">{topic}</span>
                    <span className="h-1.5 overflow-hidden bg-[color-mix(in_oklab,var(--muted-foreground)_18%,transparent)]">
                      <motion.span
                        animate={{ width: `${(count / topMax) * 100}%` }}
                        className="block h-full bg-[#0ea5e9]"
                        initial={reduceMotion ? false : { width: '0%' }}
                        transition={{
                          duration: 0.7,
                          ease,
                          delay: 0.3 + index * 0.08,
                        }}
                      />
                    </span>
                    <span className="text-right font-mono text-muted-foreground">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div aria-hidden="true" className="grid gap-2 p-4">
            {[70, 45, 82, 55].map((width, index) => (
              <motion.span
                animate={{ opacity: [0.35, 0.8, 0.35] }}
                className="h-2 rounded-full bg-[color-mix(in_oklab,var(--muted-foreground)_30%,transparent)]"
                key={width}
                style={{ width: `${width}%` }}
                transition={{
                  duration: 1.4,
                  repeat: reduceMotion ? 0 : Infinity,
                  delay: index * 0.15,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {feed ? (
        <p className="relative mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          {feed.rankingMode === 'ai' ? (
            <Sparkles aria-hidden="true" className="size-3.5" />
          ) : (
            <Brain aria-hidden="true" className="size-3.5" />
          )}
          {feed.rankingMode === 'ai' ? 'AI-ranked' : 'Rule-ranked'} ·{' '}
          {generated}
        </p>
      ) : null}
    </section>
  )
}
