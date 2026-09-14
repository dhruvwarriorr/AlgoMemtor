import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { fetchDeleteAllDataStatus } from '@/features/progress/api/progress'
import { dataResetEventName } from '@/features/progress/timer/timer-utils'

import {
  deleteAllData,
  fetchAiConsent,
  saveAiConsent,
} from '../api/learner-settings'

export const aiConsentQueryKey = (authUserId: string) =>
  ['learner-ai-consent', authUserId] as const

export const dataResetStatusQueryKey = (authUserId: string) =>
  ['learner-data-reset-status', authUserId] as const

export function useAiConsent() {
  const { user } = useAuth()

  return useQuery({
    queryKey: aiConsentQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchAiConsent({ signal }),
    enabled: user !== null,
  })
}

export function useSaveAiConsent() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: saveAiConsent,
    onSuccess: (response) => {
      if (user) {
        queryClient.setQueryData(aiConsentQueryKey(user.id), response)
      }
      if (response.data?.enabled !== true) {
        queryClient.removeQueries({ queryKey: ['learner-memories'] })
      }
    },
  })
}

export function useDeleteAllDataStatus(enabled: boolean) {
  const { user } = useAuth()

  return useQuery({
    queryKey: dataResetStatusQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchDeleteAllDataStatus({ signal }),
    enabled: enabled && user !== null,
    refetchOnMount: 'always',
    refetchInterval: (query) =>
      query.state.data?.data.status === 'pending' ? 1_000 : false,
    staleTime: 0,
  })
}

export function useDeleteAllData() {
  return useMutation({
    mutationFn: deleteAllData,
    onSuccess: () => {
      window.dispatchEvent(new Event(dataResetEventName))
    },
  })
}
