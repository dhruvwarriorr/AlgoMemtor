import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'

import {
  actOnLearnerMemory,
  correctLearnerMemory,
  fetchLearnerMemories,
} from '../api/memories'
import type { CorrectLearnerMemoryRequest } from '../contracts'

export const learnerMemoriesQueryKey = (authUserId: string) =>
  ['learner-memories', authUserId] as const

export function useLearnerMemories() {
  const { user } = useAuth()

  return useQuery({
    queryKey: learnerMemoriesQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchLearnerMemories({ signal }),
    enabled: user !== null,
    refetchInterval: (query) =>
      query.state.data?.meta.pendingJobs ? 1_000 : false,
    staleTime: 0,
  })
}

function useInvalidateMemories() {
  const queryClient = useQueryClient()

  return () => queryClient.invalidateQueries({ queryKey: ['learner-memories'] })
}

export function useLearnerMemoryAction() {
  const invalidate = useInvalidateMemories()

  return useMutation({
    mutationFn: ({
      memoryId,
      action,
    }: {
      memoryId: string
      action: 'approve' | 'archive' | 'restore' | 'delete'
    }) => actOnLearnerMemory(memoryId, action),
    onSuccess: invalidate,
  })
}

export function useCorrectLearnerMemory() {
  const invalidate = useInvalidateMemories()

  return useMutation({
    mutationFn: ({
      memoryId,
      input,
    }: {
      memoryId: string
      input: CorrectLearnerMemoryRequest
    }) => correctLearnerMemory(memoryId, input),
    onSuccess: invalidate,
  })
}
