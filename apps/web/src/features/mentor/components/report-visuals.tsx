import { useState } from 'react'
import type { ProgressReport } from '@algomemtor/shared-contracts'
import { motion, useReducedMotion } from 'motion/react'

import { Sparkline } from '@/components/kit/charts'
import { cn } from '@/lib/utils'

const ease = [0.16, 1, 0.3, 1] as const

const weekLabel = (value: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(new Date(`${value}T00:00:00`))
  } catch {
    return value
  }
}

const accuracyBands = [
  { label: '70% and up', min: 0.7, color: '#22c55e' },
  { label: '50–69%', min: 0.5, color: '#0ea5e9' },
  { label: 'Below 50%', min: 0, color: '#f59e0b' },
] as const

const accuracyColor = (rate: number) =>
  accuracyBands.find((band) => rate >= band.min)?.color ?? '#f59e0b'

// Weekly first-try accuracy as liquid tubes: each fills to its share in the
// colour of its band, with a wave rolling on the surface. Hovering a week
// reads it out above; the average runs across as a dashed line.
export function AccuracyTubes({
  weeks,
}: {
  weeks: ProgressReport['accuracy']
}) {
  const reduceMotion = useReducedMotion()
  const [hovered, setHovered] = useState<number | null>(null)
  const rated = weeks.flatMap((week) => (week.rate === null ? [] : [week.rate]))
  const average =
    rated.length === 0
      ? null
      : rated.reduce((sum, rate) => sum + rate, 0) / rated.length
  const best = rated.length === 0 ? null : Math.max(...rated)
  // Consecutive latest weeks at 70% or more, skipping weeks with no data.
  const streak = (() => {
    let count = 0
    for (const rate of [...rated].reverse()) {
      if (rate < 0.7) break
      count += 1
    }
    return count
  })()
  const latestIndex = weeks.findLastIndex((week) => week.rate !== null)
  const focusIndex = hovered ?? latestIndex
  const focus = weeks[focusIndex]
  const previous = weeks
    .slice(0, Math.max(0, focusIndex))
    .findLast((week) => week.rate !== null)
  const change =
    focus?.rate != null && previous?.rate != null
      ? Math.round((focus.rate - previous.rate) * 100)
      : null
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div aria-live="polite">
          <p className="text-xs text-muted-foreground">
            {hovered === null ? 'Latest week' : 'Week of'}{' '}
            {focus ? weekLabel(focus.weekStart) : ''}
          </p>
          <p className="flex items-baseline gap-2">
            <span className="font-heading text-3xl font-bold text-foreground tabular-nums">
              {focus?.rate == null ? '–' : `${Math.round(focus.rate * 100)}%`}
            </span>
            {change !== null ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  change >= 0
                    ? 'bg-go-soft text-go-foreground'
                    : 'bg-danger-soft text-danger-foreground',
                )}
              >
                {change > 0 ? '+' : ''}
                {change} pts
              </span>
            ) : null}
            {focus && focus.rate !== null ? (
              <span className="text-xs text-muted-foreground">
                {focus.firstTryAccepted} of {focus.attempted} first try
              </span>
            ) : null}
          </p>
        </div>
        <dl className="flex gap-2">
          {[
            [
              'Average',
              average === null ? '–' : `${Math.round(average * 100)}%`,
            ],
            ['Best', best === null ? '–' : `${Math.round(best * 100)}%`],
            ['70%+ run', `${streak} wk`],
          ].map(([label, value]) => (
            <div
              className="rounded-xl border border-border bg-background/60 px-2.5 py-1.5 text-center"
              key={label}
            >
              <dt className="text-[0.62rem] text-muted-foreground">{label}</dt>
              <dd className="font-mono text-sm font-semibold text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div
        className="relative flex min-h-44 flex-1 items-stretch gap-1.5 sm:gap-2"
        onMouseLeave={() => setHovered(null)}
      >
        {average !== null ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-foreground/35"
            style={{ bottom: `${average * 100}%` }}
          >
            <span className="absolute -top-5 left-0 rounded bg-card px-1 font-mono text-[0.65rem] text-muted-foreground">
              avg {Math.round(average * 100)}%
            </span>
          </span>
        ) : null}
        {weeks.map((week, index) => {
          const color = week.rate === null ? null : accuracyColor(week.rate)
          const active = index === focusIndex
          return (
            <span
              className="relative flex min-w-0 flex-1 cursor-default items-end justify-center"
              key={week.weekStart}
              onMouseEnter={() => setHovered(index)}
              title={
                week.rate === null
                  ? `${weekLabel(week.weekStart)}: no new problems`
                  : `${weekLabel(week.weekStart)}: ${week.firstTryAccepted} of ${week.attempted} first try`
              }
            >
              <span
                className={cn(
                  'relative flex h-full w-full max-w-9 items-end overflow-hidden rounded-full bg-muted/70 shadow-[inset_0_1px_3px_rgb(0_0_0/0.08)] transition-[box-shadow,transform] duration-300',
                  active &&
                    'shadow-[0_0_0_2px_var(--foreground),inset_0_1px_3px_rgb(0_0_0/0.08)]',
                  week.rate === null &&
                    'bg-[repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_oklab,var(--muted-foreground)_14%,transparent)_5px_6px)]',
                )}
              >
                {color !== null && week.rate !== null ? (
                  <>
                    <motion.span
                      animate={{ height: `${week.rate * 100}%` }}
                      className="relative w-full"
                      initial={reduceMotion ? false : { height: '0%' }}
                      style={{
                        background: `linear-gradient(180deg, color-mix(in oklab, ${color} 70%, #fff), ${color})`,
                      }}
                      transition={{ duration: 1, ease, delay: index * 0.06 }}
                    />
                    <motion.span
                      animate={{ bottom: `${week.rate * 100}%` }}
                      aria-hidden="true"
                      className="absolute inset-x-0 h-2 overflow-hidden"
                      initial={reduceMotion ? false : { bottom: '0%' }}
                      transition={{ duration: 1, ease, delay: index * 0.06 }}
                    >
                      <motion.svg
                        animate={reduceMotion ? {} : { x: ['0%', '-50%'] }}
                        className="absolute bottom-0 h-2 w-[200%]"
                        preserveAspectRatio="none"
                        transition={{
                          duration: 2.4 + (index % 3) * 0.4,
                          repeat: Infinity,
                          ease: 'linear',
                        }}
                        viewBox="0 0 40 8"
                      >
                        <path
                          d="M0 5 Q5 1 10 5 T20 5 T30 5 T40 5 V8 H0 Z"
                          fill={`color-mix(in oklab, ${color} 70%, #fff)`}
                        />
                      </motion.svg>
                    </motion.span>
                  </>
                ) : null}
              </span>
            </span>
          )
        })}
      </div>
      <div
        aria-label={weeks
          .map(
            (week) =>
              `${weekLabel(week.weekStart)}: ${week.rate === null ? 'no new problems' : `${Math.round(week.rate * 100)}%`}`,
          )
          .join('; ')}
        className="mt-1.5 flex gap-1.5 sm:gap-2"
        role="img"
      >
        {weeks.map((week, index) => (
          <span
            className={cn(
              'min-w-0 flex-1 text-center font-mono text-[0.6rem]',
              index === focusIndex
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground',
            )}
            key={week.weekStart}
          >
            {week.rate === null ? '–' : Math.round(week.rate * 100)}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {accuracyBands.map((band) => (
            <li className="inline-flex items-center gap-1.5" key={band.label}>
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ background: band.color }}
              />
              {band.label}
            </li>
          ))}
        </ul>
        <span className="text-[0.68rem] text-muted-foreground">
          {weeks[0] ? weekLabel(weeks[0].weekStart) : ''} –{' '}
          {weeks.at(-1) ? weekLabel(weeks.at(-1)?.weekStart ?? '') : ''}
        </span>
      </div>
    </div>
  )
}

// Each week as a column of seven dots, one per day, lit for active days,
// with the problems solved that week on top.
export function WeekDots({
  weeks,
}: {
  weeks: ProgressReport['consistency']['weekly']
}) {
  const reduceMotion = useReducedMotion()
  const best = Math.max(0, ...weeks.map((week) => week.solved))
  return (
    <div className="flex flex-1 flex-col">
      <ol
        aria-label={weeks
          .map(
            (week) =>
              `${weekLabel(week.weekStart)}: ${week.solved} solved on ${week.activeDays} days`,
          )
          .join('; ')}
        className="flex flex-1 items-end justify-between gap-1"
      >
        {weeks.map((week, column) => (
          <li
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            key={week.weekStart}
            title={`${weekLabel(week.weekStart)}: ${week.solved} solved, ${week.activeDays} active days`}
          >
            <span
              className={cn(
                'font-mono text-[0.65rem] font-semibold',
                week.solved === best && best > 0
                  ? 'text-go-foreground'
                  : 'text-foreground',
              )}
            >
              {week.solved}
            </span>
            <span className="flex flex-col-reverse gap-1.5">
              {Array.from({ length: 7 }, (_, day) => {
                const lit = day < week.activeDays
                return (
                  <motion.span
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                      'size-3 rounded-full sm:size-4',
                      lit ? '' : 'bg-muted',
                    )}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0 }}
                    key={day}
                    style={
                      lit
                        ? {
                            background: `color-mix(in oklab, #22c55e ${55 + day * 6}%, #0ea5e9)`,
                          }
                        : undefined
                    }
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 20,
                      delay: column * 0.05 + day * 0.03,
                    }}
                  />
                )
              })}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex justify-between text-[0.68rem] text-muted-foreground">
        <span>{weeks[0] ? weekLabel(weeks[0].weekStart) : ''}</span>
        <span>dot = active day · number = solved</span>
        <span>
          {weeks.at(-1) ? weekLabel(weeks.at(-1)?.weekStart ?? '') : ''}
        </span>
      </div>
    </div>
  )
}

