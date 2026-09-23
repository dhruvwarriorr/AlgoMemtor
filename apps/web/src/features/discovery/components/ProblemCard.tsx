import type {
  ExternalProblemSummary,
  LearnerProblemStatus,
  NormalizedDifficulty,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import { useState } from 'react'

import { useNotification } from '@/app/useNotification'
import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { Button } from '@/components/ui/button'
import { ApiClientError } from '@/features/discovery/api/client'
import { ProblemLearningControls } from '@/features/progress/components/ProblemLearningControls'
import { useDismissProblem } from '@/features/recommendations/hooks/useRecommendations'
import { cn } from '@/lib/utils'

import { SolveOnProviderLink } from './SolveOnProviderLink'

const providerLabels: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
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

const statusTone: Record<LearnerProblemStatus, string> = {
  unsolved: 'bg-muted text-muted-foreground',
  attempted: 'bg-sun-soft text-sun-foreground',
  solved: 'bg-go-soft text-go-foreground',
}

const difficultyTone: Record<NormalizedDifficulty, string> = {
  easy: 'bg-go-soft text-go-foreground',
  medium: 'bg-sun-soft text-sun-foreground',
  hard: 'bg-danger-soft text-danger-foreground',
}

type ProblemCardProps = {
  problem: ExternalProblemSummary
}

export function ProblemCard({ problem }: ProblemCardProps) {
  const { notify } = useNotification()
  const dismissProblem = useDismissProblem()
  const [dismissed, setDismissed] = useState(false)
  const visibleProviderTags = problem.providerTags.slice(0, 4)
  const hiddenProviderTagCount = Math.max(
    0,
    problem.providerTags.length - visibleProviderTags.length,
  )

  async function handleDismiss() {
    try {
      await dismissProblem.mutateAsync({
        provider: problem.provider,
        externalId: problem.externalId,
      })
      setDismissed(true)
      notify({
        title: 'Problem dismissed',
        description: "We won't recommend this problem again.",
        tone: 'success',
      })
    } catch (error) {
      notify({
        title: 'Could not dismiss this problem',
        description:
          error instanceof ApiClientError
            ? error.message
            : 'Something went wrong. Try again.',
        tone: 'error',
      })
    }
  }

  return (
    <article className="group/card flex min-w-0 flex-col gap-5 rounded-xl border border-border bg-card p-5 transition-[border-color,transform] duration-300 hover:border-[color-mix(in_oklab,var(--primary)_30%,var(--border))] sm:p-6">
      <header className="min-w-0 space-y-3">
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

      <dl className="flex flex-wrap gap-2 text-xs">
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
        {problem.providerDifficulty !== undefined ? (
          <div className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1">
            <dt className="text-muted-foreground">Provider rating:</dt>
            <dd className="font-mono font-medium text-foreground">
              {problem.providerDifficulty}
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

      <div className="min-w-0 space-y-3">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Topics</p>
          <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label="Topics">
            {problem.topics.map((topic) => (
              <li
                className="max-w-full break-words rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary dark:bg-primary/15"
                key={topic}
              >
                {topic}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-xs text-muted-foreground">Provider tags</p>
          <ul
            className="flex min-w-0 flex-wrap gap-1.5"
            aria-label="Provider tags"
          >
            {visibleProviderTags.map((tag) => (
              <li
                className="max-w-full break-words rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground"
                key={tag}
              >
                {tag}
              </li>
            ))}
            {hiddenProviderTagCount > 0 ? (
              <li className="rounded-md border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
                +{hiddenProviderTagCount} more
              </li>
            ) : null}
          </ul>
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
        />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SolveOnProviderLink
            canonicalUrl={problem.canonicalUrl}
            provider={problem.provider}
          />
          <Button
            aria-label={`Dismiss ${problem.title}`}
            className="ml-auto"
            disabled={dismissed || dismissProblem.isPending}
            onClick={() => void handleDismiss()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {dismissed ? 'Dismissed' : 'Dismiss'}
          </Button>
        </div>
      </footer>
    </article>
  )
}
