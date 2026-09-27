import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SaveLearnerProfileRequest } from '@algomemtor/shared-contracts'

import { useAuth } from '@/features/auth/useAuth'
import { recommendationsQueryKey } from '@/features/recommendations/hooks/useRecommendations'

import { fetchLearnerProfile, saveLearnerProfile } from '../api/learner-profile'
import { petSay } from '@/features/pet/mello-events'
import { petLines } from '@/features/pet/pet-lines'

export const learnerProfileQueryKey = (authUserId: string) =>
  ['learner-profile', authUserId] as const

export const learnerProfileInvalidationKeys = (authUserId: string) => [
  learnerProfileQueryKey(authUserId),
  recommendationsQueryKey(authUserId),
]

export function useLearnerProfile() {
  const { user } = useAuth()

  return useQuery({
    queryKey: learnerProfileQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchLearnerProfile({ signal }),
    enabled: user !== null,
  })
}

export function useSaveLearnerProfile() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (profile: SaveLearnerProfileRequest) =>
      saveLearnerProfile(profile),
    onSuccess: async (response) => {
      petSay(petLines.settingsSaved)
      if (!user) {
        return
      }

      const [queryKey, recommendationQueryKey] = learnerProfileInvalidationKeys(
        user.id,
      )
      queryClient.setQueryData(queryKey, response)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: recommendationQueryKey }),
      ])
    },
  })
}