// Earlier against recent median minutes per difficulty band: two dots on a
// line, with the gap reading as faster or slower.
export function SpeedDumbbells({
  rows,
}: {
  rows: ProgressReport['solvingSpeed']
}) {
  const reduceMotion = useReducedMotion()
  const max = Math.max(
    10,
    ...rows.flatMap((row) => [
      row.earlierMedianMinutes ?? 0,
      row.recentMedianMinutes ?? 0,
    ]),
  )
  const scale = Math.ceil(max / 10) * 10
  const at = (value: number) => `${(value / scale) * 100}%`
  const ticks = [0, scale / 2, scale]
  return (
    <div className="flex flex-1 flex-col justify-center">
      <ol aria-label="Solving speed by difficulty" className="grid gap-5">
        {rows.map((row, index) => {
          const earlier = row.earlierMedianMinutes
          const recent = row.recentMedianMinutes
          const faster =
            earlier !== null && recent !== null ? recent < earlier : null
          const change =
            earlier !== null && recent !== null && earlier > 0
              ? Math.round(((earlier - recent) / earlier) * 100)
              : null
          // The server splits each band's solves by date: the older half is
          // "earlier", the newer half (the larger one when odd) is "recent".
          const earlierCount = row.samples < 2 ? 0 : Math.floor(row.samples / 2)
          const recentCount = row.samples - earlierCount
          const low = Math.min(earlier ?? recent ?? 0, recent ?? earlier ?? 0)
          const high = Math.max(earlier ?? recent ?? 0, recent ?? earlier ?? 0)
          return (
            <li className="grid gap-1.5" key={row.band}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-foreground">
                    {row.band}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {row.samples} solved problem{row.samples === 1 ? '' : 's'}
                  </span>
                </span>
                {change !== null ? (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-semibold',
                      faster
                        ? 'bg-go-soft text-go-foreground'
                        : 'bg-danger-soft text-danger-foreground',
                    )}
                  >
                    {faster
                      ? `${change}% faster`
                      : `${Math.abs(change)}% slower`}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Needs 2+ solves to compare
                  </span>
                )}
              </div>
              <span className="relative h-6 rounded-full bg-muted/50">
                <motion.span
                  animate={{
                    left: at(low),
                    width: `${((high - low) / scale) * 100}%`,
                  }}
                  className={cn(
                    'absolute inset-y-2.5 rounded-full',
                    faster ? 'bg-[#22c55e]/45' : 'bg-[#ef4444]/40',
                  )}
                  initial={
                    reduceMotion ? false : { left: at(high), width: '0%' }
                  }
                  transition={{ duration: 0.8, ease, delay: 0.3 + index * 0.1 }}
                />
                {earlier !== null ? (
                  <span
                    className="absolute top-1/2 -mt-2 -ml-2 size-4 rounded-full border-2 border-card bg-muted-foreground/70"
                    style={{ left: at(earlier) }}
                    title={`Earlier: ${Math.round(earlier)} min`}
                  />
                ) : null}
                {recent !== null ? (
                  <motion.span
                    animate={{ left: at(recent) }}
                    className={cn(
                      'absolute top-1/2 -mt-2.5 -ml-2.5 size-5 rounded-full border-2 border-card shadow-soft',
                      faster === false ? 'bg-[#ef4444]' : 'bg-[#0ea5e9]',
                    )}
                    initial={
                      reduceMotion ? false : { left: at(earlier ?? recent) }
                    }
                    title={`Recent: ${Math.round(recent)} min`}
                    transition={{
                      duration: 0.8,
                      ease,
                      delay: 0.3 + index * 0.1,
                    }}
                  />
                ) : null}
              </span>
              <p className="flex justify-between gap-2 text-[0.7rem] text-muted-foreground">
                <span>
                  Earlier half:{' '}
                  <span className="font-mono text-foreground/80">
                    {earlier === null ? '–' : `${Math.round(earlier)} min`}
                  </span>
                  {earlierCount > 0
                    ? ` (${earlierCount} solve${earlierCount === 1 ? '' : 's'})`
                    : ''}
                </span>
                <span className="text-right">
                  Recent half:{' '}
                  <span className="font-mono text-foreground/80">
                    {recent === null ? '–' : `${Math.round(recent)} min`}
                  </span>
                  {recentCount > 0
                    ? ` (${recentCount} solve${recentCount === 1 ? '' : 's'})`
                    : ''}
                </span>
              </p>
            </li>
          )
        })}
      </ol>
      <div
        aria-hidden="true"
        className="relative mt-3 h-4 border-t border-dashed border-border font-mono text-[0.65rem] text-muted-foreground"
      >
        {ticks.map((tick, index) => (
          <span
            className={cn(
              'absolute top-1',
              index === 0
                ? 'left-0'
                : index === ticks.length - 1
                  ? 'right-0'
                  : '-translate-x-1/2',
            )}
            key={tick}
            style={
              index === 0 || index === ticks.length - 1
                ? undefined
                : { left: at(tick) }
            }
          >
            {Math.round(tick)} min
          </span>
        ))}
      </div>
      <p className="mt-1 text-[0.68rem] text-muted-foreground">
        ← faster · slower →
      </p>
      <ul className="mt-3 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-full bg-muted-foreground/70" />
          Earlier half: median of your older solves
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-full bg-[#0ea5e9]" />
          Recent half: as fast or faster
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-full bg-[#ef4444]" />
          Recent half: slower than before
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="h-1 w-4 shrink-0 rounded-full bg-[#22c55e]/60" />
          Line: the change (green faster, red slower)
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Unrated covers contest problems with no difficulty rating on record.
        Rows with few solves can swing a lot.
      </p>
    </div>
  )
}

