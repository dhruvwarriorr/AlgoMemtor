import type { ProviderKey } from '@algomemtor/shared-contracts'
import { Link } from 'react-router-dom'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'
import { useCoachRoadmap } from '@/features/coach/hooks'
import { useActivity, useAnalytics } from '@/features/platform/hooks'
import { providerLabels } from '@/features/platform/components/provider-labels'
import { SolvedHeatmap } from '@/features/progress/components/SolvedHeatmap'
import { useProgressAnalytics } from '@/features/progress/hooks/useProgress'
import { useRecommendations } from '@/features/recommendations/hooks/useRecommendations'

import { dashboardActivity, isAcceptedSubmission } from './dashboard-activity'

function DashboardPage() {
  const analyticsQuery = useProgressAnalytics(30)
  const activityQuery = useActivity()
  const platformAnalyticsQuery = useAnalytics()
  const recommendationsQuery = useRecommendations()
  const roadmapQuery = useCoachRoadmap()

  if (analyticsQuery.isPending) {
    return (
      <PageContainer>
        <PageHeader
          description="Review your recommendations and evidence-backed learning activity."
          title="Dashboard"
        />
        <PageSkeleton label="Loading your dashboard" rows={4} />
      </PageContainer>
    )
  }

  if (analyticsQuery.isError || analyticsQuery.data === undefined) {
    return (
      <PageContainer>
        <PageHeader
          description="Review your recommendations and evidence-backed learning activity."
          title="Dashboard"
        />
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
  const recentEvents = dashboardActivity(activityQuery.data?.data ?? [])
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

  return (
    <PageContainer>
      <PageHeader
        description="Review your recommendations and evidence-backed learning activity."
        title="Dashboard"
      />

      <section aria-labelledby="progress-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              className="text-xl font-semibold tracking-tight text-foreground"
              id="progress-heading"
            >
              Your progress
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Last 30 local days · current streak {analytics.currentStreak} days
            </p>
          </div>
          <Link
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            to="/analytics"
          >
            View analytics
          </Link>
        </div>
        <div className="grid min-w-0 gap-3 lg:grid-cols-4">
          <dl className="flex min-w-0 flex-col gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="text-sm text-muted-foreground">
                New problems solved
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {analytics.window.solved}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="text-sm text-muted-foreground">Solve streak</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {analytics.currentStreak}{' '}
                {analytics.currentStreak === 1 ? 'day' : 'days'}
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">
                Longest: {analytics.longestStreak}{' '}
                {analytics.longestStreak === 1 ? 'day' : 'days'}
              </p>
            </div>
          </dl>
          <dl className="flex min-w-0 flex-col gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="text-sm text-muted-foreground">
                Most solved platform
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {topPlatform ? providerLabels[topPlatform[0]] : '—'}
              </dd>
              {topPlatform ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {topPlatform[1]} solved all-time
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="text-sm text-muted-foreground">
                Most solved topic
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {topTopic ? topTopic.topic : '—'}
              </dd>
              {topTopic ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {topTopic.solved} solved in last 30 days
                </p>
              ) : null}
            </div>
          </dl>
          <dl className="flex min-w-0 flex-col gap-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="text-sm text-muted-foreground">
                Contests participated
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {recentContests.length}
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">
                In the last 30 days
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <dt className="text-sm text-muted-foreground">
                Most used language
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {topLanguage ? topLanguage[0] : '—'}
              </dd>
              {topLanguage ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {topLanguage[1]} solves all-time
                </p>
              ) : null}
            </div>
          </dl>
          <div className="min-w-0">
            <SolvedHeatmap trend={analytics.trend} />
          </div>
        </div>
      </section>

      {roadmapQuery.isError ? (
        <p
          className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
          role="status"
        >
          Your roadmap is temporarily unavailable. Open Coach to retry it.
        </p>
      ) : null}
      {roadmapQuery.data?.data ? (
        <section
          aria-labelledby="roadmap-preview-heading"
          className="space-y-3 border-t border-border pt-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                className="text-xl font-semibold tracking-tight text-foreground"
                id="roadmap-preview-heading"
              >
                Topics due for attention
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Revisit topics and current-focus work surfaced by the adaptive
                roadmap.
              </p>
            </div>
            <Link
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              to="/coach"
            >
              Open roadmap
            </Link>
          </div>
          {(() => {
            const topics = roadmapQuery.data.data.topics
              .filter(
                (topic) =>
                  topic.lane === 'needs_more_practice' ||
                  topic.lane === 'revisit_later' ||
                  topic.lane === 'current_focus',
              )
              .slice(0, 3)
            return topics.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                No topics are due for attention right now. The coach will
                surface the next evidence-backed step as new activity arrives.
              </p>
            ) : (
              <ul className="grid min-w-0 gap-3 sm:grid-cols-3">
                {topics.map((topic) => (
                  <li
                    className="min-w-0 rounded-lg border border-border bg-card p-4"
                    key={topic.topic}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {topic.lane.replaceAll('_', ' ')} ·{' '}
                      {topic.assessment.replaceAll('_', ' ')}
                    </p>
                    <p className="mt-1 break-words font-medium text-foreground">
                      {topic.name}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {topic.reason}
                    </p>
                  </li>
                ))}
              </ul>
            )
          })()}
        </section>
      ) : null}

      <section
        aria-labelledby="activity-heading"
        className="space-y-3 border-t border-border pt-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              className="text-xl font-semibold tracking-tight text-foreground"
              id="activity-heading"
            >
              Recent activity
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manual progress and provider observations are shown with their
              source.
            </p>
          </div>
          <Link
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            to="/activity"
          >
            View activity
          </Link>
        </div>
        {activityQuery.isError ? (
          <p
            className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
            role="status"
          >
            Recent activity is temporarily unavailable.
          </p>
        ) : activityQuery.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading recent activity…
          </p>
        ) : recentEvents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No dated activity yet. Sync a connected platform or record manual
            progress to start your history.
          </p>
        ) : (
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentEvents.map((event) => (
              <li
                className="min-w-0 rounded-lg border border-border bg-card p-4"
                key={event.id}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {providerLabels[event.provider]} ·{' '}
                  {event.source === 'manual'
                    ? event.eventType === 'solved'
                      ? 'Marked solved'
                      : 'Marked attempted'
                    : isAcceptedSubmission(event)
                      ? 'Solved problem'
                      : event.eventType.replaceAll('_', ' ')}
                </p>
                <p className="mt-1 break-words font-medium text-foreground">
                  {event.title ?? event.externalId ?? 'Contest activity'}
                </p>
                {event.verdict && !isAcceptedSubmission(event) ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.verdict}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.source === 'manual' ? 'Manual' : 'Provider'} record
                </p>
                <time
                  className="mt-2 block text-xs text-muted-foreground"
                  dateTime={event.occurredAt ?? undefined}
                >
                  {event.occurredAt
                    ? new Date(event.occurredAt).toLocaleString()
                    : 'Date unavailable'}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="recommendations-heading"
        className="space-y-3 border-t border-border pt-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              className="text-xl font-semibold tracking-tight text-foreground"
              id="recommendations-heading"
            >
              Next practice
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A preview of your provider-attributed recommendation feed.
            </p>
          </div>
          <Link to="/recommendations">
            <Button size="sm" type="button" variant="outline">
              Open recommendations
            </Button>
          </Link>
        </div>
        {recommendationsQuery.isError ? (
          <p
            className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
            role="status"
          >
            Recommendations are temporarily unavailable.
          </p>
        ) : recommendations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No recommendations yet. Visit Recommendations to refresh the feed.
          </p>
        ) : (
          <ul className="grid min-w-0 gap-3 sm:grid-cols-3">
            {recommendations.map((item) => (
              <li
                className="min-w-0 rounded-lg border border-border bg-card p-4"
                key={item.id}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {item.problem.provider} · {item.problem.externalId}
                </p>
                <p className="mt-1 break-words font-medium text-foreground">
                  {item.problem.title}
                </p>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {item.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  )
}

export default DashboardPage
