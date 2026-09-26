import { useState } from 'react'
import type {
  Bookmark,
  LearnerProblemStatus,
  NormalizedDifficulty,
} from '@algomemtor/shared-contracts'
import { motion, useReducedMotion } from 'motion/react'

import { Flame, Search, X } from '@/components/icons/algo-icons'
import { BookmarksIcon } from '@/components/icons/app-icons'
import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { PageHero } from '@/components/kit/PageHero'
import { SegmentedControl } from '@/components/kit/SegmentedControl'
import { cn } from '@/lib/utils'

import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import PageContainer from '@/components/layout/PageContainer'
import { Button } from '@/components/ui/button'
import { SolveOnProviderLink } from '@/features/discovery/components/SolveOnProviderLink'
import { bandColor } from '@/features/discovery/rating-bands'
import { ProblemLearningControls } from '@/features/progress/components/ProblemLearningControls'

import { bookmarkRating, DAY } from '@/features/bookmarks/bookmark-utils'
import {
  BookmarkShelf,
  NextUpCard,
} from '@/features/bookmarks/components/BookmarkShelf'
import {
  useBookmarkFilters,
  useBookmarks,
} from '@/features/bookmarks/hooks/useBookmarks'

const filterField =
  'h-10 min-w-0 rounded-xl border border-input bg-background px-3 text-base font-normal text-foreground outline-none transition-[border-color,box-shadow] hover:border-acc focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 sm:text-sm'

const statusLabels: Record<LearnerProblemStatus, string> = {
  unsolved: 'Unsolved',
  attempted: 'Attempted',
  solved: 'Solved',
}

const statusTone: Record<LearnerProblemStatus, string> = {
  unsolved: 'bg-muted text-muted-foreground',
  attempted: 'bg-sun-soft text-sun-foreground',
  solved: 'bg-go-soft text-go-foreground',
}

const difficultyColor: Record<NormalizedDifficulty, string> = {
  easy: '#22c55e',
  medium: '#f59e0b',
  hard: '#ef4444',
}

const difficultyLabels: Record<NormalizedDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

const providerNames = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
} as const