const hintSteps = ['Nudge', 'Direction', 'Approach', 'Outline', 'Solution']

// The five hint levels as a ladder, with a marker sliding to your average
// and the weekly trend underneath.
export function HintLadder({
  hints,
}: {
  hints: ProgressReport['hintDependency']
}) {
  const reduceMotion = useReducedMotion()
  const level = hints.averageHintLevel
  const trend = hints.weekly.flatMap((week) =>
    week.averageHintLevel === null ? [] : [week.averageHintLevel],
  )
  return (
    <div className="flex flex-1 flex-col justify-center gap-4">
      <p className="text-center">
        <span className="font-heading text-4xl font-bold text-foreground tabular-nums">
          {level ?? '–'}
        </span>
        <span className="ml-1 text-sm text-muted-foreground">
          of 5 on average
        </span>
      </p>
      <div className="relative pt-5">
        {level !== null ? (
          <motion.span
            animate={{ left: `${((level - 1) / 4) * 100}%` }}
            aria-hidden="true"
            className="absolute top-0 -ml-2 size-0 border-x-8 border-t-[10px] border-x-transparent border-t-foreground"
            initial={reduceMotion ? false : { left: '0%' }}
            transition={{
              type: 'spring',
              stiffness: 90,
              damping: 14,
              delay: 0.2,
            }}
          />
        ) : null}
        <ol className="grid grid-cols-5 gap-1">
          {hintSteps.map((step, index) => {
            const reached = level !== null && index + 1 <= Math.round(level)
            return (
              <li className="flex flex-col items-center gap-1" key={step}>
                <motion.span
                  animate={{ opacity: 1, scaleY: 1 }}
                  className="h-2.5 w-full rounded-full"
                  initial={reduceMotion ? false : { opacity: 0, scaleY: 0.3 }}
                  style={{
                    background: reached
                      ? `color-mix(in oklab, #22c55e ${100 - index * 22}%, #ef4444)`
                      : 'color-mix(in oklab, var(--muted-foreground) 18%, transparent)',
                  }}
                  transition={{ duration: 0.3, delay: index * 0.08 }}
                />
                <span className="text-[0.62rem] text-muted-foreground">
                  {step}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
      {trend.length > 1 ? (
        <Sparkline className="mx-auto h-10 w-full max-w-60" values={trend} />
      ) : null}
      <p className="text-center text-sm text-muted-foreground">
        {hints.trend === 'insufficient_data'
          ? 'Not enough sessions for a trend yet.'
          : hints.trend === 'falling'
            ? 'Hint levels are falling: you need less help.'
            : hints.trend === 'rising'
              ? 'Hint levels are rising lately.'
              : 'Hint levels are steady.'}
      </p>
    </div>
  )
}
