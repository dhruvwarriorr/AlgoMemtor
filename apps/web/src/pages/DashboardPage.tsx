import {
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { ProviderKey } from '@algomemtor/shared-contracts'
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCheck,
  CalendarCheck,
  Flame,
  Link2,
  Shapes,
  Sparkles,
  Trophy,
  X,
  type IconComponent,
} from '@/components/icons/algo-icons'
import { motion, useReducedMotion } from 'motion/react'
import { Link, useNavigate } from 'react-router-dom'

import { OrbLoader } from '@/components/motion/OrbLoader'
import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { AnimatedItem } from '@/components/motion/AnimatedItem'
import { CountUp } from '@/components/motion/CountUp'
import {
  GradientCard,
  type GradientTone,
} from '@/components/motion/GradientCard'
import { RadialProgress } from '@/components/motion/RadialProgress'
import { ThinkingOrbs } from '@/components/motion/ThinkingOrbs'
import { TiltCard } from '@/components/motion/TiltCard'
import { useUserIdentity } from '@/features/auth/user-identity'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { SyncPlatformsButton } from '@/features/connector/SyncPlatformsButton'
import { orderedMentorTools } from '@/features/mentor/feature-routes'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { useCoachRoadmap, useSetCoachTopicStatus } from '@/features/coach/hooks'
import { RatingTrendCard } from '@/features/dashboard/RatingTrendCard'
import { TopicMixCard } from '@/features/dashboard/TopicMixCard'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { useActivity, useAnalytics } from '@/features/platform/hooks'
import { SolvedHeatmap } from '@/features/progress/components/SolvedHeatmap'
import { useProgressAnalytics } from '@/features/progress/hooks/useProgress'
import {
  useDismissRecommendation,
  useRecommendations,
} from '@/features/recommendations/hooks/useRecommendations'
import { cn } from '@/lib/utils'

import { dashboardActivity, isAcceptedSubmission } from './dashboard-activity'

const tileClass =
  'card-lift flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-5 hover:border-[color-mix(in_oklab,var(--primary)_28%,var(--border))]'

const tileTitleClass =
  'flex items-center justify-between gap-3 text-sm font-medium text-muted-foreground'

const noticeClass =
  'rounded-xl border border-sun/60 bg-sun-soft p-3 text-sm text-sun-foreground'

const activityDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

const stagger = (index: number) => ({ '--i': index }) as CSSProperties

function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

type KpiTone = 'card' | 'mesh' | 'ink' | 'gradient'

// One headline number: label and icon chip on top, a large count below, and
// an optional visual (sparkline, week dots, ring) beside it. Tiles lean
// toward the pointer and catch a soft spotlight.
function KpiTile({
  label,
  value,
  count,
  unit,
  detail,
  icon,
  aside,
  tone = 'card',
  gradient,
  index,
}: {
  label: string
  value?: string
  count?: number
  unit?: string
  detail: string
  icon: ReactNode
  aside?: ReactNode
  tone?: KpiTone
  gradient?: { tone: GradientTone; decoration: IconComponent }
  index: number
}) {
  const display = value ?? String(count ?? 0)
  const surface = gradient === undefined ? tone : 'gradient'
  const layout =
    'animate-rise flex h-full min-h-[9.25rem] min-w-0 flex-col justify-between gap-4 overflow-hidden rounded-xl p-4'

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            'min-w-0 text-sm leading-tight font-medium',
            surface === 'card' && 'text-muted-foreground',
            surface !== 'card' && 'opacity-75',
          )}
        >
          {label}
        </p>
        {/* Gradient tiles show their icon large in the background. */}
        {surface === 'gradient' ? null : (
          <span
            aria-hidden="true"
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-[18px]',
              tone === 'mesh' &&
                'bg-white/12 text-white ring-1 ring-white/20 [--icon-node:#4ade80]',
              tone === 'ink' &&
                'bg-[color-mix(in_oklab,var(--ink-foreground)_12%,transparent)] text-sky [--icon-node:var(--go)]',
              surface === 'card' &&
                'bg-accent text-accent-foreground [--icon-node:var(--go)]',
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-end justify-between gap-3">
          <p
            className={cn(
              'min-w-0 truncate font-heading leading-none font-bold tracking-[-0.02em]',
              count === undefined ? 'text-[1.7rem]' : 'text-[2.4rem]',
            )}
            title={display}
          >
            {count === undefined ? value : <CountUp value={count} />}
            {unit ? (
              <span className="ml-1.5 text-base font-semibold tracking-normal opacity-70">
                {unit}
              </span>
            ) : null}
          </p>
          {aside}
        </div>
        <p
          className={cn(
            'mt-1.5 truncate text-sm',
            surface === 'card' ? 'text-muted-foreground' : 'opacity-70',
          )}
        >
          {detail}
        </p>
      </div>
    </>
  )

  return (
    <li className="min-w-0">
      {gradient === undefined ? (
        <TiltCard
          className={cn(
            layout,
            tone === 'mesh' && 'mesh-card',
            tone === 'ink' && 'bg-ink text-ink-foreground',
            tone === 'card' && 'bezel-core ring-1 ring-border',
          )}
          max={5}
          style={stagger(index)}
        >
          {body}
        </TiltCard>
      ) : (
        <GradientCard
          className={layout}
          icon={gradient.decoration}
          style={stagger(index)}
          tone={gradient.tone}
        >
          {body}
        </GradientCard>
      )}
    </li>
  )
}

