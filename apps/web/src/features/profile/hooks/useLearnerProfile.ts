import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SaveLearnerProfileRequest } from '@algomemtor/shared-contracts'

import { useAuth } from '@/features/auth/useAuth'

import { fetchLearnerProfile, saveLearnerProfile } from '../api/learner-profile'

export const learnerProfileQueryKey = (authUserId: string) =>
  ['learner-profile', authUserId] as const

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
      if (!user) {
        return
      }

      const queryKey = learnerProfileQueryKey(user.id)
      queryClient.setQueryData(queryKey, response)
      await queryClient.invalidateQueries({
        queryKey,
      })
    },
  })
}
