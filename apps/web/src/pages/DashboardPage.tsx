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
  CheckCheck,
  CalendarCheck,
  Flame,
  Link2,
  Shapes,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { useUserIdentity } from '@/features/auth/user-identity'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
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
  'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-5'

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

// One headline number with its icon. Large type so it reads from across the room.
function KpiTile({
  label,
  value,
  unit,
  detail,
  icon,
  tone = 'card',
  index,
}: {
  label: string
  value: string
  unit?: string
  detail: string
  icon: ReactNode
  tone?: 'card' | 'primary' | 'sun'
  index: number
}) {
  return (
    <div
      className={cn(
        'animate-rise flex min-w-0 flex-col gap-3 rounded-xl p-4',
        tone === 'primary' &&
          'text-white [background:linear-gradient(155deg,#ff7a3d,#ff4d12_45%,#9a2e0b)]',
        tone === 'sun' && 'bg-sun-soft text-sun-foreground ring-1 ring-sun/45',
        tone === 'card' && 'border border-border bg-card',
      )}
      style={stagger(index)}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-xl',
            tone === 'primary' && 'bg-white/20 text-white',
            tone === 'sun' && 'bg-sun text-[#101012]',
            tone === 'card' && 'bg-accent text-accent-foreground',
          )}
        >
          {icon}
        </span>
        <dt
          className={cn(
            'min-w-0 text-sm leading-tight font-medium',
            tone === 'card' && 'text-muted-foreground',
            tone === 'primary' && 'text-white/85',
          )}
        >
          {label}
        </dt>
      </div>
      <dd className="min-w-0">
        <span
          className={cn(
            'block truncate font-heading leading-none font-bold tracking-[-0.04em]',
            tone === 'card'
              ? 'text-[1.85rem] text-foreground'
              : 'text-[2.4rem]',
            tone === 'sun' && 'text-foreground',
          )}
          title={value}
        >
          {value}
          {unit ? (
            <span className="ml-1.5 text-lg font-semibold tracking-normal">
              {unit}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            'mt-1.5 block truncate text-sm',
            tone === 'card' && 'text-muted-foreground',
            tone === 'primary' && 'text-white/80',
          )}
        >
          {detail}
        </span>
      </dd>
    </div>
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
        className="size-4 shrink-0 text-primary"
        strokeWidth={1.8}
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
        className="grid size-10 shrink-0 place-items-center rounded-md bg-ink text-ink-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-105 active:scale-95"
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
        action={<AskCoachBar />}
        className="sm:items-center"
        description={description}
        title={title}
      />

      {/* KPI strip, then charts, then coaching: all on one 12-column grid. */}
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2 xl:grid-cols-12 xl:grid-rows-[auto_minmax(16rem,1fr)_minmax(16rem,1fr)]">
        <dl className="grid min-w-0 grid-cols-1 gap-4 min-[26rem]:grid-cols-2 sm:grid-cols-3 md:col-span-2 xl:col-span-12 xl:grid-cols-6">
          <KpiTile
            detail="new in the last 30 days"
            icon={<CheckCheck className="size-5" strokeWidth={2} />}
            index={1}
            label="Solved"
            tone="primary"
            value={String(analytics.window.solved)}
          />
          <KpiTile
            detail={`Longest: ${analytics.longestStreak} ${analytics.longestStreak === 1 ? 'day' : 'days'}`}
            icon={<Flame className="size-5" strokeWidth={2} />}
            index={2}
            label="Solve streak"
            tone="sun"
            unit={analytics.currentStreak === 1 ? 'day' : 'days'}
            value={String(analytics.currentStreak)}
          />
          <KpiTile
            detail={topPlatform ? `${topPlatform[1]} solved` : 'Link a profile'}
            icon={
              topPlatform ? (
                <ProviderLogo className="size-5" provider={topPlatform[0]} />
              ) : (
                <Link2 className="size-5" strokeWidth={2} />
              )
            }
            index={3}
            label="Top platform"
            value={topPlatform ? providerLabels[topPlatform[0]] : 'None yet'}
          />
          <KpiTile
            detail={
              topTopic ? `${topTopic.solved} in 30 days` : 'No solves yet'
            }
            icon={<Shapes className="size-5" strokeWidth={2} />}
            index={4}
            label="Top topic"
            value={topTopic ? topTopic.topic : 'None yet'}
          />
          <KpiTile
            detail={`of the last ${analytics.window.days} days`}
            icon={<CalendarCheck className="size-5" strokeWidth={2} />}
            index={5}
            label="Active days"
            value={String(activeDays)}
          />
          <KpiTile
            detail="Last 30 days"
            icon={<Trophy className="size-5" strokeWidth={2} />}
            index={6}
            label="Contests"
            value={String(recentContests.length)}
          />
        </dl>

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
          className="animate-rise relative isolate flex min-h-64 min-w-0 flex-col overflow-hidden rounded-xl bg-ink p-6 text-ink-foreground xl:col-span-3 xl:min-h-0 xl:p-5"
          style={stagger(5)}
        >
          <span
            aria-hidden="true"
            className="coach-orb animate-orb absolute -top-10 -right-10 size-36 opacity-90"
          />
          <h2
            className="font-sans text-sm font-medium opacity-70"
            id="coach-focus-heading"
          >
            Your coach is focusing on
          </h2>
          {roadmapQuery.isError ? (
            <p className={cn(noticeClass, 'mt-4')} role="status">
              Your roadmap is temporarily unavailable. Open Coach to retry it.
            </p>
          ) : leadTopic ? (
            <>
              <p className="mt-2 max-w-[70%] font-heading text-3xl leading-tight font-bold tracking-[-0.03em] xl:text-[1.7rem]">
                {leadTopic.name}
              </p>
              <p className="mt-2 line-clamp-2 max-w-md text-sm opacity-70 [@media(max-height:760px)]:line-clamp-1">
                {leadTopic.reason}
              </p>
              <button
                className="mt-3 w-fit rounded-md border border-white/30 px-3 py-1 text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
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
                      className="rounded-md bg-white/10 px-3 py-1 text-xs dark:bg-black/10"
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
            className="group/cta mt-auto inline-flex w-fit items-center gap-2 rounded-md bg-white py-1.5 pr-1.5 pl-4 text-sm font-medium text-[#101012] transition-transform duration-300 active:scale-[0.98] dark:bg-[#101012] dark:text-white"
            to="/coach"
          >
            Continue with coach
            <span className="grid size-7 place-items-center rounded-md bg-[#101012]/8 transition-transform duration-300 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-px dark:bg-white/10">
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
              {recommendations.map((item) => (
                <li
                  className="flex min-w-0 flex-1 items-center gap-3 py-1.5"
                  key={item.id}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"
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
                    className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-foreground/70 transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
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
                </li>
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
            <p className="mt-4 text-sm text-muted-foreground" role="status">
              Loading recent activity…
            </p>
          ) : recentEvents.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No dated activity yet. Sync a platform or record progress to start
              your history.
            </p>
          ) : (
            <ol className="mt-1.5 flex min-h-0 flex-1 flex-col divide-y divide-border overflow-hidden [@media(max-height:1000px)]:[&>li:nth-child(n+4)]:hidden">
              {recentEvents.map((event) => {
                const solved =
                  (event.source === 'manual' && event.eventType === 'solved') ||
                  isAcceptedSubmission(event)
                return (
                  <li
                    className="flex min-w-0 flex-1 items-center gap-3 py-1.5"
                    key={event.id}
                  >
                    <span
                      aria-hidden="true"
                      className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"
                    >
                      <ProviderLogo
                        className="size-5"
                        provider={event.provider}
                      />
                      <span
                        className={cn(
                          'absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card',
                          solved ? 'bg-go' : 'bg-muted-foreground/60',
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
                            ? 'Solved'
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
                  </li>
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
