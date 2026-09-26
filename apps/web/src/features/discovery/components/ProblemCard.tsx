import type {
  ExternalProblemSummary,
  LearnerProblemStatus,
  NormalizedDifficulty,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { useNotification } from '@/app/useNotification'
import { X } from '@/components/icons/algo-icons'
import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { SpotlightCard } from '@/components/kit/surfaces'
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

const difficultyColor: Record<NormalizedDifficulty, string> = {
  easy: '#22c55e',
  medium: '#f59e0b',
  hard: '#ef4444',
}

type ProblemCardProps = {
  problem: ExternalProblemSummary
  index?: number
}

export function ProblemCard({ problem, index = 0 }: ProblemCardProps) {
  const { notify } = useNotification()
  const dismissProblem = useDismissProblem()
  const [dismissed, setDismissed] = useState(false)
  const reduceMotion = useReducedMotion()
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

  const tone = problem.normalizedDifficulty
    ? difficultyColor[problem.normalizedDifficulty]
    : 'var(--muted-foreground)'

  return (
    <motion.li
      animate={{ opacity: 1, y: 0 }}
      className="min-w-0"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      transition={{
        duration: 0.45,
        ease: [0.16, 1, 0.3, 1],
        delay: Math.min(index, 8) * 0.035,
      }}
    >
      <SpotlightCard
        as="article"
        className={cn(
          'group/card relative flex min-w-0 flex-col gap-4 overflow-hidden p-4 pl-5 transition-[transform,box-shadow,opacity] duration-300 hover:shadow-lift md:flex-row md:items-center md:gap-5',
          dismissed && 'opacity-55',
        )}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-3 left-0 w-1 rounded-r-full"
          style={{ background: tone }}
        />
        <dl className="flex shrink-0 items-center gap-3 md:w-24 md:flex-col md:items-start md:gap-0.5">
          <div>
            <dt className="sr-only">Provider rating:</dt>
            <dd className="font-mono text-2xl leading-none font-bold text-foreground tabular-nums">
              {problem.providerDifficulty ?? '—'}
            </dd>
          </div>
          {problem.normalizedDifficulty ? (
            <div>
              <dt className="sr-only">Difficulty:</dt>
              <dd
                className="text-[0.68rem] font-semibold tracking-wide uppercase"
                style={{ color: tone }}
              >
                {difficultyLabels[problem.normalizedDifficulty]}
              </dd>
            </div>
          ) : null}
          {problem.solvedCount !== undefined ? (
            <div>
              <dt className="sr-only">Solved by:</dt>
              <dd className="font-mono text-[0.68rem] text-muted-foreground">
                {problem.solvedCount.toLocaleString()} solves
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
              <ProviderLogo className="size-3.5" provider={problem.provider} />
              {providerLabels[problem.provider]}
            </span>
            <span className="font-mono break-all text-muted-foreground">
              {problem.externalId}
            </span>
            {problem.learnerStatus ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[0.7rem] font-medium',
                  statusTone[problem.learnerStatus],
                )}
              >
                {statusLabels[problem.learnerStatus]}
              </span>
            ) : null}
          </div>
          <h2 className="mt-1 text-[1.05rem] leading-snug font-semibold break-words text-card-foreground">
            {problem.title}
          </h2>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
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
            <ul
              aria-label="Provider tags"
              className="flex min-w-0 flex-wrap gap-1.5"
            >
              {visibleProviderTags.map((tag) => (
                <li
                  className="max-w-full rounded-full border border-border px-2 py-0.5 text-[0.7rem] break-words text-muted-foreground"
                  key={tag}
                >
                  #{tag}
                </li>
              ))}
              {hiddenProviderTagCount > 0 ? (
                <li
                  className="rounded-full border border-dashed border-border px-2 py-0.5 text-[0.7rem] text-muted-foreground"
                  title={problem.providerTags.slice(4).join(', ')}
                >
                  +{hiddenProviderTagCount} more
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <footer className="flex min-w-0 flex-wrap items-center gap-2 md:shrink-0 md:justify-end">
          <ProblemLearningControls
            compact
            initialBookmarked={
              (problem as typeof problem & { bookmarked?: boolean })
                .bookmarked ?? false
            }
            initialStatus={problem.learnerStatus ?? 'unsolved'}
            problem={{
              provider: problem.provider,
              externalId: problem.externalId,
            }}
          />
          <SolveOnProviderLink
            canonicalUrl={problem.canonicalUrl}
            provider={problem.provider}
          />
          <Button
            aria-label={`Dismiss ${problem.title}`}
            disabled={dismissed || dismissProblem.isPending}
            onClick={() => void handleDismiss()}
            size={dismissed ? 'sm' : 'icon-sm'}
            title={dismissed ? undefined : 'Dismiss'}
            type="button"
            variant="ghost"
          >
            {dismissed ? 'Dismissed' : <X aria-hidden="true" />}
          </Button>
        </footer>
      </SpotlightCard>
    </motion.li>
  )
}
