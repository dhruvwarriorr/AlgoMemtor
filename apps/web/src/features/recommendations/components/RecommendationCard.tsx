import type {
  LearnerProblemStatus,
  RecommendationDifficultyFeedback,
  RecommendationItem,
  RecommendationUsefulness,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import { Button } from '@/components/ui/button'

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

const providerLabels: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
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
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
      ref={cardRef}
    >
      <header className="space-y-2">
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

      <p className="rounded-lg bg-muted/50 p-3 text-sm leading-6 text-foreground">
        <span className="font-semibold">Why this fits: </span>
        {item.reason}
      </p>

      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {problem.providerDifficulty !== undefined ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Rating:</dt>
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

      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Topics
          </p>
          <ul aria-label="Topics" className="flex flex-wrap gap-1.5">
            {problem.topics.map((topic) => (
              <li
                className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
                key={topic}
              >
                {topic}
              </li>
            ))}
          </ul>
        </div>

        {visibleTags.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Provider tags
            </p>
            <ul aria-label="Provider tags" className="flex flex-wrap gap-1.5">
              {visibleTags.map((tag) => (
                <li
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
                  key={tag}
                >
                  {tag}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-border pt-4">
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
            variant={
              item.feedback?.usefulness === 'useful' ? 'secondary' : 'outline'
            }
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
              item.feedback?.usefulness === 'not_useful'
                ? 'secondary'
                : 'outline'
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
                item.feedback?.perceivedDifficulty === value
                  ? 'secondary'
                  : 'outline'
              }
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <footer className="flex min-w-0 flex-wrap items-center gap-2">
        <SolveOnProviderLink
          canonicalUrl={problem.canonicalUrl}
          externalId={problem.externalId}
          provider={problem.provider}
          recommendationItemId={item.id}
          sourceContext="recommendation"
        />
        <ProblemLearningControls
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
        <Button
          aria-label={`Dismiss ${problem.title}`}
          disabled={isDismissPending}
          onClick={onDismiss}
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
