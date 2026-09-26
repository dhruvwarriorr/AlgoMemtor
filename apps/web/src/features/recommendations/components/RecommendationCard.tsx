import type {
  LearnerProblemStatus,
  RecommendationDifficultyFeedback,
  RecommendationItem,
  RecommendationUsefulness,
  ProviderKey,
} from '@algomemtor/shared-contracts'
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { Check, Lightbulb, X } from '@/components/icons/algo-icons'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { ArcGauge } from '@/components/kit/charts'
import { SpotlightCard } from '@/components/kit/surfaces'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { SolveOnProviderLink } from '@/features/discovery/components/SolveOnProviderLink'
import { ProblemLearningControls } from '@/features/progress/components/ProblemLearningControls'

import { useRecommendationImpression } from '../hooks/useRecommendationImpression'

type RecommendationCardProps = {
  item: RecommendationItem
  index?: number
  // The day's first pick gets a wider, lit layout.
  featured?: boolean
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

const difficultyColor = {
  easy: '#22c55e',
  medium: '#f59e0b',
  hard: '#ef4444',
} as const

const providerLabels: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
}

// Codeforces-style ratings run to about 3500; other providers' numbers are
// shown as they are, with the arc only as a rough sense of height.
const RATING_CEILING = 3500
const difficultyHeight = { easy: 0.3, medium: 0.6, hard: 0.9 } as const

