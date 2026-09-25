import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  CoachManualTopicStatus,
  CoachRoadmapLane,
  ImprovementTopic,
  ProviderKey,
  RevisionItem,
  RoadmapPlatformRefresh,
  RoadmapRefreshReason,
} from '@algomemtor/shared-contracts'

import {
  ArrowUpRight,
  CalendarCheck,
  RefreshCw,
  Send,
} from '@/components/icons/algo-icons'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { useNotification } from '@/app/useNotification'
import {
  useCoachRoadmap,
  useRefreshCoachRoadmap,
  useSetCoachTopicStatus,
  useSubmitCoachRoadmapNote,
} from '@/features/coach/hooks'
import { useReviewRevision, useRevisions } from '@/features/mentor/hooks'
import { useDismissProblem } from '@/features/recommendations/hooks/useRecommendations'
import { cn } from '@/lib/utils'

const laneLabels: Record<CoachRoadmapLane, string> = {
  current_focus: 'Current focus',
  needs_more_practice: 'Needs more practice',
  recommended_next: 'Recommended next',
  practiced_comfortable: 'Practiced / comfortable',
  revisit_later: 'Revisit later',
  skipped: 'Skipped',
}

const statusLabels: Record<CoachManualTopicStatus, string> = {
  working_on: 'Working on',
  practiced: 'Practiced',
  completed: 'Completed',
  revisit: 'Revisit later',
  skip_for_now: 'Skip for now',
}

const statusOptions = Object.keys(statusLabels) as CoachManualTopicStatus[]

const providerLabels: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
}

const refreshReasonText: Record<RoadmapRefreshReason, string> = {
  stale_platform_data: 'Some of your platform data is out of date.',
  plan_unchanged: 'Your plan has not changed in over a week.',
}

function formatDate(value: string, withTime = true) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      ...(withTime ? { timeStyle: 'short' as const } : {}),
    }).format(new Date(value))
  } catch {
    return value
  }
}

function refreshSummary(platforms: readonly RoadmapPlatformRefresh[]) {
  const refreshed = platforms
    .filter((item) => item.status === 'refreshed')
    .map((item) => providerLabels[item.provider])
  if (platforms.length === 0) {
    return 'Rebuilt from your saved activity. Link a platform to pull new data.'
  }
  if (refreshed.length === 0) {
    return 'Your platforms were refreshed recently, so the plan was rebuilt from saved data.'
  }
  return `Pulled your latest activity from ${refreshed.join(', ')} and rebuilt the plan.`
}

const percent = (value: number) => `${Math.round(value * 100)}%`