// Daily solves drawn as a line that traces itself in.
function Sparkline({ values }: { values: readonly number[] }) {
  const reduceMotion = useReducedMotion()
  if (values.length < 2) return null
  const max = Math.max(1, ...values)
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 76 + 2
      const y = 30 - (value / max) * 26
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      aria-hidden="true"
      className="h-9 w-20 shrink-0 overflow-visible"
      viewBox="0 0 80 32"
    >
      <motion.polyline
        fill="none"
        initial={reduceMotion ? false : { pathLength: 0 }}
        points={points}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.9"
        strokeWidth="2"
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
        animate={{ pathLength: 1 }}
      />
    </svg>
  )
}

// The last seven days as squares: green where something was solved.
function WeekDots({
  days,
}: {
  days: readonly { date: string; solved: number }[]
}) {
  return (
    <span aria-hidden="true" className="flex shrink-0 gap-1">
      {days.map((day, index) => (
        <span
          className={cn(
            'animate-pop size-2.5 rounded-[3px]',
            day.solved > 0
              ? 'bg-go'
              : 'bg-[color-mix(in_oklab,currentColor_18%,transparent)]',
          )}
          key={day.date}
          style={{ '--i': 30 + index * 4 } as CSSProperties}
        />
      ))}
    </span>
  )
}

function TileLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      className="group inline-flex items-center gap-1 text-sm font-medium text-foreground/70 transition-colors hover:text-primary"
      to={to}
    >
      {label}
      <ArrowRight
        aria-hidden="true"
        className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  )
}

function AskCoachBar() {
  const navigate = useNavigate()
  const [question, setQuestion] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // The question travels in router state, never in the URL.
    void navigate('/coach', { state: { ask: question.trim() } })
  }

  return (
    <form
      className="flex h-13 w-full items-center gap-2 rounded-md border border-border bg-card py-1.5 pr-1.5 pl-4 shadow-soft transition-[border-color,box-shadow] duration-300 focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15 sm:w-[27rem]"
      onSubmit={submit}
    >
      <Sparkles
        aria-hidden="true"
        className="size-[18px] shrink-0 text-primary [--icon-node:var(--go)]"
      />
      <label className="sr-only" htmlFor="dashboard-ask-coach">
        Ask your coach
      </label>
      <input
        className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-foreground outline-none placeholder:text-muted-foreground"
        id="dashboard-ask-coach"
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Ask your coach what to work on…"
        value={question}
      />
      <button
        aria-label="Open coach"
        className="group grid size-10 shrink-0 place-items-center rounded-md bg-ink text-ink-foreground transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-95 [--icon-node:var(--go)]"
        type="submit"
      >
        <ArrowUpRight aria-hidden="true" className="size-4" />
      </button>
    </form>
  )
}

