import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Activity } from '@/components/icons/algo-icons'
import { Link } from '@/lib/router'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import {
  AcceptanceIcon,
  ActiveDaysIcon,
  ContestsIcon,
  SolvedIcon,
  StreakIcon,
  SubmissionsIcon,
} from '@/components/icons/app-icons'
import type { IconComponent } from '@/components/icons/algo-icons'
import {
  GradientCard,
  type GradientTone,
} from '@/components/motion/GradientCard'
import { Sparkline } from '@/components/kit/charts'
import { CountUp } from '@/components/motion/CountUp'
import { RadialRings } from '@/components/motion/RadialRings'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { buttonVariants } from '@/components/ui/button'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { useLearnerMemories } from '@/features/memory/hooks/useLearnerMemories'
import { providerLabels } from '@/features/platform/components/provider-labels'
import {
  HourClock,
  PracticePulse,
  RatingLadder,
  TopicMosaic,
  VerdictWaffle,
  WeekEqualizer,
} from '@/features/progress/components/progress-visuals'
import { useProgressAnalytics } from '@/features/progress/hooks/useProgress'
import { cn } from '@/lib/utils'

type Analytics = NonNullable<
  ReturnType<typeof useProgressAnalytics>['data']
>['data']
type Breakdown = NonNullable<Analytics['breakdown']>

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function Card({
  title,
  description,
  className,
  action,
  children,
}: {
  title: string
  description: string
  className?: string
  action?: ReactNode
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.section
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5',
        className,
      )}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      viewport={{ once: true, margin: '-40px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </motion.section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="grid flex-1 place-items-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function Kpi({
  icon,
  label,
  value,
  detail,
  accent,
  gradient,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  accent?: boolean
  gradient?: { tone: GradientTone; decoration: IconComponent }
}) {
  if (gradient !== undefined) {
    return (
      <GradientCard
        className="animate-rise min-w-0 p-4"
        icon={gradient.decoration}
        tone={gradient.tone}
      >
        <dt className="flex items-center gap-2 text-sm font-medium opacity-75">
          {label}
        </dt>
        <dd className="mt-3 truncate font-heading text-[1.9rem] leading-none font-bold tracking-[-0.01em] tabular-nums">
          {value}
        </dd>
        <p className="mt-1.5 truncate text-xs opacity-70">{detail}</p>
      </GradientCard>
    )
  }
  return (
    <div
      className={cn(
        'animate-rise min-w-0 rounded-xl p-4',
        accent ? 'text-white mesh-card' : 'border border-border bg-card',
      )}
    >
      <dt
        className={cn(
          'flex items-center gap-2 text-sm font-medium',
          accent ? 'text-white/85' : 'text-muted-foreground',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-8 place-items-center rounded-lg',
            accent ? 'bg-white/20' : 'bg-accent text-accent-foreground',
          )}
        >
          {icon}
        </span>
        {label}
      </dt>
      <dd className="mt-3 truncate font-heading text-[1.9rem] leading-none font-bold tracking-[-0.01em] tabular-nums">
        {value}
      </dd>
      <p
        className={cn(
          'mt-1.5 truncate text-xs',
          accent ? 'text-white/80' : 'text-muted-foreground',
        )}
      >
        {detail}
      </p>
    </div>
  )
}

// Area chart: attempted vs newly solved per local day.
function DailyPractice({ analytics }: { analytics: Analytics }) {
  const hasActivity = analytics.trend.some(
    (point) => point.solved > 0 || point.attempted > 0,
  )
  return (
    <Card
      className="lg:col-span-8"
      description={`Problems attempted and newly solved each day (${analytics.timezone}).`}
      title="Daily practice"
    >
      {hasActivity ? (
        <PracticePulse trend={analytics.trend} />
      ) : (
        <Empty>No dated practice was observed in the last 30 days.</Empty>
      )}
    </Card>
  )
}

const ringColors = ['#0ea5e9', '#22c55e', '#0369a1', '#86efac']

