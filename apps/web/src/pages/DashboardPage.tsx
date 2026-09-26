import type { ProviderKey } from '@algomemtor/shared-contracts'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { useUserIdentity } from '@/features/auth/user-identity'
import { useCoachRoadmap, useSetCoachTopicStatus } from '@/features/coach/hooks'
import { CoachCore } from '@/features/dashboard/CoachCore'
import { greeting } from '@/features/dashboard/dashboard-format'
import { ActivityCard, UpNextCard } from '@/features/dashboard/FeedCards'
import { MomentumHero } from '@/features/dashboard/MomentumHero'
import { PulseTiles } from '@/features/dashboard/PulseTiles'
import { RatingTrendCard } from '@/features/dashboard/RatingTrendCard'
import { TopicMixCard } from '@/features/dashboard/TopicMixCard'
import { useActivity, useAnalytics } from '@/features/platform/hooks'
import { useProgressAnalytics } from '@/features/progress/hooks/useProgress'
import {
  useDismissRecommendation,
  useRecommendations,
} from '@/features/recommendations/hooks/useRecommendations'

import { dashboardActivity } from './dashboard-activity'

function DashboardPage() {
  const identity = useUserIdentity()
  const analyticsQuery = useProgressAnalytics(30)
  const activityQuery = useActivity()
  const platformAnalyticsQuery = useAnalytics()
  const recommendationsQuery = useRecommendations()
  const roadmapQuery = useCoachRoadmap()
  const dismissRecommendation = useDismissRecommendation()
  const setTopicStatus = useSetCoachTopicStatus()
  const greetingText = greeting()
  const title = `${greetingText}, ${identity.name}`
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
  )
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)

  const windowStart =
    new Date(analytics.generatedAt).getTime() -
    analytics.window.days * 86_400_000
  const recentContests = (
    platformAnalyticsQuery.data?.contestParticipation ?? []
  )
    .filter(
      (contest) =>
        contest.attendedAt !== undefined &&
        new Date(contest.attendedAt).getTime() >= windowStart,
    )
    .sort((left, right) =>
      (left.attendedAt ?? '').localeCompare(right.attendedAt ?? ''),
    )
    .map((contest) => ({
      key: `${contest.provider}:${contest.contestId}`,
      ...(contest.ratingChange === undefined
        ? {}
        : { delta: contest.ratingChange }),
    }))

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

  return (
    <PageContainer accent="sky" className="dash-flat gap-5 xl:py-7">
      <MomentumHero
        activeDays={activeDays}
        currentStreak={analytics.currentStreak}
        greetingText={greetingText}
        longestStreak={analytics.longestStreak}
        name={identity.name}
        solved={analytics.window.solved}
        trend={analytics.trend}
        windowDays={analytics.window.days}
      />

      <PulseTiles
        activeDays={activeDays}
        contests={recentContests}
        currentStreak={analytics.currentStreak}
        longestStreak={analytics.longestStreak}
        providers={solvedByProvider}
        solved={analytics.window.solved}
        topics={analytics.topicActivity}
        trend={analytics.trend}
        windowDays={analytics.window.days}
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-12">
        <RatingTrendCard
          className="lg:col-span-8"
          history={platformAnalyticsQuery.data?.ratingHistory ?? []}
        />
        <TopicMixCard
          className="lg:col-span-4"
          topics={analytics.topicActivity}
        />
        <CoachCore
          className="lg:col-span-5 xl:col-span-4 lg:row-span-2"
          dismissFailed={setTopicStatus.isError}
          dismissing={setTopicStatus.isPending}
          onDismiss={(topic) =>
            void setTopicStatus.mutateAsync({ topic, status: 'skip_for_now' })
          }
          topics={focusTopics}
          unavailable={roadmapQuery.isError}
        />
        <UpNextCard
          className="lg:col-span-7 xl:col-span-8"
          dismissing={dismissRecommendation.isPending}
          items={recommendations}
          onDismiss={(id) => void dismissRecommendation.mutateAsync(id)}
          unavailable={recommendationsQuery.isError}
        />
        <ActivityCard
          className="lg:col-span-7 xl:col-span-8"
          events={recentEvents}
          loading={activityQuery.isPending}
          unavailable={activityQuery.isError}
        />
      </div>
    </PageContainer>
  )
}

export default DashboardPage