function DashboardPage() {
  const identity = useUserIdentity()
  const analyticsQuery = useProgressAnalytics(30)
  const activityQuery = useActivity()
  const platformAnalyticsQuery = useAnalytics()
  const recommendationsQuery = useRecommendations()
  const roadmapQuery = useCoachRoadmap()
  const dismissRecommendation = useDismissRecommendation()
  const setTopicStatus = useSetCoachTopicStatus()
  const title = `${greeting()}, ${identity.name}`
  const description =
    'Your coach has read your latest activity. Here is where your practice stands.'

  if (analyticsQuery.isPending) {
    return (
      <PageContainer>
        <PageHeader description={description} title={title} />
        <PageSkeleton label="Loading your dashboard" rows={4} />
      </PageContainer>
    )
  }

  if (analyticsQuery.isError || analyticsQuery.data === undefined) {
    return (
      <PageContainer>
        <PageHeader description={description} title={title} />
        <ErrorState
          message={
            analyticsQuery.error instanceof Error
              ? analyticsQuery.error.message
              : 'Your progress could not be loaded.'
          }
          onRetry={() => void analyticsQuery.refetch()}
          title="Unable to load dashboard"
        />
      </PageContainer>
    )
  }

  const analytics = analyticsQuery.data.data
  const recentEvents = dashboardActivity(activityQuery.data?.data ?? [], 4)
  const recommendations =
    recommendationsQuery.data?.data?.items.slice(0, 3) ?? []

  const solvedByProvider = (
    Object.entries(platformAnalyticsQuery.data?.solvedByProvider ?? {}) as [
      ProviderKey,
      number,
    ][]
  ).sort(([, a], [, b]) => b - a)
  const topPlatform = solvedByProvider[0]

  const topTopic = [...analytics.topicActivity]
    .filter((topic) => topic.solved > 0)
    .sort((a, b) => b.solved - a.solved)[0]

  const windowStart =
    new Date(analytics.generatedAt).getTime() -
    analytics.window.days * 86_400_000
  const recentContests = (
    platformAnalyticsQuery.data?.contestParticipation ?? []
  ).filter(
    (contest) =>
      contest.attendedAt !== undefined &&
      new Date(contest.attendedAt).getTime() >= windowStart,
  )

  // A day counts as active when anything was attempted or solved on it.
  const activeDays = analytics.trend.filter(
    (point) => point.attempted > 0 || point.solved > 0,
  ).length

  const focusTopics = (roadmapQuery.data?.data?.topics ?? []).filter(
    (topic) =>
      topic.lane === 'current_focus' ||
      topic.lane === 'needs_more_practice' ||
      topic.lane === 'revisit_later',
  )
  const [leadTopic, ...otherTopics] = focusTopics

  return (
    <PageContainer className="gap-6 xl:min-h-(--app-panel-height) xl:flex-none xl:py-7">
      <PageHeader
        action={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SyncPlatformsButton compact />
            <AskCoachBar />
          </div>
        }
        className="sm:items-center"
        description={description}
        title={title}
      />

      <nav
        aria-label="Mentor tools"
        className="animate-rise -mt-1 flex min-w-0 gap-2 overflow-x-auto pb-1"
      >
        {orderedMentorTools.map((tool) => (
          <Link
            className="group inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground/85 transition-[border-color,color] hover:border-[color-mix(in_oklab,var(--primary)_40%,var(--border))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            key={tool.feature}
            title={tool.description}
            to={tool.path}
          >
            <tool.icon
              aria-hidden="true"
              className="size-4 text-primary"
              strokeWidth={1.8}
            />
            {tool.label}
          </Link>
        ))}
      </nav>

      {/* KPI strip, then charts, then coaching: all on one 12-column grid. */}
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2 xl:grid-cols-12 xl:grid-rows-[auto_minmax(16rem,1fr)_minmax(16rem,1fr)]">
        <ul
          aria-label="Last 30 days at a glance"
          className="grid min-w-0 grid-cols-1 gap-3 min-[26rem]:grid-cols-2 sm:grid-cols-3 md:col-span-2 xl:col-span-12 xl:grid-cols-6"
        >
          <KpiTile
            aside={
              <span className="text-[#bbf7d0]">
                <Sparkline
                  values={analytics.trend.slice(-14).map((day) => day.solved)}
                />
              </span>
            }
            count={analytics.window.solved}
            detail="new in the last 30 days"
            icon={<CheckCheck />}
            index={1}
            label="Solved"
            tone="mesh"
          />
          <KpiTile
            aside={<WeekDots days={analytics.trend.slice(-7)} />}
            count={analytics.currentStreak}
            detail={`Longest: ${analytics.longestStreak} ${analytics.longestStreak === 1 ? 'day' : 'days'}`}
            icon={<Flame />}
            index={2}
            label="Solve streak"
            tone="ink"
            unit={analytics.currentStreak === 1 ? 'day' : 'days'}
          />
          <KpiTile
            detail={topPlatform ? `${topPlatform[1]} solved` : 'Link a profile'}
            icon={
              topPlatform ? (
                <ProviderLogo className="size-5" provider={topPlatform[0]} />
              ) : (
                <Link2 />
              )
            }
            gradient={{ tone: 'sky', decoration: BarChart3 }}
            index={3}
            label="Top platform"
            value={topPlatform ? providerLabels[topPlatform[0]] : 'None yet'}
          />
          <KpiTile
            detail={
              topTopic ? `${topTopic.solved} in 30 days` : 'No solves yet'
            }
            gradient={{ tone: 'green', decoration: Shapes }}
            icon={<Shapes />}
            index={4}
            label="Top topic"
            value={topTopic ? topTopic.topic : 'None yet'}
          />
          <KpiTile
            aside={
              <RadialProgress
                className="size-12 shrink-0"
                thickness={12}
                value={activeDays / Math.max(1, analytics.window.days)}
              />
            }
            count={activeDays}
            detail={`of the last ${analytics.window.days} days`}
            gradient={{ tone: 'sand', decoration: CalendarCheck }}
            icon={<CalendarCheck />}
            index={5}
            label="Active days"
          />
          <KpiTile
            count={recentContests.length}
            detail="Last 30 days"
            gradient={{ tone: 'sky', decoration: Trophy }}
            icon={<Trophy />}
            index={6}
            label="Contests"
          />
        </ul>

        <RatingTrendCard
          className="animate-rise md:col-span-2 xl:col-span-6 xl:min-h-0"
          history={platformAnalyticsQuery.data?.ratingHistory ?? []}
        />

        <TopicMixCard
          className="animate-rise xl:col-span-3 xl:min-h-0"
          topics={analytics.topicActivity}
        />

        <div
          className="animate-rise min-h-0 min-w-0 xl:col-span-3 [&>div]:rounded-xl"
          style={stagger(7)}
        >
          <SolvedHeatmap trend={analytics.trend} />
        </div>

        <section
          aria-labelledby="coach-focus-heading"
          className="card-lift mesh-card animate-rise relative isolate flex min-h-64 min-w-0 flex-col overflow-hidden rounded-xl p-6 xl:col-span-3 xl:min-h-0 xl:p-5"
          style={stagger(5)}
        >
          <span
            aria-hidden="true"
            className="animate-aurora absolute -top-16 -right-16 -z-10 size-48 rounded-full bg-[radial-gradient(closest-side,rgb(125_211_252/0.35),transparent)]"
          />
          <div className="flex items-center justify-between gap-3">
            <h2
              className="shimmer-text font-sans text-sm font-medium text-white/70 [--shimmer:#ffffff]"
              id="coach-focus-heading"
            >
              Your coach is focusing on
            </h2>
            <ThinkingOrbs className="size-9" />
          </div>
          {roadmapQuery.isError ? (
            <p className={cn(noticeClass, 'mt-4')} role="status">
              Your coaching focus is temporarily unavailable. Open Coach to
              retry it.
            </p>
          ) : leadTopic ? (
            <>
              <p className="mt-2 max-w-[70%] font-heading text-3xl leading-tight font-bold tracking-[-0.01em] xl:text-[1.7rem]">
                {leadTopic.name}
              </p>
              <p className="mt-2 line-clamp-2 max-w-md text-sm opacity-70 [@media(max-height:760px)]:line-clamp-1">
                {leadTopic.reason}
              </p>
              <button
                className="mt-3 w-fit rounded-md border border-white/25 px-3 py-1 text-xs transition-colors duration-300 hover:bg-white/10 disabled:opacity-50"
                disabled={setTopicStatus.isPending}
                onClick={() =>
                  void setTopicStatus.mutateAsync({
                    topic: leadTopic.topic,
                    status: 'skip_for_now',
                  })
                }
                type="button"
              >
                Dismiss this focus
              </button>
              {setTopicStatus.isError ? (
                <p className="mt-2 text-xs" role="alert">
                  Could not dismiss this focus. Try again.
                </p>
              ) : null}
              {otherTopics.length > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-1.5 [@media(max-height:1150px)]:hidden">
                  {otherTopics.slice(0, 3).map((topic) => (
                    <li
                      className="rounded-md bg-white/10 px-3 py-1 text-xs ring-1 ring-white/10"
                      key={topic.topic}
                    >
                      {topic.name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="mt-3 max-w-sm text-sm opacity-75">
              No topics are due right now. Your coach will surface the next step
              as new activity arrives.
            </p>
          )}
          <Link
            className="group/cta mt-auto inline-flex w-fit items-center gap-2 rounded-lg bg-[#f4f1ea] py-1.5 pr-1.5 pl-4 text-sm font-medium text-[#0b0c0e] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
            to="/coach"
          >
            Continue with coach
            <span className="grid size-7 place-items-center rounded-md bg-[#0b0c0e] text-[#f4f1ea] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5 group-hover/cta:scale-110 [--icon-node:#4ade80]">
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </span>
          </Link>
        </section>

        <section
          aria-labelledby="next-practice-heading"
          className={cn(tileClass, 'animate-rise md:col-span-2 xl:col-span-6')}
          style={stagger(6)}
        >
          <div className={tileTitleClass}>
            <h2
              className="font-sans text-sm font-medium"
              id="next-practice-heading"
            >
              Next practice
            </h2>
            <TileLink label="All picks" to="/recommendations" />
          </div>
          {recommendationsQuery.isError ? (
            <p className={cn(noticeClass, 'mt-4')} role="status">
              Recommendations are temporarily unavailable.
            </p>
          ) : recommendations.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No recommendations yet. Visit Recommendations to refresh the feed.
            </p>
          ) : (
            <ul className="mt-1.5 flex min-h-0 flex-1 flex-col divide-y divide-border [@media(max-height:820px)]:[&>li:nth-child(n+3)]:hidden">
              {recommendations.map((item, index) => (
                <AnimatedItem
                  className="group/row -mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-300 hover:bg-secondary/60"
                  index={index}
                  key={item.id}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/row:-rotate-6"
                  >
                    <ProviderLogo
                      className="size-5"
                      provider={item.problem.provider}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {item.problem.title}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {item.reason}
                    </p>
                  </div>
                  <a
                    aria-label={`Solve ${item.problem.title} on ${providerLabels[item.problem.provider]}`}
                    className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-foreground/70 transition-colors duration-300 hover:border-primary hover:bg-primary hover:text-primary-foreground [--icon-node:var(--go)]"
                    href={item.problem.canonicalUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <ArrowUpRight aria-hidden="true" className="size-4" />
                  </a>
                  <button
                    aria-label={`Dismiss ${item.problem.title}`}
                    className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-foreground/70 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                    disabled={dismissRecommendation.isPending}
                    onClick={() =>
                      void dismissRecommendation.mutateAsync(item.id)
                    }
                    title="Don't recommend this problem again"
                    type="button"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </AnimatedItem>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="activity-heading"
          className={cn(tileClass, 'animate-rise xl:col-span-3')}
          style={stagger(4)}
        >
          <div className={tileTitleClass}>
            <h2 className="font-sans text-sm font-medium" id="activity-heading">
              Recent activity
            </h2>
          </div>
          {activityQuery.isError ? (
            <p className={cn(noticeClass, 'mt-4')} role="status">
              Recent activity is temporarily unavailable.
            </p>
          ) : activityQuery.isPending ? (
            <div className="mt-4 flex justify-center" role="status">
              <OrbLoader label="Loading recent activity…" />
            </div>
          ) : recentEvents.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No dated activity yet. Sync a platform or record progress to start
              your history.
            </p>
          ) : (
            <ol className="mt-1.5 flex min-h-0 flex-1 flex-col divide-y divide-border overflow-hidden [@media(max-height:1000px)]:[&>li:nth-child(n+4)]:hidden">
              {recentEvents.map((event, index) => {
                const solved =
                  event.eventType === 'solved' || isAcceptedSubmission(event)
                return (
                  <AnimatedItem
                    className="flex min-w-0 flex-1 items-center gap-3 py-1.5"
                    index={index}
                    key={event.id}
                  >
                    <span
                      aria-hidden="true"
                      className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"
                    >
                      <ProviderLogo
                        className="size-5"
                        provider={event.provider}
                      />
                      <span
                        className={cn(
                          'absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card',
                          solved
                            ? 'bg-go shadow-[0_0_8px_var(--go)]'
                            : 'bg-muted-foreground/60',
                        )}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {event.title ?? event.externalId ?? 'Contest activity'}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {providerLabels[event.provider]} ·{' '}
                        {event.source === 'manual'
                          ? event.eventType === 'solved'
                            ? 'Marked solved'
                            : 'Marked attempted'
                          : solved
                            ? 'Accepted'
                            : event.eventType.replaceAll('_', ' ')}
                      </p>
                    </div>
                    {event.occurredAt ? (
                      <time
                        className="shrink-0 text-sm text-muted-foreground tabular-nums"
                        dateTime={event.occurredAt}
                      >
                        {activityDate.format(new Date(event.occurredAt))}
                      </time>
                    ) : null}
                  </AnimatedItem>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </PageContainer>
  )
}

export default DashboardPage