// Concentric radial rings: solved per platform, with a detail list.
function PlatformBreakdown({
  breakdown,
}: {
  breakdown: Breakdown | undefined
}) {
  const providers = [...(breakdown?.providers ?? [])].sort(
    (left, right) => right.solved - left.solved,
  )
  const total = providers.reduce((sum, item) => sum + item.solved, 0)
  const reduceMotion = useReducedMotion()
  return (
    <Card
      className="lg:col-span-4"
      description="Newly solved problems by platform."
      title="Platforms"
    >
      {providers.length === 0 ? (
        <Empty>Link a platform to see where you practice.</Empty>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <RadialRings
            className="mx-auto h-60 w-60"
            data={providers.map((item, index) => ({
              key: item.provider,
              label: providerLabels[item.provider],
              value: item.solved,
              color: ringColors[index % ringColors.length] ?? '#0ea5e9',
            }))}
            label={`Newly solved by platform: ${providers
              .map((item) => `${providerLabels[item.provider]} ${item.solved}`)
              .join(', ')}`}
            total={total}
            totalLabel="solved"
          />
          <ul className="flex flex-col gap-1.5">
            {providers.map((item) => (
              <li
                className="relative flex items-center gap-2.5 overflow-hidden rounded-lg border border-border px-3 py-2 text-sm"
                key={item.provider}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    background:
                      ringColors[providers.indexOf(item) % ringColors.length],
                  }}
                />
                <ProviderLogo className="size-5" provider={item.provider} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {providerLabels[item.provider]}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {item.attempted} tried · {item.submissions} subs
                </span>
                <span className="w-7 text-right font-heading font-bold tabular-nums">
                  {item.solved}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full"
                >
                  <motion.span
                    className="block h-full rounded-full"
                    initial={reduceMotion ? false : { width: '0%' }}
                    style={{
                      background:
                        ringColors[providers.indexOf(item) % ringColors.length],
                    }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                    viewport={{ once: true }}
                    whileInView={{
                      width: `${total === 0 ? 0 : (item.solved / total) * 100}%`,
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

// Pie chart: share of newly solved problems per topic in the window.
function TopicPie({ analytics }: { analytics: Analytics }) {
  const sorted = [...analytics.topicActivity]
    .filter((topic) => topic.solved > 0)
    .sort((left, right) => right.solved - left.solved)
  const top = sorted.slice(0, 7)
  const rest = sorted.slice(7).reduce((sum, topic) => sum + topic.solved, 0)
  const data = [
    ...top.map((topic) => ({
      name: titleCase(topic.topic),
      value: topic.solved,
    })),
    ...(rest > 0 ? [{ name: 'Other', value: rest }] : []),
  ]
  return (
    <Card
      className="lg:col-span-6"
      description="Topics on problems you newly solved in the last 30 days."
      title="Topics practiced"
    >
      {data.length === 0 ? (
        <Empty>No tagged solves in the last 30 days.</Empty>
      ) : (
        <TopicMosaic items={data} />
      )}
    </Card>
  )
}

const verdictMeta = [
  { key: 'accepted', label: 'Accepted', color: '#1f9d5c' },
  { key: 'wrongAnswer', label: 'Wrong answer', color: '#e0484f' },
  { key: 'timeLimit', label: 'Time limit', color: '#f2b84b' },
  { key: 'memoryLimit', label: 'Memory limit', color: '#8b5cf6' },
  { key: 'runtimeError', label: 'Runtime error', color: '#ec4899' },
  { key: 'compileError', label: 'Compile error', color: '#14a3a3' },
  { key: 'other', label: 'Other', color: '#6c7a90' },
] as const

// Segmented 100% bar: how submissions ended.
function VerdictMix({ breakdown }: { breakdown: Breakdown | undefined }) {
  const total = breakdown?.submissions ?? 0
  const items = verdictMeta
    .map((meta) => ({ ...meta, count: breakdown?.verdicts[meta.key] ?? 0 }))
    .filter((item) => item.count > 0)
  const accepted = breakdown?.verdicts.accepted ?? 0
  return (
    <Card
      action={
        total > 0 ? (
          <span className="rounded-md bg-go-soft px-2 py-1 text-sm font-semibold text-go-foreground tabular-nums">
            {Math.round((accepted / total) * 100)}% AC
          </span>
        ) : null
      }
      className="lg:col-span-6"
      description={`How your ${total} submissions ended.`}
      title="Verdict mix"
    >
      {total === 0 ? (
        <Empty>No dated submissions in the last 30 days.</Empty>
      ) : (
        <VerdictWaffle items={items} total={total} />
      )}
    </Card>
  )
}

// Histogram: rating bands of newly solved problems, plus difficulty chips.
function DifficultyProfile({
  breakdown,
}: {
  breakdown: Breakdown | undefined
}) {
  return (
    <Card
      className="lg:col-span-6"
      description="Rating bands and difficulty of problems you newly solved."
      title="Difficulty profile"
    >
      <RatingLadder
        bands={breakdown?.ratingBands ?? []}
        difficulty={breakdown?.difficulty}
      />
    </Card>
  )
}

// Radar: which weekdays carry the practice.
function WeekdayRhythm({ breakdown }: { breakdown: Breakdown | undefined }) {
  const data = breakdown?.weekdays ?? []
  const hasData = data.some((day) => day.solved > 0 || day.submissions > 0)
  return (
    <Card
      className="lg:col-span-3"
      description="Solves and submissions by weekday."
      title="Weekly rhythm"
    >
      {hasData ? (
        <WeekEqualizer weekdays={data} />
      ) : (
        <Empty>No weekday pattern yet.</Empty>
      )}
    </Card>
  )
}

// Heat strip: submissions by local hour.
function TimeOfDay({
  breakdown,
  timezone,
}: {
  breakdown: Breakdown | undefined
  timezone: string
}) {
  const hours = breakdown?.hours ?? []
  const max = Math.max(0, ...hours)
  return (
    <Card
      className="lg:col-span-3"
      description={`Submissions by hour (${timezone}).`}
      title="Time of day"
    >
      {max === 0 ? (
        <Empty>No timed submissions yet.</Empty>
      ) : (
        <HourClock hours={hours} />
      )}
    </Card>
  )
}

function AnalyticsSection({ analytics }: { analytics: Analytics }) {
  const breakdown = analytics.breakdown
  const activeDays = analytics.trend.filter(
    (day) => day.attempted > 0 || day.solved > 0,
  ).length
  const submissions = breakdown?.submissions ?? 0
  const accepted = breakdown?.verdicts.accepted ?? 0
  return (
    <div className="flex flex-col gap-4">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <section
          aria-label="Newly solved"
          className="mesh-card animate-rise relative isolate flex min-h-40 flex-col overflow-hidden rounded-2xl p-5 text-white"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-white/80">
            <SolvedIcon
              aria-hidden="true"
              className="size-4 [--icon-node:#4ade80]"
            />
            Newly solved
          </p>
          <p className="mt-2 font-heading text-5xl leading-none font-bold tracking-[-0.03em] tabular-nums">
            <CountUp value={analytics.window.solved} />
          </p>
          <p className="mt-1.5 text-xs text-white/70">
            Unique problems, last {analytics.window.days} days
          </p>
          <Sparkline
            className="mt-auto h-12 pt-3"
            color="#86efac"
            values={analytics.trend.map((day) => day.solved)}
          />
        </section>
        <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <Kpi
            detail={
              analytics.currentStreak > 0
                ? 'Solve today to keep it'
                : 'Solve today to start one'
            }
            icon={<StreakIcon aria-hidden="true" className="size-4" />}
            gradient={{ tone: 'sand', decoration: StreakIcon }}
            label="Current streak"
            value={`${analytics.currentStreak}d`}
          />
          <Kpi
            detail="Best run of solve days"
            icon={<ContestsIcon aria-hidden="true" className="size-4" />}
            gradient={{ tone: 'sky', decoration: ContestsIcon }}
            label="Longest streak"
            value={`${analytics.longestStreak}d`}
          />
          <Kpi
            detail={`of the last ${analytics.window.days} days`}
            icon={<ActiveDaysIcon aria-hidden="true" className="size-4" />}
            gradient={{ tone: 'green', decoration: ActiveDaysIcon }}
            label="Active days"
            value={String(activeDays)}
          />
          <Kpi
            detail={`${analytics.window.attempted} problems attempted`}
            icon={<SubmissionsIcon aria-hidden="true" className="size-4" />}
            gradient={{ tone: 'sand', decoration: SubmissionsIcon }}
            label="Submissions"
            value={String(submissions)}
          />
          <Kpi
            detail={`${accepted} accepted`}
            icon={<AcceptanceIcon aria-hidden="true" className="size-4" />}
            gradient={{ tone: 'sky', decoration: AcceptanceIcon }}
            label="Acceptance"
            value={
              submissions === 0
                ? '—'
                : `${Math.round((accepted / submissions) * 100)}%`
            }
          />
        </dl>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <DailyPractice analytics={analytics} />
        <PlatformBreakdown breakdown={breakdown} />
        <TopicPie analytics={analytics} />
        <VerdictMix breakdown={breakdown} />
        <DifficultyProfile breakdown={breakdown} />
        <WeekdayRhythm breakdown={breakdown} />
        <TimeOfDay breakdown={breakdown} timezone={analytics.timezone} />
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Activity aria-hidden="true" className="size-3.5" />
        Counts use dated activity available to AlgoMemtor; public provider
        history can be partial.
      </p>
    </div>
  )
}

function MemoryProcessingNotice() {
  const memoriesQuery = useLearnerMemories()
  const pendingJobs = memoriesQuery.data?.meta.pendingJobs ?? 0
  if (pendingJobs === 0) return null
  return (
    <aside
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 p-4"
      role="status"
    >
      <p className="text-sm text-muted-foreground">
        {pendingJobs} learner-memory job{pendingJobs === 1 ? '' : 's'} are
        processing. This page will refresh when they finish.
      </p>
      <Link
        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        to="/memory"
      >
        Review memory
      </Link>
    </aside>
  )
}

function ProgressPage() {
  const analyticsQuery = useProgressAnalytics(30)
  return (
    <PageContainer>
      <PageHeader
        action={
          <Link className={buttonVariants()} to="/progress/report">
            Open progress report
          </Link>
        }
        description="Your last 30 days of practice: where, what, how well and when."
        title="Progress"
      />
      <MemoryProcessingNotice />
      {analyticsQuery.isPending ? (
        <PageSkeleton label="Loading progress analytics" rows={4} />
      ) : analyticsQuery.isError ? (
        <ErrorState
          message={
            analyticsQuery.error instanceof Error
              ? analyticsQuery.error.message
              : 'Progress analytics could not be loaded.'
          }
          onRetry={() => void analyticsQuery.refetch()}
          title="Progress unavailable"
        />
      ) : analyticsQuery.data ? (
        <AnalyticsSection analytics={analyticsQuery.data.data} />
      ) : null}
    </PageContainer>
  )
}

export default ProgressPage
