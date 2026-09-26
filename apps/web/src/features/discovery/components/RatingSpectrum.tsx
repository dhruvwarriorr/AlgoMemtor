import { motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

import {
  RATING_CEILING,
  RATING_FLOOR,
  ratingBands,
  ratingPosition as position,
} from '../rating-bands'

// The chosen rating window glides over the Codeforces rank bands; clicking a
// band selects it as the range.
export function RatingSpectrum({
  min,
  max,
  onPick,
}: {
  min: number | undefined
  max: number | undefined
  onPick: (range: { min: number; max: number } | null) => void
}) {
  const reduceMotion = useReducedMotion()
  const active = min !== undefined || max !== undefined
  const start = position(min ?? RATING_FLOOR)
  const end = position(max ?? RATING_CEILING)
  return (
    <div className="min-w-0">
      <div className="relative">
        <ul
          aria-label="Rating bands"
          className="flex h-9 min-w-0 gap-0.5 overflow-hidden rounded-xl"
        >
          {ratingBands.map((band) => {
            const selected = min === band.min && max === band.max
            return (
              <li
                className="min-w-0"
                key={band.label}
                style={{ flexGrow: band.max - band.min + 1, flexBasis: 0 }}
              >
                <button
                  aria-label={`${band.label}, ${band.min} to ${band.max}`}
                  aria-pressed={selected}
                  className={cn(
                    'group relative grid h-full w-full place-items-center overflow-hidden text-[0.68rem] font-semibold transition-[filter] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
                    active && !selected ? 'text-foreground/70' : 'text-white',
                  )}
                  onClick={() =>
                    onPick(selected ? null : { min: band.min, max: band.max })
                  }
                  style={{
                    background: `color-mix(in oklab, ${band.color} ${active && !selected ? 45 : 85}%, var(--card))`,
                  }}
                  title={`${band.label} · ${band.min}–${band.max}`}
                  type="button"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/35 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  <span className="relative hidden truncate px-1 drop-shadow-sm lg:block">
                    {band.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {active ? (
          <motion.span
            animate={{
              left: `${start * 100}%`,
              width: `${Math.max(0.01, end - start) * 100}%`,
            }}
            aria-hidden="true"
            className="pointer-events-none absolute -inset-y-1 rounded-xl border-2 border-foreground shadow-[0_0_0_4px_color-mix(in_oklab,var(--foreground)_12%,transparent)]"
            initial={reduceMotion ? false : { left: '0%', width: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          />
        ) : null}
      </div>
      <div className="relative mt-1.5 h-4 font-mono text-[0.62rem] text-muted-foreground">
        {[800, 1200, 1600, 2000, 2400, 2800, 3200, 3500].map((tick) => (
          <span
            className={cn(
              'absolute -translate-x-1/2',
              tick === RATING_FLOOR && 'translate-x-0',
              tick === RATING_CEILING && '-translate-x-full',
            )}
            key={tick}
            style={{ left: `${position(tick) * 100}%` }}
          >
            {tick}
          </span>
        ))}
      </div>
    </div>
  )
}
