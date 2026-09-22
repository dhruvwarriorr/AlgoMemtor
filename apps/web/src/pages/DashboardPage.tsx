import { useState, type CSSProperties, type FormEvent } from 'react'
import type { ProviderKey } from '@algomemtor/shared-contracts'
import { ArrowRight, ArrowUpRight, Flame, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { displayNameFromEmail } from '@/lib/display-name'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { useAuth } from '@/features/auth/useAuth'
import { useCoachRoadmap } from '@/features/coach/hooks'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { useActivity, useAnalytics } from '@/features/platform/hooks'
import { SolvedHeatmap } from '@/features/progress/components/SolvedHeatmap'
import { useProgressAnalytics } from '@/features/progress/hooks/useProgress'
import { useRecommendations } from '@/features/recommendations/hooks/useRecommendations'
import { cn } from '@/lib/utils'

import { dashboardActivity, isAcceptedSubmission } from './dashboard-activity'

const tileClass =
  'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.4rem] border border-border bg-card p-5'

const tileTitleClass =
  'flex items-center justify-between gap-3 text-sm font-medium text-muted-foreground'

const noticeClass =
  'rounded-xl border border-sun/60 bg-sun-soft p-3 text-sm text-sun-foreground'

const stagger = (index: number) => ({ '--i': index }) as CSSProperties

function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
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
      className="flex h-13 w-full items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-1.5 pl-4 shadow-soft transition-[border-color,box-shadow] duration-300 focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15 sm:w-[27rem]"
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
        className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-ink-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-105 active:scale-95"
        type="submit"
      >
        <ArrowUpRight aria-hidden="true" className="size-4" />
      </button>
    </form>
  )
}

