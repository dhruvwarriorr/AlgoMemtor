import type {
  Bookmark,
  LearnerProblemStatus,
  NormalizedDifficulty,
} from '@algomemtor/shared-contracts'

import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { SolveOnProviderLink } from '@/features/discovery/components/SolveOnProviderLink'
import { ProblemLearningControls } from '@/features/progress/components/ProblemLearningControls'

import {
  useBookmarkFilters,
  useBookmarks,
} from '@/features/bookmarks/hooks/useBookmarks'

const statusLabels: Record<LearnerProblemStatus, string> = {
  unsolved: 'Unsolved',
  attempted: 'Attempted',
  solved: 'Solved',
}

function BookmarkCard({ bookmark }: { bookmark: Bookmark }) {
  const { problem } = bookmark

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <header className="min-w-0 space-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Codeforces</span>
          <span aria-hidden="true">•</span>
          <span className="break-all">{problem.externalId}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
            {statusLabels[problem.learnerStatus ?? 'unsolved']}
          </span>
        </div>
        <h2 className="break-words text-lg font-semibold leading-snug text-card-foreground">
          {problem.title}
        </h2>
      </header>

      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {problem.normalizedDifficulty ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Difficulty:</dt>
            <dd className="font-medium text-foreground">
              {problem.normalizedDifficulty}
            </dd>
          </div>
        ) : null}
        {problem.providerDifficulty !== undefined ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Rating:</dt>
            <dd className="font-medium text-foreground">
              {problem.providerDifficulty}
            </dd>
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Saved:</dt>
          <dd className="font-medium text-foreground">
            <time dateTime={bookmark.createdAt}>
              {new Date(bookmark.createdAt).toLocaleDateString()}
            </time>
          </dd>
        </div>
      </dl>

      <ul aria-label="Topics" className="flex min-w-0 flex-wrap gap-1.5">
        {problem.topics.map((topic) => (
          <li
            className="max-w-full break-words rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
            key={topic}
          >
            {topic}
          </li>
        ))}
      </ul>

      <footer className="mt-auto flex min-w-0 flex-wrap items-center gap-2 border-t border-border pt-4">
        <SolveOnProviderLink
          canonicalUrl={problem.canonicalUrl}
          externalId={problem.externalId}
          provider={problem.provider}
        />
        <ProblemLearningControls
          initialBookmarked
          initialStatus={problem.learnerStatus ?? 'unsolved'}
          problem={{
            provider: problem.provider,
            externalId: problem.externalId,
          }}
        />
      </footer>
    </article>
  )
}

function BookmarksPage() {
  const { clear, hasActiveFilters, query, setPage, update } =
    useBookmarkFilters()
  const bookmarksQuery = useBookmarks(query)
  const bookmarks = bookmarksQuery.data?.data ?? []
  const metadata = bookmarksQuery.data?.meta

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
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {bookmarks.map((bookmark) => (
            <BookmarkCard bookmark={bookmark} key={bookmark.id} />
          ))}
        </div>
        {metadata && metadata.totalPages > 1 ? (
          <nav
            aria-label="Bookmarks pagination"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
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
    <PageContainer>
      <PageHeader
        description="Return to external problems you intentionally saved for later. Saving never copies provider problem content into AlgoMemtor."
        title="Bookmarks"
      />

      <section
        aria-labelledby="bookmark-filters-heading"
        className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <div>
          <h2
            className="text-base font-semibold text-foreground"
            id="bookmark-filters-heading"
          >
            Find a saved problem
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Filters are kept in the URL so this view can be shared or refreshed.
          </p>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="min-w-0 space-y-1.5 text-sm font-medium text-foreground">
            Search
            <input
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              onChange={(event) =>
                update({ search: event.currentTarget.value || null })
              }
              placeholder="Title or ID"
              value={query.search ?? ''}
            />
          </label>
          <label className="min-w-0 space-y-1.5 text-sm font-medium text-foreground">
            Topic
            <input
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              onChange={(event) =>
                update({ topic: event.currentTarget.value || null })
              }
              placeholder="e.g. graphs"
              value={query.topic ?? ''}
            />
          </label>
          <label className="min-w-0 space-y-1.5 text-sm font-medium text-foreground">
            Status
            <select
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              onChange={(event) =>
                update({
                  status: event.currentTarget.value
                    ? (event.currentTarget.value as LearnerProblemStatus)
                    : null,
                })
              }
              value={query.status ?? ''}
            >
              <option value="">Any status</option>
              <option value="unsolved">Unsolved</option>
              <option value="attempted">Attempted</option>
              <option value="solved">Solved</option>
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-sm font-medium text-foreground">
            Difficulty
            <select
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              onChange={(event) =>
                update({
                  difficulty: event.currentTarget.value
                    ? (event.currentTarget.value as NormalizedDifficulty)
                    : null,
                })
              }
              value={query.difficulty ?? ''}
            >
              <option value="">Any difficulty</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-sm font-medium text-foreground">
            Sort
            <select
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
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
        </div>
        {hasActiveFilters ? (
          <Button onClick={clear} size="sm" type="button" variant="ghost">
            Clear filters
          </Button>
        ) : null}
      </section>

      {content}
    </PageContainer>
  )
}

export default BookmarksPage
