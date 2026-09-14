import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { LearnerProblemStatus } from '@algomemtor/shared-contracts'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button } from '@/components/ui/button'
import { ProblemLearningControls } from '@/features/progress/components/ProblemLearningControls'
import { ProgressHistoryFilters } from '@/features/progress/components/ProgressHistoryFilters'
import type {
  ProgressHistoryEvent,
  ProgressHistoryEventType,
  ProgressHistoryQuery,
} from '@/features/progress/contracts'
import {
  useProblemProgress,
  useProgressAnalytics,
  useProgressHistory,
} from '@/features/progress/hooks/useProgress'
import { useLearnerMemories } from '@/features/memory/hooks/useLearnerMemories'

const eventLabels: Record<ProgressHistoryEventType, string> = {
  status_changed: 'Status changed',
  reflection_created: 'Reflection saved',
  timer_started: 'Timer started',
  timer_paused: 'Timer paused',
  timer_completed: 'Timer completed',
  timer_discarded: 'Timer discarded',
  impression: 'Recommendation viewed',
  opened: 'Opened on provider',
  bookmark_added: 'Bookmark added',
  bookmark_removed: 'Bookmark removed',
  dismissed: 'Recommendation dismissed',
  dismissal_restored: 'Recommendation restored',
}

const eventTypeValues = Object.keys(eventLabels) as ProgressHistoryEventType[]

function validStatus(value: string | null): LearnerProblemStatus | undefined {
  return value === 'unsolved' || value === 'attempted' || value === 'solved'
    ? value
    : undefined
}

function validEventType(
  value: string | null,
): ProgressHistoryEventType | undefined {
  return value && eventTypeValues.includes(value as ProgressHistoryEventType)
    ? (value as ProgressHistoryEventType)
    : undefined
}

function useHistoryQuery() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = useMemo<ProgressHistoryQuery>(() => {
    const eventType = validEventType(searchParams.get('eventType'))
    const status = validStatus(searchParams.get('status'))
    const topic = searchParams.get('topic')?.trim()
    const externalId = searchParams.get('externalId')?.trim()
    const cursor = searchParams.get('cursor')?.trim()

    return {
      limit: 25,
      ...(cursor ? { cursor } : {}),
      ...(eventType ? { eventType } : {}),
      ...(status ? { status } : {}),
      ...(topic ? { topic } : {}),
      ...(externalId ? { externalId } : {}),
    }
  }, [searchParams])

  function update(updates: Partial<ProgressHistoryQuery>) {
    const next = new URLSearchParams(searchParams)
    if ('eventType' in updates) {
      if (updates.eventType) next.set('eventType', updates.eventType)
      else next.delete('eventType')
    }
    if ('status' in updates) {
      if (updates.status) next.set('status', updates.status)
      else next.delete('status')
    }
    if ('topic' in updates) {
      if (updates.topic) next.set('topic', updates.topic)
      else next.delete('topic')
    }
    if ('externalId' in updates) {
      if (updates.externalId) next.set('externalId', updates.externalId)
      else next.delete('externalId')
    }
    next.delete('cursor')
    setSearchParams(next)
  }

  function setCursor(cursor: string | undefined) {
    const next = new URLSearchParams(searchParams)
    if (cursor) next.set('cursor', cursor)
    else next.delete('cursor')
    setSearchParams(next)
  }

  function clear() {
    setSearchParams(new URLSearchParams())
  }

  return {
    query,
    hasActiveFilters: Boolean(
      query.cursor ||
      query.eventType ||
      query.status ||
      query.topic ||
      query.externalId,
    ),
    update,
    setCursor,
    clear,
  }
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return 'Not available'
  const rounded = Math.max(0, Math.round(seconds))
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function formatDate(value: string, timezone?: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(value))
  } catch {
    return new Date(value).toLocaleString()
  }
}

