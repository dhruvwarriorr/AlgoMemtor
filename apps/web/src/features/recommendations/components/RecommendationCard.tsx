import type {
  LearnerProblemStatus,
  RecommendationDifficultyFeedback,
  RecommendationItem,
  RecommendationUsefulness,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import { Lightbulb } from '@/components/icons/algo-icons'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { SolveOnProviderLink } from '@/features/discovery/components/SolveOnProviderLink'
import { ProblemLearningControls } from '@/features/progress/components/ProblemLearningControls'

import { useRecommendationImpression } from '../hooks/useRecommendationImpression'

type RecommendationCardProps = {
  item: RecommendationItem
  isFeedbackPending: boolean
  isDismissPending: boolean
  onFeedback: (input: {
    usefulness?: RecommendationUsefulness
    perceivedDifficulty?: RecommendationDifficultyFeedback
  }) => void
  onDismiss: () => void
}

const difficultyLabels = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
} as const

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

const difficultyTone = {
  easy: 'bg-go-soft text-go-foreground',
  medium: 'bg-sun-soft text-sun-foreground',
  hard: 'bg-danger-soft text-danger-foreground',
} as const

const providerLabels: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
}

export function RecommendationCard({
  item,
  isDismissPending,
  isFeedbackPending,
  onDismiss,
  onFeedback,
}: RecommendationCardProps) {
  const { problem } = item
  const visibleTags = problem.providerTags.slice(0, 4)
  const cardRef = useRecommendationImpression({
    externalId: problem.externalId,
    provider: problem.provider,
    recommendationItemId: item.id,
  })

  return (
    <article
      className="flex min-w-0 flex-col gap-5 rounded-xl border border-border bg-card p-5 transition-colors duration-300 hover:border-[color-mix(in_oklab,var(--primary)_30%,var(--border))] sm:p-6"
      ref={cardRef}
    >
      <header className="space-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary py-1 pr-2.5 pl-1.5 font-medium text-secondary-foreground">
            <ProviderLogo className="size-4" provider={problem.provider} />
            {providerLabels[problem.provider]}
          </span>
          <span className="break-all font-mono text-muted-foreground">
            {problem.externalId}
          </span>
          {problem.learnerStatus ? (
            <span
              className={cn(
                'ml-auto rounded-md px-2.5 py-1 font-medium',
                statusTone[problem.learnerStatus],
              )}
            >
              {statusLabels[problem.learnerStatus]}
            </span>
          ) : null}
        </div>
        <h2 className="break-words text-xl leading-snug font-semibold text-card-foreground">
          {problem.title}
        </h2>
      </header>

      <p className="flex gap-3 rounded-2xl bg-sun-soft p-4 text-sm leading-6 text-foreground ring-1 ring-sun/45">
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-md bg-sun text-[#101012]"
        >
          <Lightbulb className="size-3.5" strokeWidth={2.5} />
        </span>
        <span>
          <span className="font-semibold">Why this fits: </span>
          {item.reason}
        </span>
      </p>

      <dl className="flex flex-wrap gap-2 text-xs">
        {problem.providerDifficulty !== undefined ? (
          <div className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1">
            <dt className="text-muted-foreground">Rating:</dt>
            <dd className="font-mono font-medium text-foreground">
              {problem.providerDifficulty}
            </dd>
          </div>
        ) : null}
        {problem.normalizedDifficulty ? (
          <div
            className={cn(
              'flex items-center gap-1 rounded-md px-2.5 py-1',
              difficultyTone[problem.normalizedDifficulty],
            )}
          >
            <dt className="sr-only">Difficulty:</dt>
            <dd className="font-medium">
              {difficultyLabels[problem.normalizedDifficulty]}
            </dd>
          </div>
        ) : null}
        {problem.solvedCount !== undefined ? (
          <div className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1">
            <dt className="text-muted-foreground">Solved by:</dt>
            <dd className="font-mono font-medium text-foreground">
              {problem.solvedCount.toLocaleString()}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="space-y-3">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Topics</p>
          <ul aria-label="Topics" className="flex flex-wrap gap-1.5">
            {problem.topics.map((topic) => (
              <li
                className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary dark:bg-primary/15"
                key={topic}
              >
                {topic}
              </li>
            ))}
          </ul>
        </div>

        {visibleTags.length > 0 ? (
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Provider tags</p>
            <ul aria-label="Provider tags" className="flex flex-wrap gap-1.5">
              {visibleTags.map((tag) => (
                <li
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground"
                  key={tag}
                >
                  {tag}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-2xl bg-muted/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Was this useful?
          </span>
          <Button
            aria-pressed={item.feedback?.usefulness === 'useful'}
            disabled={isFeedbackPending}
            onClick={() => onFeedback({ usefulness: 'useful' })}
            size="sm"
            type="button"
            variant={item.feedback?.usefulness === 'useful' ? 'ink' : 'outline'}
          >
            Useful
          </Button>
          <Button
            aria-pressed={item.feedback?.usefulness === 'not_useful'}
            disabled={isFeedbackPending}
            onClick={() => onFeedback({ usefulness: 'not_useful' })}
            size="sm"
            type="button"
            variant={
              item.feedback?.usefulness === 'not_useful' ? 'ink' : 'outline'
            }
          >
            Not useful
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Difficulty felt:
          </span>
          {(
            [
              ['too_easy', 'Too easy'],
              ['about_right', 'About right'],
              ['too_hard', 'Too hard'],
            ] as const
          ).map(([value, label]) => (
            <Button
              aria-pressed={item.feedback?.perceivedDifficulty === value}
              disabled={isFeedbackPending}
              key={value}
              onClick={() => onFeedback({ perceivedDifficulty: value })}
              size="sm"
              type="button"
              variant={
                item.feedback?.perceivedDifficulty === value ? 'ink' : 'outline'
              }
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <footer className="mt-auto flex min-w-0 flex-col gap-4 border-t border-border pt-5">
        <ProblemLearningControls
          compact
          initialBookmarked={
            (problem as typeof problem & { bookmarked?: boolean }).bookmarked ??
            false
          }
          initialStatus={problem.learnerStatus ?? 'unsolved'}
          problem={{
            provider: problem.provider,
            externalId: problem.externalId,
          }}
          recommendationItemId={item.id}
          sourceContext="recommendation"
        />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SolveOnProviderLink
            canonicalUrl={problem.canonicalUrl}
            provider={problem.provider}
          />
          <Button
            aria-label={`Dismiss ${problem.title}`}
            className="ml-auto"
            disabled={isDismissPending}
            onClick={onDismiss}
            size="sm"
            type="button"
            variant="ghost"
          >
            Dismiss
          </Button>
        </div>
      </footer>
    </article>
  )
}
