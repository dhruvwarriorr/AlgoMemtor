import type {
  Bookmark,
  LearnerProblemStatus,
} from '@algomemtor/shared-contracts'
import { motion, useReducedMotion } from 'motion/react'

import { Flame } from '@/components/icons/algo-icons'
import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { SolveOnProviderLink } from '@/features/discovery/components/SolveOnProviderLink'
import { bandColor } from '@/features/discovery/rating-bands'
import { cn } from '@/lib/utils'

import { bookmarkRating, DAY } from '../bookmark-utils'

const shelves: readonly {
  status: LearnerProblemStatus
  label: string
  dot: string
}[] = [
  { status: 'unsolved', label: 'Unsolved', dot: 'var(--muted-foreground)' },
  { status: 'attempted', label: 'Attempted', dot: '#f59e0b' },
  { status: 'solved', label: 'Solved', dot: '#22c55e' },
]

// The saved problems as books on a shelf: one spine per bookmark, taller for
// harder problems, in its rating colour, grouped by where you are with it.
// Clicking a spine jumps to its card.
export function BookmarkShelf({
  bookmarks,
  total,
  onOpen,
}: {
  bookmarks: readonly Bookmark[]
  total: number
  onOpen: (id: string) => void
}) {
  const reduceMotion = useReducedMotion()
  // Books drop in shelf by shelf, left to right.
  const order = new Map(
    shelves
      .flatMap((shelf) =>
        bookmarks.filter(
          (bookmark) =>
            (bookmark.problem.learnerStatus ?? 'unsolved') === shelf.status,
        ),
      )
      .map((bookmark, index) => [bookmark.id, index]),
  )
  return (
    <section
      aria-labelledby="bookmark-shelf-heading"
      className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-16 size-64 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--acc)_20%,transparent),transparent)] blur-2xl"
      />
      <div className="relative flex items-baseline justify-between gap-2">
        <h2
          className="text-sm font-semibold text-foreground"
          id="bookmark-shelf-heading"
        >
          Your shelf
        </h2>
        <p className="text-xs text-muted-foreground">
          <span className="font-heading text-lg font-bold text-foreground tabular-nums">
            {total}
          </span>{' '}
          saved · tap a book to find it
        </p>
      </div>
      <div className="relative mt-auto grid min-w-0 grid-cols-3 gap-3 pt-6">
        {shelves.map((shelf) => {
          const books = bookmarks.filter(
            (bookmark) =>
              (bookmark.problem.learnerStatus ?? 'unsolved') === shelf.status,
          )
          return (
            <div className="flex min-w-0 flex-col" key={shelf.status}>
              <ul
                aria-label={`${shelf.label}: ${books.length}`}
                className="flex h-36 min-w-0 items-end gap-1 overflow-hidden px-1"
              >
                {books.length === 0 ? (
                  <li
                    aria-hidden="true"
                    className="h-16 w-5 rounded-t-md border-2 border-dashed border-border"
                  />
                ) : null}
                {books.map((bookmark) => {
                  const rating = bookmarkRating(bookmark)
                  const color = bandColor(rating)
                  const height = 64 + Math.min(1, (rating - 800) / 2700) * 76
                  const delay = 0.04 * (order.get(bookmark.id) ?? 0)
                  return (
                    <motion.li
                      animate={{ y: 0, opacity: 1 }}
                      className="shrink-0"
                      initial={reduceMotion ? false : { y: 40, opacity: 0 }}
                      key={bookmark.id}
                      transition={{
                        type: 'spring',
                        stiffness: 260,
                        damping: 20,
                        delay,
                      }}
                    >
                      <motion.button
                        aria-label={`${bookmark.problem.title}, ${rating}. Show its card.`}
                        className="relative grid w-7 place-items-center overflow-hidden rounded-t-md rounded-b-sm text-white shadow-[inset_-3px_0_0_rgb(0_0_0/0.18),inset_2px_0_0_rgb(255_255_255/0.25)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        onClick={() => onOpen(bookmark.id)}
                        style={{
                          height,
                          background: `linear-gradient(180deg, ${color}, color-mix(in oklab, ${color} 70%, #000))`,
                        }}
                        title={`${bookmark.problem.title} · ${rating}`}
                        type="button"
                        whileHover={reduceMotion ? {} : { y: -8, rotate: -3 }}
                      >
                        <span className="absolute top-2 h-0.5 w-3 rounded-full bg-white/60" />
                        <span className="font-mono text-[0.55rem] font-semibold tracking-wider [writing-mode:vertical-rl]">
                          {bookmark.problem.externalId}
                        </span>
                        <span className="absolute bottom-2 h-0.5 w-3 rounded-full bg-white/40" />
                      </motion.button>
                    </motion.li>
                  )
                })}
              </ul>
              <span
                aria-hidden="true"
                className="h-2.5 rounded-sm bg-linear-to-b from-[color-mix(in_oklab,var(--foreground)_22%,var(--card))] to-[color-mix(in_oklab,var(--foreground)_10%,var(--card))] shadow-[0_6px_10px_-6px_rgb(0_0_0/0.4)]"
              />
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: shelf.dot }}
                />
                {shelf.label}
                <span className="font-mono font-semibold text-foreground">
                  {books.length}
                </span>
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// The problem that has waited longest, with a ring of how much of this view
// is already cleared.
export function NextUpCard({
  bookmarks,
  now,
}: {
  bookmarks: readonly Bookmark[]
  now: number
}) {
  const reduceMotion = useReducedMotion()
  const waiting = bookmarks
    .filter(
      (bookmark) => (bookmark.problem.learnerStatus ?? 'unsolved') !== 'solved',
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  const next = waiting[0]
  const solved = bookmarks.length - waiting.length
  const share = bookmarks.length === 0 ? 0 : solved / bookmarks.length
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const days =
    next === undefined
      ? 0
      : Math.max(
          0,
          Math.floor((now - new Date(next.createdAt).getTime()) / DAY),
        )
  return (
    <section
      aria-labelledby="bookmark-next-heading"
      className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          className="text-sm font-semibold text-foreground"
          id="bookmark-next-heading"
        >
          Next up
        </h2>
        <div className="relative grid size-16 shrink-0 place-items-center">
          <svg
            aria-hidden="true"
            className="absolute inset-0 -rotate-90"
            viewBox="0 0 72 72"
          >
            <circle
              cx="36"
              cy="36"
              fill="none"
              r={radius}
              stroke="color-mix(in oklab, var(--muted-foreground) 18%, transparent)"
              strokeWidth="6"
            />
            <motion.circle
              animate={{
                strokeDasharray: `${share * circumference} ${circumference}`,
              }}
              cx="36"
              cy="36"
              fill="none"
              initial={
                reduceMotion ? false : { strokeDasharray: `0 ${circumference}` }
              }
              r={radius}
              stroke="#22c55e"
              strokeLinecap="round"
              strokeWidth="6"
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
          <span className="text-center leading-none">
            <span className="block font-heading text-sm font-bold text-foreground tabular-nums">
              {Math.round(share * 100)}%
            </span>
            <span className="text-[0.55rem] text-muted-foreground">
              cleared
            </span>
          </span>
        </div>
      </div>
      {next === undefined ? (
        <p className="mt-auto rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Everything here is solved. Save something new to come back to.
        </p>
      ) : (
        <div className="mt-auto pt-4">
          <p
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold',
              days >= 7
                ? 'bg-[#f59e0b]/15 text-[#b45309] dark:text-[#fcd34d]'
                : 'bg-secondary text-secondary-foreground',
            )}
          >
            <Flame aria-hidden="true" className="size-3" />
            {days === 0
              ? 'Saved today'
              : `Waiting ${days} day${days === 1 ? '' : 's'}`}
          </p>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <ProviderLogo className="size-4" provider={next.problem.provider} />
            <span className="font-mono">{next.problem.externalId}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{bookmarkRating(next)}</span>
          </p>
          <p className="mt-1 line-clamp-2 text-lg leading-snug font-semibold text-foreground">
            {next.problem.title}
          </p>
          <div className="mt-3">
            <SolveOnProviderLink
              canonicalUrl={next.problem.canonicalUrl}
              provider={next.problem.provider}
            />
          </div>
        </div>
      )}
    </section>
  )
}