function TopicCard({
  topic,
  onStatus,
  statusPending,
  onDismissProblem,
  dismissPending,
}: {
  topic: ImprovementTopic
  onStatus: (status: CoachManualTopicStatus | null) => void
  statusPending: boolean
  onDismissProblem: (provider: ProviderKey, externalId: string) => void
  dismissPending: boolean
}) {
  return (
    <article className="card-lift min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-semibold text-foreground">
            {topic.name}
          </h3>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
            {topic.assessment.replaceAll('_', ' ')} · {percent(topic.score)}{' '}
            score · {percent(topic.confidence)} confidence
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="sr-only">Manual status for {topic.name}</span>
          <select
            aria-label={`Manual status for ${topic.name}`}
            className="h-8 max-w-36 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={statusPending}
            onChange={(event) =>
              onStatus(
                event.target.value === ''
                  ? null
                  : (event.target.value as CoachManualTopicStatus),
              )
            }
            value={topic.manualStatus ?? ''}
          >
            <option value="">Use assessment</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="mt-3 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        disabled={statusPending}
        onClick={() =>
          onStatus(
            topic.manualStatus === 'skip_for_now' ? null : 'skip_for_now',
          )
        }
        type="button"
      >
        {topic.manualStatus === 'skip_for_now'
          ? 'Restore topic'
          : 'Dismiss topic'}
      </button>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {topic.reason}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
        <div>
          <dt>Problems</dt>
          <dd className="font-medium text-foreground">
            {topic.evidence.uniqueProblems}
          </dd>
        </div>
        <div>
          <dt>Observed solves</dt>
          <dd className="font-medium text-foreground">
            {topic.evidence.solvedProblems}
          </dd>
        </div>
        <div>
          <dt>Submissions</dt>
          <dd className="font-medium text-foreground">
            {topic.evidence.totalSubmissions}
          </dd>
        </div>
        <div>
          <dt>Recent practice</dt>
          <dd className="font-medium text-foreground">
            {topic.evidence.recentDays === 0
              ? 'Not observed'
              : `${topic.evidence.recentDays}d ago`}
          </dd>
        </div>
      </dl>
      {topic.suggestions.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Optional practice
          </p>
          <ul className="mt-2 space-y-2">
            {topic.suggestions.map((suggestion) => (
              <li
                className="flex min-w-0 items-start justify-between gap-2 text-sm"
                key={suggestion.id}
              >
                <a
                  className="min-w-0 break-words text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={suggestion.problem.canonicalUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {suggestion.problem.title}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {suggestion.band} ·{' '}
                    {providerLabels[suggestion.problem.provider]}
                  </span>
                </a>
                <button
                  aria-label={`Dismiss ${suggestion.problem.title}`}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  disabled={dismissPending}
                  onClick={() =>
                    onDismissProblem(
                      suggestion.problem.provider,
                      suggestion.problem.externalId,
                    )
                  }
                  title="Don't recommend this problem again"
                  type="button"
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}

const stageLabels = ['New', 'Day 3', 'Day 7', 'Day 21', 'Mastered']

function RevisionRow({
  item,
  pending,
  onReview,
}: {
  item: RevisionItem
  pending: boolean
  onReview: (outcome: 'remembered' | 'struggled') => void
}) {
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <a
          className="inline-flex max-w-full items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={item.canonicalUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className="truncate">{item.title}</span>
          <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="sr-only">
            (opens on {providerLabels[item.provider]})
          </span>
        </a>
        <p className="mt-1 text-xs text-muted-foreground">
          {providerLabels[item.provider]} · from{' '}
          {item.source === 'upsolve' ? 'upsolving' : 'Doubt Helper'} ·{' '}
          {item.completedAt !== undefined
            ? 'Mastered'
            : item.due
              ? 'Due now'
              : `Next review ${formatDate(item.dueAt, false)}`}{' '}
          · {stageLabels[item.stage] ?? 'Reviewing'}
        </p>
        {item.topics.length > 0 ? (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {item.topics.map((topic) => topic.replaceAll('-', ' ')).join(' · ')}
          </p>
        ) : null}
      </div>
      {item.completedAt === undefined ? (
        <div className="flex shrink-0 gap-2">
          <Button
            disabled={pending}
            onClick={() => onReview('struggled')}
            size="sm"
            type="button"
            variant="outline"
          >
            Struggled
          </Button>
          <Button
            disabled={pending}
            onClick={() => onReview('remembered')}
            size="sm"
            type="button"
          >
            Solved it again
          </Button>
        </div>
      ) : null}
    </li>
  )
}

function PathwayPage() {
  const { notify } = useNotification()
  const roadmapQuery = useCoachRoadmap()
  const revisionsQuery = useRevisions()
  const setTopicStatus = useSetCoachTopicStatus()
  const submitRoadmapNote = useSubmitCoachRoadmapNote()
  const refreshRoadmap = useRefreshCoachRoadmap()
  const dismissProblem = useDismissProblem()
  const reviewRevision = useReviewRevision()
  const [noteText, setNoteText] = useState('')
  const [showAllRevisions, setShowAllRevisions] = useState(false)

  const roadmap = roadmapQuery.data?.data
  const groupedTopics = useMemo(() => {
    const groups = new Map<CoachRoadmapLane, ImprovementTopic[]>()
    for (const topic of roadmap?.topics ?? []) {
      const values = groups.get(topic.lane) ?? []
      values.push(topic)
      groups.set(topic.lane, values)
    }
    return groups
  }, [roadmap?.topics])

  const header = (
    <PageHeader
      action={
        <Button
          disabled={refreshRoadmap.isPending || roadmapQuery.isPending}
          onClick={() =>
            refreshRoadmap.mutate(undefined, {
              onSuccess: (result) =>
                notify({
                  title: 'Learning pathway refreshed',
                  description: refreshSummary(result.meta.platforms),
                  tone: 'success',
                }),
              onError: (error) =>
                notify({
                  title: 'Could not refresh your pathway',
                  description:
                    error instanceof Error
                      ? error.message
                      : 'Try again shortly.',
                  tone: 'error',
                }),
            })
          }
          type="button"
          variant="outline"
        >
          <RefreshCw
            aria-hidden="true"
            className={cn(
              refreshRoadmap.isPending &&
                'animate-spin motion-reduce:animate-none',
            )}
          />
          {refreshRoadmap.isPending ? 'Refreshing…' : 'Refresh pathway'}
        </Button>
      }
      description="Your focus topics, what to learn next, optional practice, and the revision schedule that makes upsolved problems stick. Assessed from your provider evidence."
      title="Learning pathway"
    />
  )

  if (roadmapQuery.isPending) {
    return (
      <PageContainer>
        {header}
        <PageSkeleton label="Loading your learning pathway" rows={5} />
      </PageContainer>
    )
  }

  if (roadmapQuery.isError || roadmap === undefined) {
    return (
      <PageContainer>
        {header}
        <ErrorState
          message="Your learning pathway could not be loaded."
          onRetry={() => void roadmapQuery.refetch()}
          title="Pathway unavailable"
        />
      </PageContainer>
    )
  }

  const revisions = revisionsQuery.data?.data ?? []
  const activeRevisions = revisions.filter(
    (item) => item.completedAt === undefined,
  )
  const dueRevisions = activeRevisions.filter((item) => item.due)
  const shownRevisions = showAllRevisions
    ? revisions
    : dueRevisions.length > 0
      ? dueRevisions
      : activeRevisions.slice(0, 5)

  return (
    <PageContainer>
      {header}

      <div className="-mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-md bg-secondary px-2.5 py-1 font-medium text-secondary-foreground">
          {roadmap.topics.length} topics
        </span>
        {roadmap.lastRefreshedAt ? (
          <span>Last refreshed {formatDate(roadmap.lastRefreshedAt)}</span>
        ) : null}
      </div>

      {roadmap.refreshHint?.suggested && !refreshRoadmap.isPending ? (
        <div
          className="rounded-lg border border-sun/40 bg-sun-soft p-3 text-sm text-sun-foreground"
          role="status"
        >
          {roadmap.refreshHint.reasons
            .map((reason) => refreshReasonText[reason])
            .join(' ')}{' '}
          Refresh to pull your latest solves and rebuild it.
        </div>
      ) : null}

      <section
        aria-labelledby="revision-heading"
        className="rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
              <CalendarCheck aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <h2
                className="text-base font-semibold text-foreground"
                id="revision-heading"
              >
                Revision schedule
              </h2>
              <p className="text-xs text-muted-foreground">
                Problems you upsolved or finished in the Doubt Helper come back
                after 3, 7, 21 and 45 days.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-primary/10 px-2.5 py-1 font-medium text-primary">
              {revisionsQuery.data?.meta.due ?? 0} due
            </span>
            <span className="rounded-md bg-secondary px-2.5 py-1 text-secondary-foreground">
              {revisionsQuery.data?.meta.upcoming ?? 0} upcoming
            </span>
            <span className="rounded-md bg-secondary px-2.5 py-1 text-secondary-foreground">
              {revisionsQuery.data?.meta.completed ?? 0} mastered
            </span>
          </div>
        </div>
        {revisionsQuery.isPending ? (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            Loading revisions…
          </p>
        ) : revisionsQuery.isError ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            Revisions are temporarily unavailable.
          </p>
        ) : revisions.length === 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            <p>
              Nothing to revise yet. Upsolve a contest problem to start your
              schedule.
            </p>
            <Link
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              to="/upsolve"
            >
              Open upsolve queue
            </Link>
          </div>
        ) : (
          <>
            <ul className="mt-4 grid gap-2">
              {shownRevisions.map((item) => (
                <RevisionRow
                  item={item}
                  key={item.id}
                  onReview={(outcome) =>
                    reviewRevision.mutate(
                      { id: item.id, outcome },
                      {
                        onSuccess: (result) =>
                          notify({
                            title:
                              outcome === 'remembered'
                                ? result.data.completedAt
                                  ? 'Mastered'
                                  : 'Nice. Pushed to the next interval'
                                : 'Back tomorrow',
                            description:
                              outcome === 'remembered'
                                ? `${item.title} will return ${result.data.completedAt ? 'no more' : `on ${formatDate(result.data.dueAt, false)}`}.`
                                : `${item.title} restarts its schedule so it sticks.`,
                            tone: 'success',
                          }),
                        onError: (error) =>
                          notify({
                            title: 'Review was not saved',
                            description:
                              error instanceof Error
                                ? error.message
                                : 'Try again shortly.',
                            tone: 'error',
                          }),
                      },
                    )
                  }
                  pending={reviewRevision.isPending}
                />
              ))}
            </ul>
            {revisions.length > shownRevisions.length || showAllRevisions ? (
              <button
                className="mt-3 text-xs font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => setShowAllRevisions((value) => !value)}
                type="button"
              >
                {showAllRevisions
                  ? 'Show due only'
                  : `Show all ${revisions.length} revisions`}
              </button>
            ) : null}
          </>
        )}
      </section>

      <form
        className="rounded-xl border border-border bg-card p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = noteText.trim()
          if (trimmed === '' || submitRoadmapNote.isPending) return
          submitRoadmapNote.mutate(trimmed, {
            onSuccess: (result) => {
              setNoteText('')
              notify({
                title:
                  result.data.statusChanged && result.data.status !== null
                    ? `Updated ${
                        roadmap.topics.find(
                          (item) => item.topic === result.data.topic,
                        )?.name ?? result.data.topic
                      }: ${statusLabels[result.data.status]}`
                    : 'Note saved',
                description: result.data.rationale,
                tone: 'success',
              })
            },
            onError: (error) =>
              notify({
                title: 'Could not save your note',
                description:
                  error instanceof Error ? error.message : 'Try again shortly.',
                tone: 'error',
              }),
          })
        }}
      >
        <label
          className="text-sm font-semibold text-foreground"
          htmlFor="pathway-note"
        >
          Tell AlgoMemtor what changed
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Plain words are enough, for example “I'm comfortable with sliding
          window now” or “skip geometry for a while”.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-input bg-background py-1.5 pr-1.5 pl-3.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15">
          <input
            autoComplete="off"
            className="h-9 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
            disabled={submitRoadmapNote.isPending}
            id="pathway-note"
            maxLength={500}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="I'm pretty good at sliding window now, no need to keep suggesting it."
            value={noteText}
          />
          <button
            aria-label={
              submitRoadmapNote.isPending ? 'Saving note' : 'Save note'
            }
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={submitRoadmapNote.isPending || noteText.trim() === ''}
            type="submit"
          >
            <Send aria-hidden="true" className="size-4" />
          </button>
        </div>
      </form>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        {(Object.keys(laneLabels) as CoachRoadmapLane[]).map((lane) => {
          const topics = groupedTopics.get(lane) ?? []
          return (
            <section
              aria-labelledby={`pathway-${lane}`}
              className="min-w-0 space-y-3"
              key={lane}
            >
              <div className="flex items-center justify-between gap-2">
                <h2
                  className="font-heading text-lg font-semibold text-foreground"
                  id={`pathway-${lane}`}
                >
                  {laneLabels[lane]}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {topics.length}
                </span>
              </div>
              {topics.length ? (
                topics.map((topic) => (
                  <TopicCard
                    dismissPending={dismissProblem.isPending}
                    key={topic.topic}
                    onDismissProblem={(provider, externalId) =>
                      dismissProblem.mutate({ provider, externalId })
                    }
                    onStatus={(status) =>
                      void setTopicStatus.mutateAsync({
                        topic: topic.topic,
                        status,
                      })
                    }
                    statusPending={setTopicStatus.isPending}
                    topic={topic}
                  />
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nothing here yet.
                </p>
              )}
            </section>
          )
        })}
      </div>
    </PageContainer>
  )
}

export default PathwayPage
