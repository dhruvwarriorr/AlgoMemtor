import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { RecommendationFeedResponse } from '@algomemtor/shared-contracts'

import { useAuth } from '@/features/auth/useAuth'

import {
  dismissRecommendation,
  dismissProblem,
  fetchRecommendationDismissals,
  fetchRecommendations,
  refreshRecommendations,
  restoreRecommendationDismissal,
  saveRecommendationFeedback,
} from '../api/recommendations'

export const recommendationsQueryKey = (authUserId: string) =>
  ['recommendations', authUserId] as const

export const recommendationDismissalsQueryKey = (authUserId: string) =>
  ['recommendation-dismissals', authUserId] as const

export function useRecommendations() {
  const { user } = useAuth()

  return useQuery({
    queryKey: recommendationsQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchRecommendations({ signal }),
    enabled: user !== null,
  })
}

export function useRefreshRecommendations() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: refreshRecommendations,
    onSuccess: async (response) => {
      if (user === null) {
        return
      }

      const queryKey = recommendationsQueryKey(user.id)
      queryClient.setQueryData(queryKey, response)
      await queryClient.invalidateQueries({ queryKey })
    },
  })
}

export function useRecommendationFeedback() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      input,
      itemId,
    }: {
      itemId: string
      input: Parameters<typeof saveRecommendationFeedback>[1]
    }) => saveRecommendationFeedback(itemId, input),
    onSuccess: () => {
      if (user === null) {
        return
      }

      // Saving feedback makes the current batch stale server-side, which can
      // trigger a full AI-ranked regeneration on the next fetch. Mark it
      // stale without blocking the UI on that regeneration.
      void queryClient.invalidateQueries({
        queryKey: recommendationsQueryKey(user.id),
        refetchType: 'none',
      })
    },
  })
}

export function useDismissRecommendation() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: dismissRecommendation,
    onSuccess: (_response, itemId) => {
      if (user === null) {
        return
      }

      const queryKey = recommendationsQueryKey(user.id)
      queryClient.setQueryData<RecommendationFeedResponse>(
        queryKey,
        (current) =>
          current?.data === null || current?.data === undefined
            ? current
            : {
                ...current,
                data: {
                  ...current.data,
                  items: current.data.items.filter(
                    (item) => item.id !== itemId,
                  ),
                },
              },
      )

      // Dismissing makes the batch stale server-side, which can trigger a
      // full AI-ranked regeneration on the next fetch. The optimistic
      // update above already reflects the dismissal, so mark queries stale
      // without blocking the dismiss button on that regeneration.
      void queryClient.invalidateQueries({ queryKey, refetchType: 'none' })
      void queryClient.invalidateQueries({
        queryKey: recommendationDismissalsQueryKey(user.id),
      })
      void queryClient.invalidateQueries({
        queryKey: ['coach', user.id, 'roadmap'],
      })
    },
  })
}

export function useDismissProblem() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ provider, externalId }: { provider: string; externalId: string }) =>
      dismissProblem(provider, externalId),
    onSuccess: () => {
      if (user === null) return
      // Non-blocking: see useDismissRecommendation for why these aren't awaited.
      void queryClient.invalidateQueries({
        queryKey: recommendationsQueryKey(user.id),
        refetchType: 'none',
      })
      void queryClient.invalidateQueries({ queryKey: recommendationDismissalsQueryKey(user.id) })
      void queryClient.invalidateQueries({ queryKey: ['coach', user.id, 'roadmap'] })
    },
  })
}

export function useRecommendationDismissals() {
  const { user } = useAuth()

  return useQuery({
    queryKey: recommendationDismissalsQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchRecommendationDismissals({ signal }),
    enabled: user !== null,
  })
}

export function useRestoreRecommendationDismissal() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      externalId,
      provider,
    }: {
      provider: string
      externalId: string
    }) => restoreRecommendationDismissal(provider, externalId),
    onSuccess: () => {
      if (user === null) {
        return
      }

      // Non-blocking: see useDismissRecommendation for why these aren't awaited.
      void queryClient.invalidateQueries({
        queryKey: recommendationsQueryKey(user.id),
        refetchType: 'none',
      })
      void queryClient.invalidateQueries({
        queryKey: recommendationDismissalsQueryKey(user.id),
      })
      void queryClient.invalidateQueries({
        queryKey: ['coach', user.id, 'roadmap'],
      })
    },
  })
}
