import { useState } from 'react'
import type { ProgressBreakdown } from '@algomemtor/shared-contracts'
import { motion, useReducedMotion } from 'motion/react'

import { bandColor } from '@/features/discovery/rating-bands'
import { cn } from '@/lib/utils'

const ease = [0.16, 1, 0.3, 1] as const

const dayFormat = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00.000Z`),
  )

// One column per day: newly solved stacked on problems attempted but not
// solved, rising in day by day. The best day and today are marked.
export function PracticePulse({
  trend,
}: {
  trend: readonly { date: string; attempted: number; solved: number }[]
}) {
  const reduceMotion = useReducedMotion()
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(
    1,
    ...trend.map((day) => Math.max(day.attempted, day.solved)),
  )
  const best = trend.reduce(
    (bestIndex, day, index) =>
      day.solved > (trend[bestIndex]?.solved ?? -1) ? index : bestIndex,
    0,
  )
  const focus = hovered ?? trend.length - 1
  const shown = trend[focus]
  return (
    <div className="flex flex-1 flex-col">
      {shown ? (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span className="font-medium text-foreground">
            {hovered === null
              ? 'Today'
              : dayFormat(shown.date, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm bg-[#0ea5e9]"
            />
            <b className="font-heading text-foreground tabular-nums">
              {shown.solved}
            </b>{' '}
            newly solved
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm bg-[#22c55e]/45"
            />
            <b className="font-heading text-foreground tabular-nums">
              {shown.attempted}
            </b>{' '}
            attempted
          </span>
        </div>
      ) : null}
      <div
        aria-label={`Daily practice over ${trend.length} days: ${trend.reduce((sum, day) => sum + day.solved, 0)} newly solved`}
        className="relative flex min-h-52 flex-1 items-end gap-[3px]"
        onMouseLeave={() => setHovered(null)}
        role="img"
      >
        {[0.25, 0.5, 0.75].map((line) => (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border"
            key={line}
            style={{ bottom: `${line * 100}%` }}
          />
        ))}
        {trend.map((day, index) => {
          const tried = Math.max(0, day.attempted - day.solved)
          const solvedHeight = (day.solved / max) * 100
          const triedHeight = (tried / max) * 100
          const active = index === focus
          return (
            <span
              className="group relative flex h-full min-w-0 flex-1 cursor-default flex-col justify-end"
              key={day.date}
              onMouseEnter={() => setHovered(index)}
            >
              {index === best && day.solved > 0 ? (
                <motion.span
                  animate={{ opacity: 1, y: 0 }}
                  aria-hidden="true"
                  className="absolute left-1/2 z-10 -translate-x-1/2 text-[0.7rem]"
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  style={{
                    bottom: `calc(${solvedHeight + triedHeight}% + 4px)`,
                  }}
                  transition={{ delay: 1 }}
                >
                  ★
                </motion.span>
              ) : null}
              <motion.span
                animate={{ height: `${triedHeight}%` }}
                className="w-full rounded-t-[3px] bg-[#22c55e]/35"
                initial={reduceMotion ? false : { height: '0%' }}
                transition={{ duration: 0.6, ease, delay: index * 0.02 }}
              />
              <motion.span
                animate={{ height: `${solvedHeight}%` }}
                className={cn(
                  'w-full transition-[filter] duration-200',
                  tried === 0 ? 'rounded-t-[3px]' : '',
                  active ? 'brightness-110' : '',
                )}
                initial={reduceMotion ? false : { height: '0%' }}
                style={{
                  background: 'linear-gradient(180deg, #38bdf8, #0284c7)',
                }}
                transition={{ duration: 0.6, ease, delay: 0.1 + index * 0.02 }}
              />
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1 h-1 w-full rounded-full transition-colors',
                  active ? 'bg-foreground' : 'bg-transparent',
                )}
              />
            </span>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.68rem] text-muted-foreground">
        <span>
          {trend[0]
            ? dayFormat(trend[0].date, { month: 'short', day: 'numeric' })
            : ''}
        </span>
        <span>
          ★ best day ·{' '}
          {trend[best]
            ? dayFormat(trend[best].date, { month: 'short', day: 'numeric' })
            : ''}
        </span>
        <span>Today</span>
      </div>
    </div>
  )
}

const mosaicColors = [
  '#0ea5e9',
  '#22c55e',
  '#8b5cf6',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#6366f1',
  '#94a3b8',
]

// Topics as tiles whose size follows their share of solves.
export function TopicMosaic({
  items,
}: {
  items: readonly { name: string; value: number }[]
}) {
  const reduceMotion = useReducedMotion()
  const total = items.reduce((sum, item) => sum + item.value, 0)
  return (
    <ul
      aria-label="Topics practiced"
      className="flex min-h-52 flex-1 flex-wrap content-stretch gap-1.5"
    >
      {items.map((item, index) => {
        const share = total === 0 ? 0 : item.value / total
        const color = mosaicColors[index % mosaicColors.length] ?? '#94a3b8'
        return (
          <motion.li
            animate={{ opacity: 1, scale: 1 }}
            className="group relative flex min-h-20 min-w-24 flex-col justify-between overflow-hidden rounded-xl p-3 text-white"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
            key={item.name}
            style={{
              flexGrow: Math.max(1, Math.round(share * 100)),
              flexBasis: `${Math.max(18, share * 100)}%`,
              background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 65%, #000))`,
            }}
            title={`${item.name}: ${item.value} solved`}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 22,
              delay: index * 0.06,
            }}
            whileHover={reduceMotion ? {} : { scale: 1.03 }}
          >
            <span className="truncate text-xs font-semibold drop-shadow-sm">
              {item.name}
            </span>
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-heading text-2xl leading-none font-bold tabular-nums">
                {item.value}
              </span>
              <span className="text-xs font-medium opacity-85 tabular-nums">
                {Math.round(share * 100)}%
              </span>
            </span>
          </motion.li>
        )
      })}
    </ul>
  )
}