function DashboardPage() {
  const { user } = useAuth()
  const analyticsQuery = useProgressAnalytics(30)
  const activityQuery = useActivity()
  const platformAnalyticsQuery = useAnalytics()
  const recommendationsQuery = useRecommendations()
  const roadmapQuery = useCoachRoadmap()
  const title = `${greeting()}, ${displayNameFromEmail(user?.email)}`
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

  const topLanguage = Object.entries(
    platformAnalyticsQuery.data?.languageCounts ?? {},
  ).sort(([, a], [, b]) => b - a)[0]

  const focusTopics = (roadmapQuery.data?.data?.topics ?? []).filter(
    (topic) =>
      topic.lane === 'current_focus' ||
      topic.lane === 'needs_more_practice' ||
      topic.lane === 'revisit_later',
  )
  const [leadTopic, ...otherTopics] = focusTopics

  const snapshot = [
    {
      label: 'Top platform',
      value: topPlatform ? providerLabels[topPlatform[0]] : 'None yet',
      detail: topPlatform ? `${topPlatform[1]} solved` : 'Link a profile',
      provider: topPlatform?.[0],
    },
    {
      label: 'Top topic',
      value: topTopic ? topTopic.topic : 'None yet',
      detail: topTopic ? `${topTopic.solved} in 30 days` : 'No solves yet',
    },
    {
      label: 'Language',
      value: topLanguage ? topLanguage[0] : 'None yet',
      detail: topLanguage ? `${topLanguage[1]} solves` : 'No submissions',
    },
    {
      label: 'Contests',
      value: String(recentContests.length),
      detail: 'Last 30 days',
    },
  ]

  return (
    <PageContainer className="gap-6 lg:h-[calc(100dvh-2rem)] lg:min-h-[46rem] lg:flex-none lg:overflow-hidden">
      <PageHeader
        action={<AskCoachBar />}
        className="sm:items-center"
        description={description}
        title={title}
      />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-12 lg:grid-rows-2">
        <section
          aria-labelledby="solved-heading"
          className="animate-rise relative isolate flex min-h-52 flex-col justify-between overflow-hidden rounded-[1.4rem] p-6 text-white [background:linear-gradient(155deg,#2a6df0,#1a5ae6_45%,#12348f)] lg:col-span-3 lg:min-h-0"
          style={stagger(1)}
        >
          <span
            aria-hidden="true"
            className="cloud -right-14 -bottom-12 w-64 opacity-30"
          />
          <div className="flex items-center justify-between text-white/80">
            <h2 className="font-sans text-sm font-medium" id="solved-heading">
              New problems solved
            </h2>
            <Link
              aria-label="View analytics"
              className="grid size-8 place-items-center rounded-full bg-white/15 transition-transform duration-300 hover:scale-110"
              to="/analytics"
            >
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <p>
            <span className="block font-heading text-[5.5rem] leading-none font-bold tracking-[-0.06em]">
              {analytics.window.solved}
            </span>
            <span className="mt-2 block text-sm text-white/75">
              in the last 30 local days
            </span>
          </p>
        </section>

        <section
          aria-labelledby="streak-heading"
          className="animate-rise flex min-h-44 flex-col justify-between rounded-[1.4rem] bg-sun-soft p-5 text-sun-foreground ring-1 ring-sun/45 lg:col-span-2 lg:min-h-0"
          style={stagger(2)}
        >
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-full bg-sun text-[#0b1220]"
          >
            <Flame className="size-5" strokeWidth={2} />
          </span>
          <div>
            <h2 className="font-sans text-sm font-medium" id="streak-heading">
              Solve streak
            </h2>
            <p className="mt-1 font-heading text-5xl leading-none font-bold tracking-[-0.05em] text-foreground">
              {analytics.currentStreak}
              <span className="ml-1.5 text-lg font-semibold tracking-normal">
                {analytics.currentStreak === 1 ? 'day' : 'days'}
              </span>
            </p>
            <p className="mt-2 text-xs">
              Longest: {analytics.longestStreak}{' '}
              {analytics.longestStreak === 1 ? 'day' : 'days'}
            </p>
          </div>
        </section>

        <section
          aria-labelledby="snapshot-heading"
          className={cn(tileClass, 'animate-rise p-0 lg:col-span-4')}
          style={stagger(3)}
        >
          <h2 className="sr-only" id="snapshot-heading">
            Practice snapshot
          </h2>
          <dl className="grid h-full grid-cols-2 [&>div:nth-child(-n+2)]:border-b [&>div:nth-child(odd)]:border-r [&>div]:border-border">
            {snapshot.map((item) => (
              <div
                className="flex min-w-0 flex-col justify-between gap-2 p-4"
                key={item.label}
              >
                <dt className="text-xs font-medium text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5 font-heading text-lg leading-tight font-semibold tracking-[-0.02em] text-foreground">
                    {item.provider ? (
                      <ProviderLogo
                        className="size-4 shrink-0 text-primary"
                        provider={item.provider}
                      />
                    ) : null}
                    <span className="truncate">{item.value}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {item.detail}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <div
          className="animate-rise min-h-0 min-w-0 lg:col-span-3 [&>div]:rounded-[1.4rem]"
          style={stagger(4)}
        >
          <SolvedHeatmap trend={analytics.trend} />
        </div>

        <section
          aria-labelledby="coach-focus-heading"
          className="animate-rise relative isolate flex min-h-64 min-w-0 flex-col overflow-hidden rounded-[1.4rem] bg-ink p-6 text-ink-foreground lg:col-span-4 lg:min-h-0"
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
              <p className="mt-3 max-w-[70%] font-heading text-3xl leading-tight font-bold tracking-[-0.03em]">
                {leadTopic.name}
              </p>
              <p className="mt-2 line-clamp-2 max-w-md text-sm opacity-70">
                {leadTopic.reason}
              </p>
              {otherTopics.length > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {otherTopics.slice(0, 3).map((topic) => (
                    <li
                      className="rounded-full bg-white/10 px-3 py-1 text-xs dark:bg-black/10"
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
            className="group/cta mt-auto inline-flex w-fit items-center gap-2 rounded-full bg-white py-1.5 pr-1.5 pl-4 text-sm font-medium text-[#0b1220] transition-transform duration-300 active:scale-[0.98] dark:bg-[#0b1220] dark:text-white"
            to="/coach"
          >
            Continue with coach
            <span className="grid size-7 place-items-center rounded-full bg-[#0b1220]/8 transition-transform duration-300 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-px dark:bg-white/10">
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </span>
          </Link>
        </section>

        <section
          aria-labelledby="next-practice-heading"
          className={cn(tileClass, 'animate-rise lg:col-span-5')}
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
            <ul className="mt-2 flex min-h-0 flex-1 flex-col divide-y divide-border">
              {recommendations.map((item) => (
                <li
                  className="flex min-w-0 flex-1 items-center gap-3 py-2"
                  key={item.id}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"
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
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-foreground/70 transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                    href={item.problem.canonicalUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <ArrowUpRight aria-hidden="true" className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="activity-heading"
          className={cn(tileClass, 'animate-rise lg:col-span-3')}
          style={stagger(7)}
        >
          <div className={tileTitleClass}>
            <h2 className="font-sans text-sm font-medium" id="activity-heading">
              Recent activity
            </h2>
            <TileLink label="All" to="/activity" />
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
            <ol className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              {recentEvents.map((event) => {
                const solved =
                  (event.source === 'manual' && event.eventType === 'solved') ||
                  isAcceptedSubmission(event)
                return (
                  <li className="flex min-w-0 items-start gap-3" key={event.id}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        solved ? 'bg-go' : 'bg-foreground/25',
                      )}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {event.title ?? event.externalId ?? 'Contest activity'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
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
