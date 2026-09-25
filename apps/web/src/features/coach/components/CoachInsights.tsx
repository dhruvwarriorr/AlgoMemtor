import type { ReactNode } from 'react'
import type { ImprovementRoadmap } from '@algomemtor/shared-contracts'
import { Flame, Gauge, ListChecks, Target } from '@/components/icons/algo-icons'

import { providerLabels } from '@/features/platform/components/provider-labels'
import { useAnalytics } from '@/features/platform/hooks'
import { useProgressAnalytics } from '@/features/progress/hooks/useProgress'
import { cn } from '@/lib/utils'

// The learner signals the coach is reasoning over, shown next to the chat so
// the page reads as "your coach, with your data" rather than a blank chatbot.
function useCoachSignals(roadmap: ImprovementRoadmap | undefined) {
  const platform = useAnalytics()
  const progress = useProgressAnalytics(30)
  const ratings = [...(platform.data?.ratingHistory ?? [])].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  )
  const latest = ratings[0]
  const peak = ratings
    .filter((item) => item.provider === latest?.provider)
    .reduce((max, item) => Math.max(max, item.newRating), 0)
  const focus = (roadmap?.topics ?? []).filter(
    (topic) => topic.lane === 'current_focus',
  )
  const needsWork = (roadmap?.topics ?? []).filter(
    (topic) => topic.lane === 'needs_more_practice',
  )
  return {
    loading: platform.isPending || progress.isPending,
    rating: latest
      ? {
          value: Math.round(latest.newRating),
          delta: Math.round(latest.delta),
          peak: Math.round(peak),
          provider: providerLabels[latest.provider],
        }
      : null,
    solved30: progress.data?.data.window.solved ?? null,
    streak: progress.data?.data.currentStreak ?? null,
    contests: platform.data?.contestParticipation.length ?? null,
    focus,
    needsWork,
  }
}

function Stat({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  detail?: ReactNode
  tone?: 'go' | 'danger' | 'muted'
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 truncate font-heading text-2xl leading-none font-bold tracking-[-0.01em] text-foreground">
        {value}
      </p>
      {detail ? (
        <p
          className={cn(
            'mt-1.5 inline-flex max-w-full truncate rounded-md px-2 py-0.5 text-[0.7rem] font-medium',
            tone === 'go' && 'bg-go-soft text-go-foreground',
            tone === 'danger' && 'bg-danger-soft text-destructive',
            (tone === undefined || tone === 'muted') &&
              'bg-secondary text-muted-foreground',
          )}
        >
          {detail}
        </p>
      ) : null}
    </div>
  )
}

export function CoachStatStrip({
  roadmap,
  className,
}: {
  roadmap: ImprovementRoadmap | undefined
  className?: string
}) {
  const signals = useCoachSignals(roadmap)
  const dash = signals.loading ? '…' : '—'
  return (
    <div
      className={cn('grid w-full grid-cols-2 gap-3 sm:grid-cols-4', className)}
    >
      <Stat
        detail={
          signals.rating
            ? `${signals.rating.delta >= 0 ? '+' : ''}${signals.rating.delta} last contest`
            : 'No rated contests yet'
        }
        icon={<Gauge aria-hidden="true" className="size-3.5" />}
        label={signals.rating ? `${signals.rating.provider} rating` : 'Rating'}
        tone={
          signals.rating
            ? signals.rating.delta >= 0
              ? 'go'
              : 'danger'
            : 'muted'
        }
        value={signals.rating?.value ?? dash}
      />
      <Stat
        detail="last 30 days"
        icon={<ListChecks aria-hidden="true" className="size-3.5" />}
        label="Solved"
        value={signals.solved30 ?? dash}
      />
      <Stat
        detail={signals.streak ? 'keep it going' : 'start today'}
        icon={<Flame aria-hidden="true" className="size-3.5" />}
        label="Streak"
        tone={signals.streak ? 'go' : 'muted'}
        value={
          signals.streak === null
            ? dash
            : `${signals.streak} ${signals.streak === 1 ? 'day' : 'days'}`
        }
      />
      <Stat
        detail={
          signals.needsWork.length > 0
            ? `${signals.needsWork.length} need attention`
            : 'learning focus'
        }
        icon={<Target aria-hidden="true" className="size-3.5" />}
        label="Focus"
        tone={signals.needsWork.length > 0 ? 'danger' : 'muted'}
        value={signals.focus[0]?.name ?? 'Exploring'}
      />
    </div>
  )
}
