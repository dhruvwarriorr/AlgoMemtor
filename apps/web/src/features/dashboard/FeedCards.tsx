import type { CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import type {
  ProviderActivityEvent,
  RecommendationItem,
} from '@algomemtor/shared-contracts'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { ArrowRight, ArrowUpRight, X } from '@/components/icons/algo-icons'
import { SpotlightCard } from '@/components/kit/surfaces'
import { OrbLoader } from '@/components/motion/OrbLoader'
import {
  dashEase as ease,
  ratingTiers,
  tierFor,
  titleCase,
} from '@/features/dashboard/dashboard-format'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { isAcceptedSubmission } from '@/pages/dashboard-activity'
import { cn } from '@/lib/utils'

const noticeClass =
  'mt-4 rounded-xl border border-sun/60 bg-sun-soft p-3 text-sm text-sun-foreground'

const activityDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

const difficultyColors = {
  easy: '#22c55e',
  medium: '#f59e0b',
  hard: '#ef4444',
} as const

// The problem's difficulty as a coloured chip: a rating takes its rank
// colour, a word its easy/medium/hard colour.
function difficultyChip(item: RecommendationItem) {
  const raw = item.problem.providerDifficulty
  if (typeof raw === 'number') {
    const tiers = ratingTiers('codeforces')
    const color =
      tiers === undefined
        ? '#38bdf8'
        : (tierFor(tiers, raw).tier?.color ?? '#38bdf8')
    return { label: String(Math.round(raw)), color }
  }
  const level = item.problem.normalizedDifficulty
  if (level === 'easy' || level === 'medium' || level === 'hard') {
    return {
      label: typeof raw === 'string' ? raw : titleCase(level),
      color: difficultyColors[level],
    }
  }
  return typeof raw === 'string' ? { label: raw, color: '#38bdf8' } : undefined
}

function CardHeader({
  id,
  title,
  link,
}: {
  id: string
  title: string
  link?: { to: string; label: string }
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2
        className="font-sans text-sm font-medium text-muted-foreground"
        id={id}
      >
        {title}
      </h2>
      {link ? (
        <Link
          className="group inline-flex items-center gap-1 text-sm font-medium text-foreground/70 transition-colors hover:text-primary"
          to={link.to}
        >
          {link.label}
          <ArrowRight
            aria-hidden="true"
            className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>
      ) : null}
    </div>
  )
}

export function UpNextCard({
  items,
  unavailable,
  dismissing,
  onDismiss,
  className,
}: {
  items: readonly RecommendationItem[]
  unavailable: boolean
  dismissing: boolean
  onDismiss: (id: string) => void
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  return (
    <SpotlightCard
      aria-labelledby="next-practice-heading"
      as="section"
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-soft',
        className,
      )}
    >
      <CardHeader
        id="next-practice-heading"
        link={{ to: '/recommendations', label: 'All picks' }}
        title="Next practice"
      />
      {unavailable ? (
        <p className={noticeClass} role="status">
          Recommendations are temporarily unavailable.
        </p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No recommendations yet. Visit Recommendations to refresh the feed.
        </p>
      ) : (
        <ol className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
          {items.map((item, index) => {
            const chip = difficultyChip(item)
            const topic = item.problem.topics[0]
            return (
              <motion.li
                animate={{ opacity: 1, x: 0 }}
                className="group/row relative flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden sm:gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5 transition-[border-color,background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--primary)_40%,var(--border))] hover:bg-[color-mix(in_oklab,var(--primary)_6%,var(--card))] hover:shadow-soft"
                initial={reduceMotion ? false : { opacity: 0, x: -18 }}
                key={item.id}
                transition={{ duration: 0.5, ease, delay: 0.3 + index * 0.1 }}
              >
                <span
                  aria-hidden="true"
                  className="hidden w-7 shrink-0 bg-linear-to-b from-[#38bdf8] to-[#4ade80] bg-clip-text font-heading text-xl font-bold text-transparent tabular-nums sm:inline"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground ring-1 ring-border transition-transform sm:size-10 duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/row:-rotate-6 group-hover/row:scale-105"
                >
                  <ProviderLogo
                    className="size-5"
                    provider={item.problem.provider}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate font-medium text-foreground">
                      {item.problem.title}
                    </p>
                    {chip ? (
                      <span
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[0.68rem] font-bold tabular-nums"
                        style={{
                          color: chip.color,
                          background: `color-mix(in oklab, ${chip.color} 14%, transparent)`,
                        }}
                      >
                        {chip.label}
                      </span>
                    ) : null}
                    {topic ? (
                      <span className="hidden shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[0.68rem] text-muted-foreground md:inline">
                        {titleCase(topic)}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {item.reason}
                  </p>
                </div>
                <a
                  aria-label={`Solve ${item.problem.title} on ${providerLabels[item.problem.provider]}`}
                  className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-foreground/70 transition-colors duration-300 group-hover/row:border-primary group-hover/row:bg-primary group-hover/row:text-primary-foreground [--icon-node:var(--go)]"
                  href={item.problem.canonicalUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ArrowUpRight aria-hidden="true" className="size-4" />
                </a>
                <button
                  aria-label={`Dismiss ${item.problem.title}`}
                  className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-foreground/70 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                  disabled={dismissing}
                  onClick={() => onDismiss(item.id)}
                  title="Don't recommend this problem again"
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </motion.li>
            )
          })}
        </ol>
      )}
    </SpotlightCard>
  )
}

export function ActivityCard({
  events,
  unavailable,
  loading,
  className,
}: {
  events: readonly ProviderActivityEvent[]
  unavailable: boolean
  loading: boolean
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  return (
    <SpotlightCard
      aria-labelledby="activity-heading"
      as="section"
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-soft',
        className,
      )}
    >
      <CardHeader id="activity-heading" title="Recent activity" />
      {unavailable ? (
        <p className={noticeClass} role="status">
          Recent activity is temporarily unavailable.
        </p>
      ) : loading ? (
        <div className="mt-4 flex justify-center" role="status">
          <OrbLoader label="Loading recent activity…" />
        </div>
      ) : events.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No dated activity yet. Sync a platform or record progress to start
          your history.
        </p>
      ) : (
        <div className="relative mt-4 flex min-h-0 flex-1 flex-col justify-center">
          {/* A rail through the nodes on wide screens. */}
          <span
            aria-hidden="true"
            className="absolute top-5 right-6 left-6 hidden h-px bg-linear-to-r from-transparent via-border to-transparent sm:block"
          />
          {reduceMotion ? null : (
            <span
              aria-hidden="true"
              className="absolute top-[1.1rem] right-6 left-6 hidden h-[3px] overflow-hidden sm:block"
            >
              <motion.span
                animate={{ left: ['-10%', '100%'] }}
                className="absolute top-0 h-full w-16 rounded-full bg-linear-to-r from-transparent via-[#38bdf8] to-transparent"
                transition={{
                  duration: 3.2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  repeatDelay: 0.6,
                }}
              />
            </span>
          )}
          <ol
            className="relative grid gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(var(--events),minmax(0,1fr))]"
            style={{ '--events': events.length } as CSSProperties}
          >
            {events.map((event, index) => {
              const solved =
                event.eventType === 'solved' || isAcceptedSubmission(event)
              return (
                <motion.li
                  animate={{ opacity: 1, y: 0 }}
                  className="flex min-w-0 items-start gap-3 sm:flex-col sm:items-center sm:gap-2.5 sm:text-center"
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  key={event.id}
                  transition={{
                    duration: 0.5,
                    ease,
                    delay: 0.35 + index * 0.1,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'relative grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground ring-1',
                      solved
                        ? 'shadow-[0_0_18px_-6px_var(--go)] ring-[color-mix(in_oklab,var(--go)_45%,transparent)]'
                        : 'ring-border',
                    )}
                  >
                    <ProviderLogo
                      className="size-5"
                      provider={event.provider}
                    />
                    <span
                      className={cn(
                        'absolute -right-1 -bottom-1 size-3.5 rounded-full ring-2 ring-card',
                        solved
                          ? 'bg-go shadow-[0_0_8px_var(--go)]'
                          : 'bg-muted-foreground/60',
                      )}
                    />
                  </span>
                  <div className="min-w-0 flex-1 sm:w-full sm:flex-none">
                    <p className="truncate font-medium text-foreground">
                      {event.title ?? event.externalId ?? 'Contest activity'}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {providerLabels[event.provider]} ·{' '}
                      {event.source === 'manual'
                        ? event.eventType === 'solved'
                          ? 'Marked solved'
                          : 'Marked attempted'
                        : solved
                          ? 'Accepted'
                          : event.eventType.replaceAll('_', ' ')}
                    </p>
                    {event.occurredAt ? (
                      <time
                        className="mt-1 inline-block rounded-md bg-secondary px-1.5 py-0.5 text-[0.68rem] text-muted-foreground tabular-nums"
                        dateTime={event.occurredAt}
                      >
                        {activityDate.format(new Date(event.occurredAt))}
                      </time>
                    ) : null}
                  </div>
                </motion.li>
              )
            })}
          </ol>
        </div>
      )}
    </SpotlightCard>
  )
}
