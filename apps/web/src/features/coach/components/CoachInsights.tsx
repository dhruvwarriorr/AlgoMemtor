import type { ReactNode } from 'react'
import type {
  CoachEvidenceReference,
  ImprovementRoadmap,
} from '@algomemtor/shared-contracts'
import {
  Activity,
  BarChart3,
  Brain,
  Flame,
  Gauge,
  ListChecks,
  Map as MapIcon,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

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
      <p className="mt-1.5 truncate font-heading text-2xl leading-none font-bold tracking-[-0.03em] text-foreground">
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
            : 'roadmap focus'
        }
        icon={<Target aria-hidden="true" className="size-3.5" />}
        label="Focus"
        tone={signals.needsWork.length > 0 ? 'danger' : 'muted'}
        value={signals.focus[0]?.name ?? 'Exploring'}
      />
    </div>
  )
}

const sourceMeta: Record<
  CoachEvidenceReference['source'],
  { label: string; icon: LucideIcon }
> = {
  profile: { label: 'Linked profiles', icon: UserRound },
  analytics: { label: 'Analytics', icon: BarChart3 },
  activity: { label: 'Solves & submissions', icon: Activity },
  progress: { label: 'Recorded progress', icon: ListChecks },
  roadmap: { label: 'Roadmap', icon: MapIcon },
  memory: { label: 'Coach memory', icon: Brain },
  recommendations: { label: 'Recommendations', icon: Sparkles },
  contest: { label: 'Contests & rating', icon: Trophy },
}

const scanningSources: CoachEvidenceReference['source'][] = [
  'profile',
  'activity',
  'contest',
  'roadmap',
  'memory',
]

// What the coach pulled from the learner's data for the latest answer, or
// the sources it is reading while an answer is being prepared.
function UsedContext({
  evidence,
  pending,
}: {
  evidence: readonly CoachEvidenceReference[]
  pending: boolean
}) {
  if (!pending && evidence.length === 0) return null
  return (
    <section aria-live="polite" className="flex flex-col gap-2">
      <p className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {pending ? 'Reading your data' : 'Context used in last answer'}
        {pending ? null : (
          <span className="rounded-sm bg-secondary px-1.5 py-0.5 tabular-nums">
            {evidence.length}
          </span>
        )}
      </p>
      <ul className="flex flex-col gap-1.5">
        {pending
          ? scanningSources.map((source, index) => {
              const meta = sourceMeta[source]
              return (
                <li
                  className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground"
                  key={source}
                >
                  <meta.icon
                    aria-hidden="true"
                    className="size-3.5 animate-pulse text-primary"
                    style={{ animationDelay: `${index * 180}ms` }}
                  />
                  {meta.label}
                </li>
              )
            })
          : evidence.slice(0, 8).map((item, index) => {
              const meta = sourceMeta[item.source]
              return (
                <li
                  className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm"
                  key={`${item.label}-${index}`}
                  title={item.detail}
                >
                  <meta.icon
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-primary"
                  />
                  <span className="min-w-0 truncate text-foreground">
                    {item.label}
                  </span>
                </li>
              )
            })}
      </ul>
    </section>
  )
}

export function CoachContextRail({
  roadmap,
  onAsk,
  disabled,
  evidence = [],
  pending = false,
}: {
  roadmap: ImprovementRoadmap | undefined
  onAsk: (question: string) => void
  disabled: boolean
  evidence?: readonly CoachEvidenceReference[]
  pending?: boolean
}) {
  const signals = useCoachSignals(roadmap)
  const topics = [...signals.focus, ...signals.needsWork].slice(0, 4)
  return (
    <aside
      aria-label="What your coach knows"
      className="hidden w-[18rem] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-5 xl:flex"
    >
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Coach context
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Live signals behind every answer.
        </p>
      </div>

      <UsedContext evidence={evidence} pending={pending} />

      <div className="rounded-2xl bg-ink p-4 text-ink-foreground">
        <p className="flex items-center gap-1.5 text-xs opacity-70">
          <Gauge aria-hidden="true" className="size-3.5" />
          {signals.rating ? `${signals.rating.provider} rating` : 'Rating'}
        </p>
        <p className="mt-2 font-heading text-4xl leading-none font-bold tracking-[-0.04em]">
          {signals.rating?.value ?? (signals.loading ? '…' : '—')}
        </p>
        <p className="mt-2 text-xs opacity-70">
          {signals.rating
            ? `Peak ${signals.rating.peak} · ${signals.rating.delta >= 0 ? '+' : ''}${signals.rating.delta} last contest`
            : 'Link a profile to track rating'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Solved · 30d</p>
          <p className="mt-1 font-heading text-xl font-bold">
            {signals.solved30 ?? '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-border p-3">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Trophy aria-hidden="true" className="size-3" /> Contests
          </p>
          <p className="mt-1 font-heading text-xl font-bold">
            {signals.contests ?? '—'}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Working on
        </p>
        {topics.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your roadmap is still gathering evidence.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {topics.map((topic) => (
              <li key={topic.topic}>
                <button
                  className="group flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left text-sm transition-colors hover:border-[color-mix(in_oklab,var(--primary)_40%,var(--border))] hover:bg-secondary disabled:pointer-events-none disabled:opacity-60"
                  disabled={disabled}
                  onClick={() =>
                    onAsk(
                      `Coach me on ${topic.name}: where am I weak, and what should I practice next?`,
                    )
                  }
                  title={`Ask about ${topic.name}`}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      topic.lane === 'current_focus' ? 'bg-primary' : 'bg-sun',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {topic.name}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {Math.round(topic.score * 100)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
