import type { ContestSummary, ProviderKey } from '@algomemtor/shared-contracts'
import { motion, useReducedMotion } from 'motion/react'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { chartColors, shortDay } from '@/features/mentor/chart-theme'
import { cn } from '@/lib/utils'

const ease = [0.16, 1, 0.3, 1] as const

type Contest = ContestSummary & { label: string }

function ContestLabel({
  provider,
  startsAt,
}: {
  provider: ProviderKey
  startsAt: string | undefined
}) {
  return (
    <span className="flex w-16 shrink-0 items-center gap-1.5">
      <ProviderLogo className="size-3.5 shrink-0" provider={provider} />
      <span className="font-mono text-[0.68rem] text-muted-foreground">
        {shortDay(startsAt)}
      </span>
    </span>
  )
}

// One row per contest, one square per problem: solved squares fill in from
// the left, the rest stay as outlines.
export function ProblemScoreboard({
  contests,
}: {
  contests: readonly Contest[]
}) {
  const reduceMotion = useReducedMotion()
  const rows = [...contests].reverse()
  return (
    <ol
      aria-label="Solved per contest"
      className="flex flex-1 flex-col justify-around gap-2"
    >
      {rows.map((contest, row) => {
        const total = Math.max(contest.problemCount ?? 0, contest.solvedCount)
        return (
          <li
            className="group flex min-w-0 items-center gap-3 rounded-lg px-1 py-0.5 transition-colors hover:bg-secondary/50"
            key={`${contest.provider}:${contest.contestId}`}
            title={`${contest.name}: ${contest.solvedCount} of ${total} solved`}
          >
            <ContestLabel
              provider={contest.provider}
              startsAt={contest.startsAt}
            />
            <span
              aria-label={`${contest.name}: ${contest.solvedCount} of ${total} solved`}
              className="flex min-w-0 flex-1 gap-1"
              role="img"
            >
              {Array.from({ length: total }, (_, index) => {
                const solved = index < contest.solvedCount
                return (
                  <motion.span
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                      'h-6 max-w-10 min-w-2 flex-1 rounded-md',
                      solved
                        ? 'shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)]'
                        : 'border border-dashed border-[color-mix(in_oklab,var(--muted-foreground)_45%,transparent)]',
                    )}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
                    key={index}
                    style={
                      solved ? { background: chartColors.solved } : undefined
                    }
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 22,
                      delay: row * 0.05 + index * 0.03,
                    }}
                  />
                )
              })}
            </span>
            <span className="w-10 shrink-0 text-right font-mono text-xs text-foreground">
              <b>{contest.solvedCount}</b>
              <span className="text-muted-foreground">/{total}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// Rating over the window as a line that draws itself, starting from zero,
// with each contest's change printed at its point.
export function RatingJourney({ contests }: { contests: readonly Contest[] }) {
  const reduceMotion = useReducedMotion()
  const rated = contests.filter((contest) => contest.ratingChange !== undefined)
  const path = rated.reduce<number[]>(
    (points, contest) => [
      ...points,
      (points.at(-1) ?? 0) + Math.round(contest.ratingChange ?? 0),
    ],
    [0],
  )
  const width = 320
  const height = 190
  const pad = { left: 14, right: 14, top: 26, bottom: 34 }
  const low = Math.min(...path)
  const high = Math.max(...path)
  const span = Math.max(1, high - low)
  const x = (index: number) =>
    pad.left +
    (index / Math.max(1, path.length - 1)) * (width - pad.left - pad.right)
  const y = (value: number) =>
    pad.top + (1 - (value - low) / span) * (height - pad.top - pad.bottom)
  const line = path
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(value)}`)
    .join(' ')
  const area = `${line} L ${x(path.length - 1)} ${height - pad.bottom} L ${x(0)} ${height - pad.bottom} Z`
  const net = path.at(-1) ?? 0
  return (
    <div className="flex flex-1 flex-col">
      <p className="text-sm">
        Net{' '}
        <b
          className={cn(
            'font-heading text-lg',
            net >= 0 ? 'text-go-foreground' : 'text-destructive',
          )}
        >
          {net > 0 ? '+' : ''}
          {net}
        </b>{' '}
        <span className="text-muted-foreground">
          over {rated.length} rated contests
        </span>
      </p>
      <svg
        aria-label={`Rating change per contest: ${rated.map((contest) => `${contest.name} ${Math.round(contest.ratingChange ?? 0)}`).join(', ')}`}
        className="mt-2 w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id="journey-fill" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor={chartColors.solved}
              stopOpacity={0.3}
            />
            <stop
              offset="100%"
              stopColor={chartColors.solved}
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <line
          stroke="var(--border)"
          strokeDasharray="3 3"
          x1={pad.left}
          x2={width - pad.right}
          y1={y(0)}
          y2={y(0)}
        />
        <motion.path
          animate={{ opacity: 1 }}
          d={area}
          fill="url(#journey-fill)"
          initial={reduceMotion ? false : { opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        />
        <motion.path
          animate={{ pathLength: 1 }}
          d={line}
          fill="none"
          initial={reduceMotion ? false : { pathLength: 0 }}
          stroke={chartColors.solved}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          transition={{ duration: 1.2, ease }}
          vectorEffect="non-scaling-stroke"
        />
        {rated.map((contest, index) => {
          const delta = Math.round(contest.ratingChange ?? 0)
          const cx = x(index + 1)
          const cy = y(path[index + 1] ?? 0)
          const color = delta >= 0 ? chartColors.solved : chartColors.wrong
          return (
            <g key={`${contest.provider}:${contest.contestId}`}>
              <motion.circle
                animate={{ scale: 1 }}
                cx={cx}
                cy={cy}
                fill="var(--card)"
                initial={reduceMotion ? false : { scale: 0 }}
                r={4}
                stroke={color}
                strokeWidth={2.2}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 18,
                  delay: 0.25 + index * 0.1,
                }}
              >
                <title>{`${contest.name}: ${delta > 0 ? '+' : ''}${delta}`}</title>
              </motion.circle>
              <text
                fill={color}
                fontSize={8}
                fontWeight={700}
                textAnchor="middle"
                x={cx}
                y={cy - 9}
              >
                {delta > 0 ? '+' : ''}
                {delta}
              </text>
              <text
                fill="var(--muted-foreground)"
                fontSize={7}
                textAnchor="middle"
                x={cx}
                y={height - pad.bottom + 14}
              >
                {shortDay(contest.startsAt)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// Each contest as a lane: the runner stops at the minute of the first
// accepted submission, with a red pip per wrong submission.
export function StartLanes({ contests }: { contests: readonly Contest[] }) {
  const reduceMotion = useReducedMotion()
  const rows = [...contests]
    .filter((contest) => contest.firstAcceptedMinute !== undefined)
    .reverse()
  const longest = Math.max(
    10,
    ...rows.map((contest) => contest.firstAcceptedMinute ?? 0),
  )
  const scale = Math.ceil(longest / 10) * 10
  return (
    <div className="flex flex-1 flex-col">
      <ol
        aria-label="Start speed per contest"
        className="flex flex-1 flex-col justify-around gap-2"
      >
        {rows.map((contest, row) => {
          const minute = Math.round(contest.firstAcceptedMinute ?? 0)
          const share = minute / scale
          const wrong = contest.wrongSubmissions ?? 0
          const fast = share <= 0.25
          return (
            <li
              className="flex min-w-0 items-center gap-3"
              key={`${contest.provider}:${contest.contestId}`}
              title={`${contest.name}: first accept at ${minute} min, ${wrong} wrong`}
            >
              <ContestLabel
                provider={contest.provider}
                startsAt={contest.startsAt}
              />
              <span className="relative h-5 min-w-0 flex-1 rounded-full bg-muted/60">
                <motion.span
                  animate={{ width: `${share * 100}%` }}
                  className="absolute inset-y-1.5 left-0 rounded-full"
                  initial={reduceMotion ? false : { width: '0%' }}
                  style={{
                    background: fast
                      ? 'linear-gradient(90deg, transparent, #22c55e)'
                      : 'linear-gradient(90deg, transparent, #0ea5e9)',
                  }}
                  transition={{ duration: 0.9, ease, delay: row * 0.05 }}
                />
                <motion.span
                  animate={{ left: `${share * 100}%` }}
                  className={cn(
                    'absolute top-1/2 -mt-2 -ml-2 grid size-4 place-items-center rounded-full border-2 border-card shadow-soft',
                    fast ? 'bg-[#22c55e]' : 'bg-[#0ea5e9]',
                  )}
                  initial={reduceMotion ? false : { left: '0%' }}
                  transition={{ duration: 0.9, ease, delay: row * 0.05 }}
                />
              </span>
              <span className="flex w-24 shrink-0 items-center justify-end gap-1.5">
                <span className="font-mono text-xs font-semibold text-foreground">
                  {minute}m
                </span>
                <span aria-hidden="true" className="flex gap-0.5">
                  {Array.from({ length: Math.min(wrong, 5) }, (_, pip) => (
                    <span
                      className="size-1.5 rounded-full"
                      key={pip}
                      style={{ background: chartColors.wrong }}
                    />
                  ))}
                </span>
                {wrong > 5 ? (
                  <span className="font-mono text-[0.6rem] text-destructive">
                    +{wrong - 5}
                  </span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ol>
      <div className="mt-2 flex justify-between pr-[6.75rem] pl-[4.75rem] font-mono text-[0.62rem] text-muted-foreground">
        <span>0</span>
        <span>{scale / 2}m</span>
        <span>{scale}m</span>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#22c55e]" /> First quarter
          of your range
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-1.5 rounded-full"
            style={{ background: chartColors.wrong }}
          />{' '}
          Wrong submission
        </span>
      </p>
    </div>
  )
}

// Pressure habits as segmented meters, one segment per analyzed contest,
// lighting up one after another.
export function PressureMeters({
  signals,
  total,
}: {
  signals: readonly { label: string; count: number; hint: string }[]
  total: number
}) {
  const reduceMotion = useReducedMotion()
  const segments = Math.max(1, Math.min(total, 20))
  return (
    <ul className="grid gap-4">
      {signals.map((signal, row) => {
        const lit = Math.round((signal.count / Math.max(1, total)) * segments)
        const heavy = signal.count / Math.max(1, total) >= 0.5
        return (
          <li key={signal.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-foreground">
                {signal.label}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                <b className="text-foreground">{signal.count}</b> of {total}
              </span>
            </div>
            <span
              aria-label={`${signal.label}: ${signal.count} of ${total} contests`}
              className="mt-1.5 flex gap-1"
              role="img"
            >
              {Array.from({ length: segments }, (_, index) => (
                <motion.span
                  animate={{
                    opacity: index < lit ? 1 : 0.28,
                    scaleY: index < lit ? 1 : 0.7,
                  }}
                  className={cn(
                    'h-3 flex-1 rounded-[3px]',
                    index < lit
                      ? heavy
                        ? 'bg-[#ef4444]'
                        : 'bg-[#0ea5e9]'
                      : 'bg-muted-foreground/40',
                  )}
                  initial={reduceMotion ? false : { opacity: 0.1, scaleY: 0.4 }}
                  key={index}
                  transition={{
                    duration: 0.3,
                    delay: row * 0.15 + index * 0.04,
                  }}
                />
              ))}
            </span>
            <p className="mt-1 text-xs text-muted-foreground">{signal.hint}</p>
          </li>
        )
      })}
    </ul>
  )
}