function FeedbackPill({
  pressed,
  disabled,
  onClick,
  children,
  label,
}: {
  pressed: boolean
  disabled: boolean
  onClick: () => void
  children: ReactNode
  label?: string
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        pressed
          ? 'bg-ink text-ink-foreground shadow-soft'
          : 'text-muted-foreground hover:bg-card hover:text-foreground',
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function RecommendationCard({
  item,
  index = 0,
  featured = false,
  isDismissPending,
  isFeedbackPending,
  onDismiss,
  onFeedback,
}: RecommendationCardProps) {
  const { problem } = item
  const reduceMotion = useReducedMotion()
  const cardRef = useRecommendationImpression({
    externalId: problem.externalId,
    provider: problem.provider,
    recommendationItemId: item.id,
  })
  const rating = problem.providerDifficulty
  const tone = problem.normalizedDifficulty
    ? difficultyColor[problem.normalizedDifficulty]
    : 'var(--acc)'

  const gauge = (
    <ArcGauge
      className={featured ? 'size-28 shrink-0' : 'size-[4.5rem] shrink-0'}
      color={tone}
      value={
        typeof rating === 'number'
          ? rating / RATING_CEILING
          : problem.normalizedDifficulty
            ? difficultyHeight[problem.normalizedDifficulty]
            : 0
      }
    >
      <span
        className={cn(
          'block font-mono leading-none font-bold text-foreground tabular-nums',
          featured ? 'text-xl' : 'text-sm',
        )}
      >
        {rating ?? '—'}
      </span>
      <span className="sr-only">Rating: </span>
      {problem.normalizedDifficulty ? (
        <span
          className="mt-0.5 block text-[0.62rem] font-semibold tracking-wide uppercase"
          style={{ color: tone }}
        >
          {difficultyLabels[problem.normalizedDifficulty]}
        </span>
      ) : null}
    </ArcGauge>
  )

  const feedback = (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-muted/60 p-1.5 text-xs',
      )}
    >
      <span className="pl-2 font-medium text-muted-foreground">Useful?</span>
      <span className="flex gap-0.5">
        <FeedbackPill
          disabled={isFeedbackPending}
          label="Useful"
          onClick={() => onFeedback({ usefulness: 'useful' })}
          pressed={item.feedback?.usefulness === 'useful'}
        >
          <Check aria-hidden="true" className="size-3" />
        </FeedbackPill>
        <FeedbackPill
          disabled={isFeedbackPending}
          label="Not useful"
          onClick={() => onFeedback({ usefulness: 'not_useful' })}
          pressed={item.feedback?.usefulness === 'not_useful'}
        >
          <X aria-hidden="true" className="size-3" />
        </FeedbackPill>
      </span>
      <span aria-hidden="true" className="h-4 w-px bg-border" />
      <span className="font-medium text-muted-foreground">Felt</span>
      <span className="flex flex-wrap gap-0.5">
        {(
          [
            ['too_easy', 'Too easy', 'Easy'],
            ['about_right', 'About right', 'Right'],
            ['too_hard', 'Too hard', 'Hard'],
          ] as const
        ).map(([value, label, short]) => (
          <FeedbackPill
            disabled={isFeedbackPending}
            key={value}
            label={label}
            onClick={() => onFeedback({ perceivedDifficulty: value })}
            pressed={item.feedback?.perceivedDifficulty === value}
          >
            {short}
          </FeedbackPill>
        ))}
      </span>
    </div>
  )

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn('min-w-0', featured && 'md:col-span-2 xl:col-span-3')}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      transition={{
        duration: 0.55,
        ease: [0.16, 1, 0.3, 1],
        delay: Math.min(index, 6) * 0.06,
      }}
    >
      <div
        className={cn(
          'h-full rounded-2xl transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lift',
          featured && 'beam-frame',
        )}
      >
        <SpotlightCard
          as="article"
          className="group flex h-full min-w-0 flex-col overflow-hidden"
          elementRef={cardRef}
        >
          {/* A strip of the difficulty colour along the top edge. */}
          <span
            aria-hidden="true"
            className="h-1 w-full"
            style={{
              background: `linear-gradient(90deg, ${tone}, color-mix(in oklab, ${tone} 10%, transparent))`,
            }}
          />
          <div
            className={cn(
              'flex min-w-0 flex-1 gap-5 p-5',
              featured
                ? 'flex-col sm:p-6 md:flex-row md:items-center'
                : 'flex-col',
            )}
          >
            {featured ? (
              <div className="flex shrink-0 items-center gap-4 md:flex-col md:items-center md:border-r md:border-border md:pr-6">
                {gauge}
                <span className="rounded-full bg-acc-soft px-2.5 py-0.5 text-[0.7rem] font-semibold text-acc-ink">
                  Top pick today
                </span>
              </div>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <header className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'font-mono leading-none font-bold tracking-tighter text-foreground/15 tabular-nums transition-colors group-hover:text-acc',
                    featured ? 'text-5xl' : 'text-3xl',
                  )}
                >
                  {String(item.position).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border py-0.5 pr-2.5 pl-1 font-medium text-foreground">
                      <ProviderLogo
                        className="size-4"
                        provider={problem.provider}
                      />
                      {providerLabels[problem.provider]}
                    </span>
                    <span className="font-mono break-all text-muted-foreground">
                      {problem.externalId}
                    </span>
                    {problem.learnerStatus ? (
                      <span
                        className={cn(
                          'ml-auto rounded-full px-2.5 py-0.5 font-medium',
                          statusTone[problem.learnerStatus],
                        )}
                      >
                        {statusLabels[problem.learnerStatus]}
                      </span>
                    ) : null}
                  </div>
                  <h2
                    className={cn(
                      'mt-2 leading-snug font-semibold break-words text-card-foreground',
                      featured ? 'text-2xl' : 'text-lg',
                    )}
                  >
                    {problem.title}
                  </h2>
                </div>
              </header>

              <div className="flex min-w-0 items-center gap-4">
                {featured ? null : gauge}
                <div className="min-w-0 flex-1">
                  <p className="flex gap-2 text-sm leading-6 text-foreground">
                    <Lightbulb
                      aria-hidden="true"
                      className="mt-1 size-3.5 shrink-0 text-acc"
                    />
                    <span>
                      <span className="sr-only">Why this fits: </span>
                      {item.reason}
                    </span>
                  </p>
                  <ul
                    aria-label="Topics"
                    className="mt-2.5 flex flex-wrap gap-1.5"
                  >
                    {problem.topics.map((topic) => (
                      <li
                        className="rounded-full bg-acc-soft px-2.5 py-0.5 text-[0.7rem] font-medium text-acc-ink"
                        key={topic}
                      >
                        {topic}
                      </li>
                    ))}
                    {problem.solvedCount !== undefined ? (
                      <li className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                        <span className="sr-only">Solved by: </span>
                        {problem.solvedCount.toLocaleString()} solves
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>

              {featured ? null : feedback}

              <footer
                className={cn(
                  'mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-1',
                  featured && 'gap-3',
                )}
              >
                <div className="order-1 flex min-w-0 flex-1 basis-0 flex-wrap items-center gap-2">
                  <SolveOnProviderLink
                    canonicalUrl={problem.canonicalUrl}
                    provider={problem.provider}
                  />
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
                    recommendationItemId={item.id}
                    sourceContext="recommendation"
                  />
                </div>
                <Button
                  aria-label={`Dismiss ${problem.title}`}
                  className={cn(
                    'order-2 ml-auto',
                    featured && 'lg:order-3 lg:ml-0',
                  )}
                  disabled={isDismissPending}
                  onClick={onDismiss}
                  size="icon-sm"
                  title="Dismiss"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                </Button>
                {featured ? (
                  // Beside the actions on wide screens, its own row below.
                  <div className="order-3 min-w-0 basis-full lg:order-2 lg:ml-auto lg:basis-auto">
                    {feedback}
                  </div>
                ) : null}
              </footer>
            </div>
          </div>
        </SpotlightCard>
      </div>
    </motion.div>
  )
}
