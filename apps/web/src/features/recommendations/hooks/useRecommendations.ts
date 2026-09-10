import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'

import {
  dismissRecommendation,
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
    onSuccess: async () => {
      if (user === null) {
        return
      }

      await queryClient.invalidateQueries({
        queryKey: recommendationsQueryKey(user.id),
      })
    },
  })
}

export function useDismissRecommendation() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: dismissRecommendation,
    onSuccess: async () => {
      if (user === null) {
        return
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: recommendationsQueryKey(user.id),
        }),
        queryClient.invalidateQueries({
          queryKey: recommendationDismissalsQueryKey(user.id),
        }),
      ])
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
    onSuccess: async () => {
      if (user === null) {
        return
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: recommendationsQueryKey(user.id),
        }),
        queryClient.invalidateQueries({
          queryKey: recommendationDismissalsQueryKey(user.id),
        }),
      ])
    },
  })
}