// How submissions ended, as a 10 by 10 grid where each square is 1%.
export function VerdictWaffle({
  items,
  total,
}: {
  items: readonly { key: string; label: string; color: string; count: number }[]
  total: number
}) {
  const reduceMotion = useReducedMotion()
  // Largest remainder so the squares add up to exactly 100.
  const raw = items.map((item) => (item.count / Math.max(1, total)) * 100)
  const floors = raw.map(Math.floor)
  const remainder = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction)
  const squares = floors.map(
    (value, index) =>
      value +
      (order.findIndex((entry) => entry.index === index) < remainder ? 1 : 0),
  )
  const cells = squares.flatMap((count, index) =>
    Array.from({ length: count }, () => index),
  )
  return (
    <div className="grid flex-1 items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div
        aria-label={items
          .map((item) => `${item.label}: ${item.count}`)
          .join(', ')}
        className="mx-auto grid w-44 grid-cols-10 gap-[3px]"
        role="img"
      >
        {cells.map((kind, index) => (
          <motion.span
            animate={{ opacity: 1, scale: 1 }}
            className="aspect-square rounded-[3px]"
            initial={reduceMotion ? false : { opacity: 0, scale: 0 }}
            key={index}
            style={{ background: items[kind]?.color }}
            transition={{
              duration: 0.25,
              delay: (Math.floor(index / 10) + (index % 10)) * 0.025,
            }}
          />
        ))}
      </div>
      <ul className="grid gap-1.5">
        {items.map((item, index) => (
          <li className="flex items-center gap-2 text-sm" key={item.key}>
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-[3px]"
              style={{ background: item.color }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {item.label}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {squares[index]}%
            </span>
            <span className="w-8 text-right font-heading font-bold tabular-nums">
              {item.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Rating bands as rungs coloured by Codeforces rank, longest where you solve
// the most, with the easy/medium/hard split above.
export function RatingLadder({
  bands,
  difficulty,
}: {
  bands: ProgressBreakdown['ratingBands']
  difficulty: ProgressBreakdown['difficulty'] | undefined
}) {
  const reduceMotion = useReducedMotion()
  const max = Math.max(1, ...bands.map((band) => band.solved))
  const split = [
    { label: 'Easy', value: difficulty?.easy ?? 0, color: '#22c55e' },
    { label: 'Medium', value: difficulty?.medium ?? 0, color: '#f59e0b' },
    { label: 'Hard', value: difficulty?.hard ?? 0, color: '#ef4444' },
  ]
  const splitTotal = split.reduce((sum, item) => sum + item.value, 0)
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
          {split.map((item, index) =>
            item.value > 0 ? (
              <motion.span
                animate={{
                  width: `${(item.value / Math.max(1, splitTotal)) * 100}%`,
                }}
                className="h-full"
                initial={reduceMotion ? false : { width: '0%' }}
                key={item.label}
                style={{ background: item.color }}
                transition={{ duration: 0.8, ease, delay: index * 0.1 }}
              />
            ) : null,
          )}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {split.map((item) => (
            <span className="inline-flex items-center gap-1.5" key={item.label}>
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: item.color }}
              />
              <span className="text-muted-foreground">{item.label}</span>
              <b className="font-mono text-foreground">{item.value}</b>
            </span>
          ))}
        </p>
      </div>
      {bands.length === 0 ? (
        <p className="grid flex-1 place-items-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No rated problems solved in the last 30 days.
        </p>
      ) : (
        <ol aria-label="Solved problems by rating" className="grid gap-1.5">
          {[...bands].reverse().map((band, index) => {
            const color = bandColor(band.min)
            return (
              <li
                className="grid grid-cols-[4.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs"
                key={band.min}
              >
                <span className="font-mono text-muted-foreground">
                  {band.min}–{band.max}
                </span>
                <span className="h-4 overflow-hidden rounded-md bg-muted/70">
                  <motion.span
                    animate={{
                      width: `${Math.max(band.solved > 0 ? 4 : 0, (band.solved / max) * 100)}%`,
                    }}
                    className="block h-full rounded-md"
                    initial={reduceMotion ? false : { width: '0%' }}
                    style={{
                      background: `linear-gradient(90deg, color-mix(in oklab, ${color} 55%, transparent), ${color})`,
                    }}
                    transition={{
                      duration: 0.8,
                      ease,
                      delay: 0.2 + index * 0.05,
                    }}
                  />
                </span>
                <span className="text-right font-heading font-bold text-foreground tabular-nums">
                  {band.solved}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

// Weekdays as equalizer capsules: submissions as the faint column, solves
// as the bright fill inside it.
export function WeekEqualizer({
  weekdays,
}: {
  weekdays: ProgressBreakdown['weekdays']
}) {
  const reduceMotion = useReducedMotion()
  const max = Math.max(
    1,
    ...weekdays.map((day) => Math.max(day.submissions, day.solved)),
  )
  const busiest = weekdays.reduce(
    (best, day) => (day.solved > best.solved ? day : best),
    weekdays[0] ?? { day: 'Mon', solved: 0, submissions: 0 },
  )
  return (
    <div className="flex flex-1 flex-col">
      <p className="text-sm">
        Most solves on{' '}
        <b className="font-heading text-lg text-foreground">{busiest.day}</b>
      </p>
      <ol
        aria-label={weekdays
          .map(
            (day) =>
              `${day.day}: ${day.solved} solved, ${day.submissions} submissions`,
          )
          .join('; ')}
        className="mt-4 flex min-h-40 flex-1 items-stretch justify-between gap-2"
      >
        {weekdays.map((day, index) => (
          <li
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
            key={day.day}
          >
            <span
              className="relative flex w-full max-w-9 flex-1 items-end overflow-hidden rounded-full bg-muted/70"
              title={`${day.day}: ${day.solved} solved, ${day.submissions} submissions`}
            >
              <motion.span
                animate={{ height: `${(day.submissions / max) * 100}%` }}
                className="absolute inset-x-0 bottom-0 rounded-full bg-[#22c55e]/30"
                initial={reduceMotion ? false : { height: '0%' }}
                transition={{ duration: 0.7, ease, delay: index * 0.06 }}
              />
              <motion.span
                animate={{ height: `${(day.solved / max) * 100}%` }}
                className="relative w-full rounded-full"
                initial={reduceMotion ? false : { height: '0%' }}
                style={{
                  background:
                    day.day === busiest.day
                      ? 'linear-gradient(180deg, #7dd3fc, #0284c7)'
                      : 'linear-gradient(180deg, #38bdf8, #0369a1)',
                }}
                transition={{ duration: 0.8, ease, delay: 0.15 + index * 0.06 }}
              />
            </span>
            <span
              className={cn(
                'text-[0.68rem]',
                day.day === busiest.day
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {day.day}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const hourLabel = (hour: number) =>
  `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`

// Submissions by hour on a 24-hour clock face: brighter wedges hold more
// submissions and the hand points at the peak.
export function HourClock({ hours }: { hours: readonly number[] }) {
  const reduceMotion = useReducedMotion()
  const max = Math.max(0, ...hours)
  const peak = max > 0 ? hours.indexOf(max) : 0
  const [focus, setFocus] = useState<number | null>(null)
  const shown = focus ?? peak
  const center = 70
  const handAngle = (((shown + 0.5) / 24) * 360 - 90) * (Math.PI / 180)
  const handX = center + Math.cos(handAngle) * 26
  const handY = center + Math.sin(handAngle) * 26
  const inner = 30
  const outer = 64
  const wedge = (hour: number) => {
    const start = ((hour / 24) * 360 - 90 + 1) * (Math.PI / 180)
    const end = (((hour + 1) / 24) * 360 - 90 - 1) * (Math.PI / 180)
    const point = (radius: number, angle: number) =>
      `${center + Math.cos(angle) * radius} ${center + Math.sin(angle) * radius}`
    return `M ${point(inner, start)} L ${point(outer, start)} A ${outer} ${outer} 0 0 1 ${point(outer, end)} L ${point(inner, end)} A ${inner} ${inner} 0 0 0 ${point(inner, start)} Z`
  }
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <p className="self-start text-sm">
        {focus === null ? 'Peak around ' : ''}
        <b className="font-heading text-lg text-foreground">
          {hourLabel(shown)}
        </b>
        <span className="ml-1.5 text-xs text-muted-foreground">
          {hours[shown] ?? 0} submissions
        </span>
      </p>
      <svg
        aria-label={`Submissions by hour. Peak around ${hourLabel(peak)} with ${max}.`}
        className="w-full max-w-52"
        onMouseLeave={() => setFocus(null)}
        role="img"
        viewBox="0 0 140 140"
      >
        {hours.map((count, hour) => (
          <motion.path
            animate={{ opacity: 1 }}
            d={wedge(hour)}
            fill={
              count === 0
                ? 'color-mix(in oklab, var(--muted-foreground) 14%, transparent)'
                : `color-mix(in oklab, #0ea5e9 ${25 + Math.round((count / Math.max(1, max)) * 75)}%, transparent)`
            }
            initial={reduceMotion ? false : { opacity: 0 }}
            key={hour}
            onMouseEnter={() => setFocus(hour)}
            stroke={hour === shown ? 'var(--foreground)' : 'none'}
            strokeWidth={1.2}
            transition={{ duration: 0.3, delay: hour * 0.03 }}
          >
            <title>{`${hourLabel(hour)}: ${count} submissions`}</title>
          </motion.path>
        ))}
        {[0, 6, 12, 18].map((hour) => {
          const angle = ((hour / 24) * 360 - 90) * (Math.PI / 180)
          return (
            <text
              dominantBaseline="middle"
              fill="var(--muted-foreground)"
              fontSize="7"
              key={hour}
              textAnchor="middle"
              x={center + Math.cos(angle) * 20}
              y={center + Math.sin(angle) * 20}
            >
              {hour}
            </text>
          )
        })}
        <motion.line
          animate={{ x2: handX, y2: handY }}
          initial={reduceMotion ? false : { x2: center, y2: center - 26 }}
          stroke="var(--foreground)"
          strokeLinecap="round"
          strokeWidth="2.2"
          transition={{ type: 'spring', stiffness: 80, damping: 14 }}
          x1={center}
          y1={center}
        />
        <circle cx={center} cy={center} fill="var(--foreground)" r="3.5" />
      </svg>
    </div>
  )
}
