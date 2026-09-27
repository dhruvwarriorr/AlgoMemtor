import { useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'

import { RefreshCw } from '@/components/icons/algo-icons'
import { ProviderLogo } from '@/components/brand/ProviderLogo'
import { PageHero } from '@/components/kit/PageHero'
import { OrbLoader } from '@/components/motion/OrbLoader'
import { EmptyState } from '@/components/states/EmptyState'
import { ErrorState } from '@/components/states/ErrorState'
import { PageSkeleton } from '@/components/states/PageSkeleton'
import PageContainer from '@/components/layout/PageContainer'
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
import { PickEngineCard } from '@/features/recommendations/components/PickEngineCard'
import { RecommendationSteeringBar } from '@/features/recommendations/components/RecommendationSteeringBar'

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
    title: string
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
    const item = feed?.items.find((candidate) => candidate.id === itemId)
    dismissMutation.mutate(itemId, {
      onSuccess: (response) => {
        setLastDismissed({
          provider: response.data.provider,
          externalId: response.data.externalId,
          title: item?.problem.title ?? response.data.externalId,
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
    content = (
      <div className="min-w-0 space-y-4">
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {feed.items.map((item, index) => (
            <RecommendationCard
              featured={index === 0}
              index={index}
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
    <PageContainer accent="sky" className="gap-6">
      <PageHero
        actions={
          <Button disabled={isRefreshing} onClick={refresh} type="button">
            <RefreshCw
              aria-hidden="true"
              className={isRefreshing ? 'animate-spin' : undefined}
            />
            {isRefreshing ? 'Refreshing…' : 'Refresh recommendations'}
          </Button>
        }
        info="Recommendations are ranked from a bounded set of provider problems that pass deterministic filters for your level, topics and history. Each one explains why it fits; the canonical link opens on the provider."
        subtitle="Ten problems picked for your goals, each with the reason it fits."
        title="Recommendations"
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <RecommendationSteeringBar />
        <PickEngineCard feed={feed} refreshing={isRefreshing} />
      </div>

      <AnimatePresence>
        {lastDismissed !== null ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 pl-4 text-sm"
            exit={{ opacity: 0, y: -8 }}
            initial={{ opacity: 0, y: -8 }}
            role="status"
          >
            <span>{lastDismissed.title} was dismissed.</span>
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
          </motion.div>
        ) : null}
      </AnimatePresence>

      {content}

      <section
        aria-labelledby="dismissed-recommendations-heading"
        className="space-y-3 rounded-2xl border border-dashed border-border p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            className="text-base font-semibold tracking-tight text-foreground"
            id="dismissed-recommendations-heading"
          >
            Dismissed recommendations
            {dismissed.length > 0 ? (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {dismissed.length}
              </span>
            ) : null}
          </h2>
          <p className="text-xs text-muted-foreground">
            Kept out of your feed until you restore them.
          </p>
        </div>
        {dismissalsQuery.isPending ? (
          <div className="py-2" role="status">
            <OrbLoader label="Loading dismissed problems…" />
          </div>
        ) : dismissalsQuery.isError ? (
          <ErrorState
            message="Dismissed recommendations could not be loaded."
            onRetry={() => void dismissalsQuery.refetch()}
            title="Unable to load dismissals"
          />
        ) : dismissed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No dismissed recommendations.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {dismissed.map((item) => (
              <li
                className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-card py-1 pr-1 pl-2"
                key={`${item.provider}:${item.externalId}`}
              >
                <ProviderLogo className="size-4" provider={item.provider} />
                <span className="min-w-0 truncate text-sm font-medium text-foreground">
                  {item.problem?.title ?? item.externalId}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  <span className="sr-only capitalize">{item.provider} · </span>
                  {item.externalId}
                </span>
                <Button
                  className="rounded-full"
                  disabled={restoreMutation.isPending}
                  onClick={() => restore(item.provider, item.externalId)}
                  size="xs"
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
