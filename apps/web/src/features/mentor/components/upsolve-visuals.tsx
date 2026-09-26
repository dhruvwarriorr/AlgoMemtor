import type {
  ProviderKey,
  UpsolveHistoryPoint,
  UpsolveSummary,
} from '@algomemtor/shared-contracts'
import { motion, useReducedMotion } from 'motion/react'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { Flame } from '@/components/icons/algo-icons'
import {
  chartColors,
  providerColors,
  shortDay,
} from '@/features/mentor/chart-theme'
import { providerLabels } from '@/features/mentor/format'
import { cn } from '@/lib/utils'

const ease = [0.16, 1, 0.3, 1] as const
const MAX_BLOCKS = 12

const blockKinds = [
  { key: 'solved', label: 'Solved in contest', color: chartColors.solved },
  { key: 'upsolved', label: 'Upsolved', color: chartColors.upsolved },
  { key: 'open', label: 'Open', color: chartColors.open },
] as const

// Each recent contest as a stack of blocks, one per problem: solved during
// the contest at the bottom, upsolved after, and still open on top. The
// blocks drop into place contest by contest.
export function ContestTrail({
  history,
  windowDays,
}: {
  history: readonly UpsolveHistoryPoint[]
  windowDays: number
}) {
  const reduceMotion = useReducedMotion()
  const points = [...history].reverse()
  const totals = points.reduce(
    (sum, point) => ({
      solved: sum.solved + point.solvedInContest,
      upsolved: sum.upsolved + point.upsolved,
      open:
        sum.open +
        Math.max(0, point.total - point.solvedInContest - point.upsolved),
    }),
    { solved: 0, upsolved: 0, open: 0 },
  )
  const tallest = Math.min(
    MAX_BLOCKS,
    Math.max(4, ...points.map((point) => point.total)),
  )
  return (
    <section
      aria-labelledby="contest-trail-heading"
      className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-20 size-72 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--acc)_16%,transparent),transparent)] blur-2xl"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className="text-base font-semibold text-foreground"
            id="contest-trail-heading"
          >
            Contest trail
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Last {windowDays} days, one block per problem.
          </p>
        </div>
        <dl className="flex flex-wrap gap-2">
          {blockKinds.map((kind) => (
            <div
              className="flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs"
              key={kind.key}
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-[3px]"
                style={{ background: kind.color }}
              />
              <dt className="text-muted-foreground">{kind.label}</dt>
              <dd className="font-mono font-semibold text-foreground">
                {totals[kind.key]}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {points.length === 0 ? (
        <p className="relative mt-6 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No contests in the last {windowDays} days.
        </p>
      ) : (
        <div className="relative mt-auto overflow-x-auto pt-6">
          <ol
            aria-label="Recent contests"
            className="flex w-full min-w-max items-end justify-around gap-3 px-1"
          >
            {points.map((point, column) => {
              const open = Math.max(
                0,
                point.total - point.solvedInContest - point.upsolved,
              )
              const blocks = [
                ...Array.from({ length: point.solvedInContest }, () => 0),
                ...Array.from({ length: point.upsolved }, () => 1),
                ...Array.from({ length: open }, () => 2),
              ].slice(0, MAX_BLOCKS)
              const hidden = point.total - blocks.length
              return (
                <li
                  aria-label={`${point.name}: ${point.solvedInContest} solved in contest, ${point.upsolved} upsolved, ${open} open`}
                  className="group flex w-9 flex-1 flex-col items-center gap-1.5 sm:max-w-16"
                  key={`${point.provider}:${point.contestId}`}
                  title={`${point.name}\n${point.solvedInContest} solved · ${point.upsolved} upsolved · ${open} open`}
                >
                  <span
                    aria-hidden="true"
                    className="flex w-full flex-col-reverse gap-[3px] px-0.5 transition-transform duration-300 group-hover:-translate-y-1"
                    style={{ minHeight: `${tallest * 17}px` }}
                  >
                    {blocks.map((kind, index) => (
                      <motion.span
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          'block h-3.5 w-full rounded-[4px]',
                          kind === 2 &&
                            'border border-dashed border-[color-mix(in_oklab,var(--muted-foreground)_45%,transparent)]',
                        )}
                        initial={reduceMotion ? false : { opacity: 0, y: -28 }}
                        key={index}
                        style={{
                          background:
                            kind === 2
                              ? 'transparent'
                              : blockKinds[kind]?.color,
                        }}
                        transition={{
                          type: 'spring',
                          stiffness: 420,
                          damping: 22,
                          delay: column * 0.08 + index * 0.035,
                        }}
                      />
                    ))}
                  </span>
                  {hidden > 0 ? (
                    <span className="font-mono text-[0.6rem] text-muted-foreground">
                      +{hidden}
                    </span>
                  ) : null}
                  <span
                    aria-hidden="true"
                    className="h-0.5 w-full rounded-full"
                    style={{ background: providerColors[point.provider] }}
                  />
                  <ProviderLogo
                    className="size-3.5"
                    provider={point.provider}
                  />
                  <span className="font-mono text-[0.6rem] text-muted-foreground">
                    {shortDay(point.startsAt)}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}

// Follow-through as a gauge with a needle, the next milestone to aim for,
// and the same share platform by platform.
export function FollowThroughCard({
  summary,
  linkedProviders,
}: {
  summary: UpsolveSummary
  linkedProviders: readonly ProviderKey[]
}) {
  const reduceMotion = useReducedMotion()
  const worked = summary.upsolved + summary.pending
  const rate = worked === 0 ? 0 : summary.upsolved / worked
  const milestone = Math.min(1, Math.floor(rate * 10 + 1) / 10)
  const needed =
    worked === 0
      ? 0
      : Math.max(0, Math.ceil(milestone * worked - summary.upsolved))

  const counted = (summary.byProvider ?? []).filter(
    (item) => item.upsolved + item.open > 0,
  )
  const rows = [
    ...counted,
    ...linkedProviders
      // CSES has no contests, so it has nothing to upsolve.
      .filter((provider) => provider !== 'cses')
      .filter((provider) => !counted.some((item) => item.provider === provider))
      .map((provider) => ({ provider, upsolved: 0, open: 0 })),
  ]

  // A half circle from 180° to 0°.
  const radius = 70
  const arc = Math.PI * radius
  // The needle sweeps from the left end (0%) over the top to the right (100%).
  const needleAngle = Math.PI * (1 - rate)
  const needleX = 90 + Math.cos(needleAngle) * 56
  const needleY = 90 - Math.sin(needleAngle) * 56

  return (
    <section
      aria-labelledby="follow-through-heading"
      className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2
            className="text-base font-semibold text-foreground"
            id="follow-through-heading"
          >
            Follow-through
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Open problems you went back and solved.
          </p>
        </div>
      </div>

      <div className="relative mx-auto mt-3 w-full max-w-60">
        <svg
          aria-label={`${Math.round(rate * 100)}% upsolved: ${summary.upsolved} upsolved, ${summary.pending} still open`}
          className="w-full"
          role="img"
          viewBox="0 0 180 104"
        >
          <defs>
            <linearGradient id="follow-gauge" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="55%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <path
            d={`M 20 90 A ${radius} ${radius} 0 0 1 160 90`}
            fill="none"
            stroke="color-mix(in oklab, var(--muted-foreground) 16%, transparent)"
            strokeLinecap="round"
            strokeWidth="12"
          />
          <motion.path
            animate={{ strokeDasharray: `${rate * arc} ${arc}` }}
            d={`M 20 90 A ${radius} ${radius} 0 0 1 160 90`}
            fill="none"
            initial={reduceMotion ? false : { strokeDasharray: `0 ${arc}` }}
            stroke="url(#follow-gauge)"
            strokeLinecap="round"
            strokeWidth="12"
            transition={{ duration: 1.2, ease }}
          />
          <motion.line
            animate={{ x2: needleX, y2: needleY }}
            initial={reduceMotion ? false : { x2: 34, y2: 90 }}
            stroke="var(--foreground)"
            strokeLinecap="round"
            strokeWidth="3"
            transition={{
              type: 'spring',
              stiffness: 60,
              damping: 12,
              delay: 0.2,
            }}
            x1="90"
            y1="90"
          />
          <circle cx="90" cy="90" fill="var(--foreground)" r="6" />
          <circle cx="90" cy="90" fill="var(--card)" r="2.5" />
        </svg>
        <p className="-mt-1 text-center">
          <span className="font-heading text-3xl font-bold text-foreground tabular-nums">
            {Math.round(rate * 100)}%
          </span>
          <span className="ml-1.5 text-xs text-muted-foreground">
            {summary.upsolved} of {worked}
          </span>
        </p>
      </div>

      {worked > 0 && rate < 1 ? (
        <p className="mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#f59e0b]/12 px-3 py-1 text-xs font-medium text-[#b45309] dark:text-[#fcd34d]">
          <Flame aria-hidden="true" className="size-3.5" />
          {needed} more to reach {Math.round(milestone * 100)}%
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="mt-auto grid gap-2.5 pt-4">
          {rows.map((item, index) => {
            const total = item.upsolved + item.open
            return (
              <li className="grid gap-1" key={item.provider}>
                <span className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <ProviderLogo className="size-4" provider={item.provider} />
                    {providerLabels[item.provider]}
                  </span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {total === 0 ? 'nothing open' : `${item.upsolved}/${total}`}
                  </span>
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-muted">
                  <motion.span
                    animate={{
                      width: `${total === 0 ? 0 : (item.upsolved / total) * 100}%`,
                    }}
                    className="block h-full rounded-full"
                    initial={reduceMotion ? false : { width: '0%' }}
                    style={{ backgroundColor: providerColors[item.provider] }}
                    transition={{
                      duration: 0.8,
                      ease,
                      delay: 0.4 + index * 0.1,
                    }}
                  />
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