function MetricCard({
  detail,
  label,
  value,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </dd>
      {detail ? (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  )
}

function AnalyticsSection({
  analytics,
}: {
  analytics: NonNullable<ReturnType<typeof useProgressAnalytics>['data']>
}) {
  const maxActivity = Math.max(
    1,
    ...analytics.data.trend.map((point) => point.attempted + point.solved),
  )
  const { recommendationConversions: conversions } = analytics.data

  return (
    <div className="space-y-6">
      <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          detail={`${analytics.data.inventory.unsolved} unsolved`}
          label="Problems solved"
          value={String(analytics.data.inventory.solved)}
        />
        <MetricCard
          detail={`${analytics.data.inventory.attempted} attempted`}
          label="Completion rate"
          value={`${Math.round(analytics.data.completionRate * 100)}%`}
        />
        <MetricCard
          detail={`${analytics.data.longestStreak} days longest`}
          label="Current streak"
          value={`${analytics.data.currentStreak} days`}
        />
        <MetricCard
          detail="Completed, non-discarded timers"
          label="Focused time"
          value={formatDuration(analytics.data.focusedSeconds)}
        />
      </dl>

      <section aria-labelledby="progress-trend-heading" className="space-y-3">
        <div>
          <h3
            className="text-lg font-semibold text-foreground"
            id="progress-trend-heading"
          >
            Last 30 days
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Dates use {analytics.data.timezone}. Each bar combines attempted and
            solved activity for that calendar day.
          </p>
        </div>
        <div
          aria-label="30-day attempted and solved activity"
          className="flex min-w-0 gap-1 overflow-x-auto rounded-lg border border-border bg-card p-3"
          role="img"
        >
          {analytics.data.trend.map((point) => {
            const total = point.attempted + point.solved
            const height = Math.max(4, Math.round((total / maxActivity) * 100))
            return (
              <div
                className="flex w-7 shrink-0 flex-col items-center justify-end gap-1"
                key={point.date}
                title={`${point.date}: ${point.attempted} attempted, ${point.solved} solved`}
              >
                <div className="flex h-28 w-4 items-end rounded-sm bg-muted">
                  <div
                    className="w-full rounded-sm bg-primary"
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {point.date.slice(8)}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="progress-metrics-heading"
          className="rounded-lg border border-border bg-card p-4"
        >
          <h3
            className="text-lg font-semibold text-foreground"
            id="progress-metrics-heading"
          >
            Practice signals
          </h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Average time to solve"
              value={formatDuration(analytics.data.averageSolvedSeconds)}
            />
            <MetricCard
              label="Longest streak"
              value={`${analytics.data.longestStreak} days`}
            />
            <MetricCard
              detail={`${conversions.opens} opens from ${conversions.impressions} views`}
              label="Impressions → opens"
              value={`${Math.round(conversions.impressionToOpen * 100)}%`}
            />
            <MetricCard
              detail={`${conversions.solved} solved recommendations`}
              label="Impressions → solves"
              value={`${Math.round(conversions.impressionToSolve * 100)}%`}
            />
          </dl>
        </section>

        <section
          aria-labelledby="topic-scores-heading"
          className="rounded-lg border border-border bg-card p-4"
        >
          <h3
            className="text-lg font-semibold text-foreground"
            id="topic-scores-heading"
          >
            Topic signals
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Directional scores from recorded status, perceived difficulty, and
            completed timer evidence—not provider verdicts.
          </p>
          {analytics.data.topicScores.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Add a status, reflection, or completed timer to see topic signals.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {analytics.data.topicScores.map((score) => (
                <li key={score.topic}>
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-medium text-foreground">
                      {score.topic}
                    </span>
                    <span className="text-muted-foreground">
                      {score.score}/100 · {score.evidenceCount} evidence
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${score.score}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {score.formula}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="text-xs text-muted-foreground">
        Analytics generated{' '}
        {formatDate(analytics.data.generatedAt, analytics.data.timezone)}.
      </p>
    </div>
  )
}

function ProgressHistoryItem({ event }: { event: ProgressHistoryEvent }) {
  const progressQuery = useProblemProgress(event.problem)
  const progress = progressQuery.data?.data
  const eventStatus = event.status ?? progress?.status ?? 'unsolved'
  const eventBookmarked =
    progress?.bookmarked ?? event.eventType === 'bookmark_added'

  return (
    <li className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {eventLabels[event.eventType]}
          </p>
          <p className="mt-1 break-all text-sm text-muted-foreground">
            {event.problem.provider} · {event.problem.externalId}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(event.occurredAt)}
          </p>
        </div>
        {event.durationSeconds !== undefined ? (
          <span className="rounded-full bg-muted px-2 py-1 text-xs text-foreground">
            {formatDuration(event.durationSeconds)}
          </span>
        ) : null}
      </div>
      {event.reflection?.note ? (
        <p className="mt-3 rounded-md bg-muted/50 p-3 text-sm leading-6 text-foreground">
          {event.reflection.note}
        </p>
      ) : null}
      {progressQuery.isError ? (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          Current status could not be refreshed; controls use the last recorded
          status.
        </p>
      ) : null}
      <div className="mt-4 border-t border-border pt-3">
        <ProblemLearningControls
          initialBookmarked={eventBookmarked}
          initialStatus={eventStatus}
          problem={event.problem}
          sourceContext="progress"
        />
      </div>
    </li>
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
  const historyFilters = useHistoryQuery()
  const analyticsQuery = useProgressAnalytics(30)
  const historyQuery = useProgressHistory(historyFilters.query)

  return (
    <PageContainer>
      <PageHeader
        description="Track attempted and solved problems without inferring progress from link clicks."
        title="Progress"
      />

      <MemoryProcessingNotice />

      <section
        aria-labelledby="progress-analytics-heading"
        className="space-y-4"
      >
        <div>
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="progress-analytics-heading"
          >
            30-day overview
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only explicit statuses, reflections, timer evidence, and tracked
            recommendation actions contribute to these numbers.
          </p>
        </div>
        {analyticsQuery.isPending ? (
          <PageSkeleton label="Loading progress analytics" rows={3} />
        ) : analyticsQuery.isError ? (
          <ErrorState
            message={
              analyticsQuery.error instanceof Error
                ? analyticsQuery.error.message
                : 'Progress analytics could not be loaded.'
            }
            onRetry={() => void analyticsQuery.refetch()}
            title="Analytics unavailable"
          />
        ) : analyticsQuery.data ? (
          <AnalyticsSection analytics={analyticsQuery.data} />
        ) : null}
      </section>

      <section
        aria-labelledby="progress-history-heading"
        className="space-y-4 border-t border-border pt-6"
      >
        <div>
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="progress-history-heading"
          >
            Activity history
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Status and bookmark controls remain available on every recorded
            problem.
          </p>
        </div>
        <ProgressHistoryFilters
          hasActiveFilters={historyFilters.hasActiveFilters}
          onClear={historyFilters.clear}
          onUpdate={historyFilters.update}
          query={historyFilters.query}
        />
        {historyQuery.isPending ? (
          <PageSkeleton label="Loading progress history" rows={4} />
        ) : historyQuery.isError ? (
          <ErrorState
            message={
              historyQuery.error instanceof Error
                ? historyQuery.error.message
                : 'Progress history could not be loaded.'
            }
            onRetry={() => void historyQuery.refetch()}
            title="History unavailable"
          />
        ) : historyQuery.data?.data.length === 0 ? (
          <EmptyState
            action={
              historyFilters.hasActiveFilters ? (
                <Button onClick={historyFilters.clear} type="button">
                  Clear filters
                </Button>
              ) : undefined
            }
            description={
              historyFilters.hasActiveFilters
                ? 'Try a broader activity filter.'
                : 'Mark a problem attempted, save a reflection, or start a timer to build your history.'
            }
            title={
              historyFilters.hasActiveFilters
                ? 'No activity matches'
                : 'No activity yet'
            }
          />
        ) : historyQuery.data ? (
          <>
            <ol className="space-y-3">
              {historyQuery.data.data.map((event) => (
                <ProgressHistoryItem event={event} key={event.id} />
              ))}
            </ol>
            {historyQuery.data.meta.hasMore &&
            historyQuery.data.meta.nextCursor ? (
              <Button
                disabled={historyQuery.isFetching}
                onClick={() =>
                  historyFilters.setCursor(historyQuery.data?.meta.nextCursor)
                }
                type="button"
                variant="outline"
              >
                {historyQuery.isFetching
                  ? 'Loading older activity…'
                  : 'Load older activity'}
              </Button>
            ) : null}
          </>
        ) : null}
      </section>
    </PageContainer>
  )
}

export default ProgressPage