function savedAgo(createdAt: string, now: number) {
  const days = Math.floor((now - new Date(createdAt).getTime()) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

// A saved problem as a book: a spine in its rating colour down the left
// edge, the key facts in one line, and the actions at the foot.
function BookmarkCard({
  bookmark,
  index,
  now,
  highlighted,
}: {
  bookmark: Bookmark
  index: number
  now: number
  highlighted: boolean
}) {
  const { problem } = bookmark
  const status = problem.learnerStatus ?? 'unsolved'
  const reduceMotion = useReducedMotion()
  const rating = bookmarkRating(bookmark)
  const spine = bandColor(rating)
  const waitingDays = Math.floor(
    (now - new Date(bookmark.createdAt).getTime()) / DAY,
  )
  const stale = status !== 'solved' && waitingDays >= 7

  return (
    <motion.li
      animate={{ opacity: 1, y: 0 }}
      className="min-w-0 scroll-mt-28"
      id={`bookmark-${bookmark.id}`}
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      transition={{
        duration: 0.55,
        ease: [0.16, 1, 0.3, 1],
        delay: Math.min(index, 8) * 0.05,
      }}
    >
      <article
        className={cn(
          'group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-card pl-2 shadow-soft transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:shadow-lift',
          highlighted
            ? 'border-foreground shadow-[0_0_0_4px_color-mix(in_oklab,var(--foreground)_14%,transparent)]'
            : 'border-border',
        )}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-2 transition-[width] duration-300 group-hover:w-2.5"
          style={{
            background: `linear-gradient(180deg, ${spine}, color-mix(in oklab, ${spine} 65%, #000))`,
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
          <header className="flex min-w-0 items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <ProviderLogo className="size-4" provider={problem.provider} />
                <span>{providerNames[problem.provider]}</span>
                <span className="font-mono">{problem.externalId}</span>
              </p>
              <h2 className="mt-1.5 line-clamp-2 text-base leading-snug font-semibold break-words text-card-foreground">
                {problem.title}
              </h2>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium',
                statusTone[status],
              )}
            >
              {statusLabels[status]}
            </span>
          </header>

          <dl className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <div className="inline-flex items-center gap-1.5">
              <dt className="sr-only">Rating</dt>
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: spine }}
              />
              <dd className="font-mono font-semibold text-foreground">
                {problem.providerDifficulty ?? '—'}
              </dd>
            </div>
            {problem.normalizedDifficulty ? (
              <div>
                <dt className="sr-only">Difficulty</dt>
                <dd
                  className="font-semibold"
                  style={{
                    color: difficultyColor[problem.normalizedDifficulty],
                  }}
                >
                  {difficultyLabels[problem.normalizedDifficulty]}
                </dd>
              </div>
            ) : null}
            <div className="text-muted-foreground">
              <dt className="sr-only">Saved</dt>
              <dd>
                Saved{' '}
                <time dateTime={bookmark.createdAt}>
                  {savedAgo(bookmark.createdAt, now)}
                </time>
              </dd>
            </div>
            {stale ? (
              <div className="inline-flex items-center gap-1 rounded-full bg-[#f59e0b]/15 px-2 py-0.5 font-medium text-[#b45309] dark:text-[#fcd34d]">
                <dt className="sr-only">Waiting</dt>
                <Flame aria-hidden="true" className="size-3" />
                <dd>Waiting {waitingDays}d</dd>
              </div>
            ) : null}
          </dl>

          {problem.topics.length > 0 ? (
            <ul aria-label="Topics" className="flex min-w-0 flex-wrap gap-1.5">
              {problem.topics.map((topic) => (
                <li
                  className="max-w-full rounded-full bg-acc-soft px-2.5 py-0.5 text-[0.7rem] font-medium break-words text-acc-ink"
                  key={topic}
                >
                  {topic}
                </li>
              ))}
            </ul>
          ) : null}

          <footer className="mt-auto flex min-w-0 flex-wrap items-center gap-2 border-t border-border pt-3">
            <SolveOnProviderLink
              canonicalUrl={problem.canonicalUrl}
              provider={problem.provider}
            />
            <ProblemLearningControls
              compact
              initialBookmarked
              initialStatus={status}
              problem={{
                provider: problem.provider,
                externalId: problem.externalId,
              }}
            />
          </footer>
        </div>
      </article>
    </motion.li>
  )
}

