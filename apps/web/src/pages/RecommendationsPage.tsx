import { useState } from 'react'

import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { useNotification } from '@/app/useNotification'
import { ApiClientError } from '@/features/discovery/api/client'
import {
  useDismissRecommendation,
  useRecommendationDismissals,
  useRecommendationFeedback,
  useRecommendations,
  useRefreshRecommendations,
  useRestoreRecommendationDismissal,
} from '@/features/recommendations/hooks/useRecommendations'

import { RecommendationCard } from '@/features/recommendations/components/RecommendationCard'

function RecommendationsPage() {
  const { notify } = useNotification()
  const recommendationsQuery = useRecommendations()
  const dismissalsQuery = useRecommendationDismissals()
  const refreshMutation = useRefreshRecommendations()
  const feedbackMutation = useRecommendationFeedback()
  const dismissMutation = useDismissRecommendation()
  const restoreMutation = useRestoreRecommendationDismissal()
  const [lastDismissed, setLastDismissed] = useState<{
    provider: string
    externalId: string
  } | null>(null)

  const feed = recommendationsQuery.data?.data
  const isRefreshing = refreshMutation.isPending
  const providerError = recommendationsQuery.error
  const providerUnavailable =
    providerError instanceof ApiClientError &&
    (providerError.status === 503 ||
      providerError.code === 'PROVIDER_UNAVAILABLE')

  function refresh() {
    refreshMutation.mutate(undefined, {
      onError: (error) => {
        notify({
          title: 'Recommendations could not be refreshed',
          description:
            error instanceof Error
              ? error.message
              : 'Please try again in a moment.',
          tone: 'error',
        })
      },
    })
  }

  function showFeedback(
    itemId: string,
    input: Parameters<typeof feedbackMutation.mutate>[0]['input'],
  ) {
    feedbackMutation.mutate(
      { itemId, input },
      {
        onError: (error) => {
          notify({
            title: 'Feedback was not saved',
            description:
              error instanceof Error
                ? error.message
                : 'Please try again in a moment.',
            tone: 'error',
          })
        },
      },
    )
  }

  function dismiss(itemId: string) {
    dismissMutation.mutate(itemId, {
      onSuccess: (response) => {
        setLastDismissed({
          provider: response.data.provider,
          externalId: response.data.externalId,
        })
      },
      onError: (error) => {
        notify({
          title: 'Recommendation was not dismissed',
          description:
            error instanceof Error
              ? error.message
              : 'Please try again in a moment.',
          tone: 'error',
        })
      },
    })
  }

  function restore(provider: string, externalId: string) {
    restoreMutation.mutate(
      { provider, externalId },
      {
        onSuccess: () => {
          setLastDismissed((current) =>
            current?.provider === provider && current.externalId === externalId
              ? null
              : current,
          )
        },
        onError: (error) => {
          notify({
            title: 'Recommendation was not restored',
            description:
              error instanceof Error
                ? error.message
                : 'Please try again in a moment.',
            tone: 'error',
          })
        },
      },
    )
  }

  let content

  if (recommendationsQuery.isPending && feed === undefined) {
    content = <PageSkeleton label="Loading recommendations" rows={4} />
  } else if (recommendationsQuery.isError && feed === undefined) {
    content = (
      <ErrorState
        message={
          providerUnavailable
            ? 'Codeforces is temporarily unavailable. Try again when the provider is ready.'
            : providerError instanceof Error
              ? providerError.message
              : 'Recommendations could not be loaded.'
        }
        onRetry={() => void recommendationsQuery.refetch()}
        title={
          providerUnavailable
            ? 'Provider unavailable'
            : 'Unable to load recommendations'
        }
      />
    )
  } else if (feed === null || feed?.items.length === 0) {
    content = (
      <EmptyState
        action={
          <Button disabled={isRefreshing} onClick={refresh} type="button">
            Try again
          </Button>
        }
        description="There are no usable problems in the current provider data. Refresh when more metadata is available."
        title="No recommendations yet"
      />
    )
  } else if (feed !== undefined) {
    const warnings = recommendationsQuery.data?.meta.warnings ?? []
    const stale = recommendationsQuery.data?.meta.stale ?? false
    const partial = recommendationsQuery.data?.meta.partial ?? false

    content = (
      <div className="min-w-0 space-y-4">
        {stale ? (
          <aside
            className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
            role="status"
          >
            Recommendation metadata may be stale. These links remain the
            provider-validated canonical links.
          </aside>
        ) : null}
        {partial ||
        warnings.some((warning) => warning.code !== 'STALE_DATA') ? (
          <aside
            className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
            role="status"
          >
            <p className="font-medium">Some provider data is unavailable.</p>
            {warnings
              .filter((warning) => warning.code !== 'STALE_DATA')
              .map((warning) => (
                <p className="mt-1" key={`${warning.provider}:${warning.code}`}>
                  {warning.message}
                </p>
              ))}
          </aside>
        ) : null}
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {feed.items.map((item) => (
            <RecommendationCard
              isDismissPending={
                dismissMutation.isPending &&
                dismissMutation.variables === item.id
              }
              isFeedbackPending={
                feedbackMutation.isPending &&
                feedbackMutation.variables?.itemId === item.id
              }
              item={item}
              key={item.id}
              onDismiss={() => dismiss(item.id)}
              onFeedback={(input) => showFeedback(item.id, input)}
            />
          ))}
        </div>
      </div>
    )
  }

  const dismissed = dismissalsQuery.data?.data ?? []

  return (
    <PageContainer>
      <PageHeader
        action={
          <Button disabled={isRefreshing} onClick={refresh} type="button">
            {isRefreshing ? 'Refreshing…' : 'Refresh recommendations'}
          </Button>
        }
        description="Review personalized problem recommendations and why they fit your learning goals."
        title="Recommendations"
      />

      {lastDismissed !== null ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 p-3 text-sm"
          role="status"
        >
          <span>
            {lastDismissed.provider}:{lastDismissed.externalId} was dismissed.
          </span>
          <Button
            disabled={restoreMutation.isPending}
            onClick={() =>
              restore(lastDismissed.provider, lastDismissed.externalId)
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Undo
          </Button>
        </div>
      ) : null}

      {content}

      <section
        aria-labelledby="dismissed-recommendations-heading"
        className="space-y-3"
      >
        <div>
          <h2
            className="text-xl font-semibold tracking-tight text-foreground"
            id="dismissed-recommendations-heading"
          >
            Dismissed recommendations
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dismissed problems stay out of your feed until you restore them.
          </p>
        </div>
        {dismissalsQuery.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading dismissed problems…
          </p>
        ) : dismissalsQuery.isError ? (
          <ErrorState
            message="Dismissed recommendations could not be loaded."
            onRetry={() => void dismissalsQuery.refetch()}
            title="Unable to load dismissals"
          />
        ) : dismissed.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No dismissed recommendations.
          </p>
        ) : (
          <ul className="space-y-2">
            {dismissed.map((item) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                key={`${item.provider}:${item.externalId}`}
              >
                <div className="min-w-0">
                  <p className="break-words font-medium text-foreground">
                    {item.problem?.title ?? item.externalId}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Codeforces · {item.externalId}
                  </p>
                </div>
                <Button
                  disabled={restoreMutation.isPending}
                  onClick={() => restore(item.provider, item.externalId)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  )
}

export default RecommendationsPage
