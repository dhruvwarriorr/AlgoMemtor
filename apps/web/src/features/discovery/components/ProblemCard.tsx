import type {
  ExternalProblemSummary,
  LearnerProblemStatus,
  NormalizedDifficulty,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import { useNotification } from '@/app/useNotification'
import { Button } from '@/components/ui/button'

import { SolveOnProviderLink } from './SolveOnProviderLink'

const providerLabels: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
}

const difficultyLabels: Record<NormalizedDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

const statusLabels: Record<LearnerProblemStatus, string> = {
  unsolved: 'Unsolved',
  attempted: 'Attempted',
  solved: 'Solved',
}

type ProblemCardProps = {
  problem: ExternalProblemSummary
}

export function ProblemCard({ problem }: ProblemCardProps) {
  const { notify } = useNotification()
  const visibleProviderTags = problem.providerTags.slice(0, 4)
  const hiddenProviderTagCount = Math.max(
    0,
    problem.providerTags.length - visibleProviderTags.length,
  )

  function showPlaceholder(action: 'bookmark' | 'dismiss') {
    notify({
      title: `${action === 'bookmark' ? 'Bookmarking' : 'Dismissing'} is coming later`,
      description:
        'This control is a placeholder and has not changed or saved the problem.',
      tone: 'info',
    })
  }

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <header className="min-w-0 space-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {providerLabels[problem.provider]}
          </span>
          <span aria-hidden="true">•</span>
          <span className="break-all">{problem.externalId}</span>
          {problem.learnerStatus ? (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
              {statusLabels[problem.learnerStatus]}
            </span>
          ) : null}
        </div>
        <h2 className="break-words text-lg font-semibold leading-snug text-card-foreground">
          {problem.title}
        </h2>
      </header>

      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {problem.providerDifficulty !== undefined ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Provider rating:</dt>
            <dd className="font-medium text-foreground">
              {problem.providerDifficulty}
            </dd>
          </div>
        ) : null}
        {problem.normalizedDifficulty ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Difficulty:</dt>
            <dd className="font-medium text-foreground">
              {difficultyLabels[problem.normalizedDifficulty]}
            </dd>
          </div>
        ) : null}
        {problem.solvedCount !== undefined ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Solved by:</dt>
            <dd className="font-medium text-foreground">
              {problem.solvedCount.toLocaleString()}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="min-w-0 space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Topics
          </p>
          <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label="Topics">
            {problem.topics.map((topic) => (
              <li
                className="max-w-full break-words rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
                key={topic}
              >
                {topic}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Provider tags
          </p>
          <ul
            className="flex min-w-0 flex-wrap gap-1.5"
            aria-label="Provider tags"
          >
            {visibleProviderTags.map((tag) => (
              <li
                className="max-w-full break-words rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
                key={tag}
              >
                {tag}
              </li>
            ))}
            {hiddenProviderTagCount > 0 ? (
              <li className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                +{hiddenProviderTagCount} more
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <footer className="mt-auto flex min-w-0 flex-wrap items-center gap-2 border-t border-border pt-4">
        <SolveOnProviderLink
          canonicalUrl={problem.canonicalUrl}
          provider={problem.provider}
        />
        <Button
          aria-label={`Bookmark ${problem.title}`}
          onClick={() => showPlaceholder('bookmark')}
          size="sm"
          type="button"
          variant="outline"
        >
          Bookmark
        </Button>
        <Button
          aria-label={`Dismiss ${problem.title}`}
          onClick={() => showPlaceholder('dismiss')}
          size="sm"
          type="button"
          variant="ghost"
        >
          Dismiss
        </Button>
      </footer>
    </article>
  )
}