function BookmarksPage() {
  const { clear, hasActiveFilters, query, setPage, update } =
    useBookmarkFilters()
  const bookmarksQuery = useBookmarks(query)
  const bookmarks = bookmarksQuery.data?.data ?? []
  const metadata = bookmarksQuery.data?.meta
  const reduceMotion = useReducedMotion()
  const [now] = useState(() => Date.now())
  const [highlighted, setHighlighted] = useState<string | null>(null)

  function openBookmark(id: string) {
    document.getElementById(`bookmark-${id}`)?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'center',
    })
    setHighlighted(id)
    window.setTimeout(
      () => setHighlighted((current) => (current === id ? null : current)),
      1800,
    )
  }

  let content

  if (bookmarksQuery.isPending) {
    content = <PageSkeleton label="Loading bookmarks" rows={4} />
  } else if (bookmarksQuery.isError) {
    content = (
      <ErrorState
        message={
          bookmarksQuery.error instanceof Error
            ? bookmarksQuery.error.message
            : 'Bookmarks could not be loaded.'
        }
        onRetry={() => void bookmarksQuery.refetch()}
        title="Unable to load bookmarks"
      />
    )
  } else if (bookmarks.length === 0) {
    content = (
      <EmptyState
        action={
          hasActiveFilters ? (
            <Button onClick={clear} type="button" variant="outline">
              Clear filters
            </Button>
          ) : undefined
        }
        description={
          hasActiveFilters
            ? 'No saved problems match the current filters.'
            : 'Use Bookmark on a problem card to keep a provider link here.'
        }
        title={hasActiveFilters ? 'No matching bookmarks' : 'No bookmarks yet'}
      />
    )
  } else {
    content = (
      <div className="space-y-5">
        <ul className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {bookmarks.map((bookmark, index) => (
            <BookmarkCard
              bookmark={bookmark}
              highlighted={highlighted === bookmark.id}
              index={index}
              key={bookmark.id}
              now={now}
            />
          ))}
        </ul>
        {metadata && metadata.totalPages > 1 ? (
          <nav
            aria-label="Bookmarks pagination"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-2.5 pl-4"
          >
            <p className="text-sm text-muted-foreground">
              Page {metadata.page} of {metadata.totalPages} · {metadata.total}{' '}
              saved
            </p>
            <div className="flex gap-2">
              <Button
                disabled={metadata.page <= 1}
                onClick={() => setPage(metadata.page - 1)}
                size="sm"
                type="button"
                variant="outline"
              >
                Previous
              </Button>
              <Button
                disabled={metadata.page >= metadata.totalPages}
                onClick={() => setPage(metadata.page + 1)}
                size="sm"
                type="button"
                variant="outline"
              >
                Next
              </Button>
            </div>
          </nav>
        ) : null}
      </div>
    )
  }

  return (
    <PageContainer accent="amber" className="gap-6">
      <PageHero
        eyebrow="Saved for later"
        icon={BookmarksIcon}
        info="Bookmarks keep a link to problems you chose to return to. Saving never copies provider problem content into AlgoMemtor."
        subtitle="Problems you chose to come back to."
        title="Bookmarks"
      />

      {metadata && metadata.total > 0 && bookmarks.length > 0 ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <BookmarkShelf
            bookmarks={bookmarks}
            onOpen={openBookmark}
            total={metadata.total}
          />
          <NextUpCard bookmarks={bookmarks} now={now} />
        </div>
      ) : null}

      <section
        aria-labelledby="bookmark-filters-heading"
        className="min-w-0 rounded-3xl border border-border bg-card p-3 shadow-soft sm:p-4"
      >
        <h2 className="sr-only" id="bookmark-filters-heading">
          Find a saved problem
        </h2>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-60">
            <span className="sr-only">Search</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className={cn(filterField, 'w-full pl-10')}
              onChange={(event) =>
                update({ search: event.currentTarget.value || null })
              }
              placeholder="Title or ID"
              value={query.search ?? ''}
            />
          </label>
          <SegmentedControl
            label="Status"
            onChange={(value) =>
              update({
                status: value === 'all' ? null : value,
              })
            }
            options={[
              { value: 'all', label: 'Any status' },
              { value: 'unsolved', label: 'Unsolved' },
              { value: 'attempted', label: 'Attempted' },
              { value: 'solved', label: 'Solved' },
            ]}
            size="sm"
            value={query.status ?? 'all'}
          />
          <SegmentedControl
            label="Difficulty"
            onChange={(value) =>
              update({
                difficulty: value === 'all' ? null : value,
              })
            }
            options={[
              { value: 'all', label: 'All' },
              ...(['easy', 'medium', 'hard'] as const).map((value) => ({
                value,
                label: difficultyLabels[value],
                icon: (
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ background: difficultyColor[value] }}
                  />
                ),
              })),
            ]}
            size="sm"
            value={query.difficulty ?? 'all'}
          />
          <label className="min-w-0 basis-40">
            <span className="sr-only">Topic</span>
            <input
              className={cn(filterField, 'w-full')}
              onChange={(event) =>
                update({ topic: event.currentTarget.value || null })
              }
              placeholder="Topic, e.g. graphs"
              value={query.topic ?? ''}
            />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Sort</span>
            <select
              className={filterField}
              onChange={(event) =>
                update({
                  sort: event.currentTarget.value as typeof query.sort,
                })
              }
              value={query.sort}
            >
              <option value="newest">Newest saved</option>
              <option value="difficulty">Difficulty</option>
              <option value="title">Title</option>
            </select>
          </label>
          {hasActiveFilters ? (
            <Button onClick={clear} size="sm" type="button" variant="ghost">
              <X aria-hidden="true" />
              Clear
            </Button>
          ) : null}
        </div>
      </section>

      {content}
    </PageContainer>
  )
}

export default BookmarksPage
