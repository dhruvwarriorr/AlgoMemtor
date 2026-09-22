import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LearnerProblemStatus } from '@algomemtor/shared-contracts'

import { useAuth } from '@/features/auth/useAuth'
import {
  deleteProblemProgress,
  fetchProgress,
  fetchProgressAnalytics,
  fetchProgressHistory,
  recordProblemAction,
  saveProblemReflection,
  setProblemStatus,
} from '../api/progress'
import type {
  ProblemReference,
  ProgressHistoryQuery,
  SaveReflectionRequest,
  SetProblemStatusRequest,
} from '../contracts'

export const progressQueryKey = (
  authUserId: string,
  problem: ProblemReference,
) => ['progress', authUserId, problem.provider, problem.externalId] as const

export const progressHistoryQueryKey = (
  authUserId: string,
  query: ProgressHistoryQuery,
) => ['progress', 'history', authUserId, query] as const

export const progressAnalyticsQueryKey = (authUserId: string, days: number) =>
  ['progress', 'analytics', authUserId, days] as const

function useInvalidateProgress() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['progress'] }),
      queryClient.invalidateQueries({ queryKey: ['recommendations'] }),
      queryClient.invalidateQueries({
        queryKey: ['discovery', 'problem-catalog'],
      }),
      user
        ? queryClient.invalidateQueries({
            queryKey: ['bookmarks', user.id],
          })
        : Promise.resolve(),
    ])
  }
}

export function useProblemProgress(problem: ProblemReference) {
  const { user } = useAuth()

  return useQuery({
    queryKey: progressQueryKey(user?.id ?? 'signed-out', problem),
    queryFn: ({ signal }) => fetchProgress(problem, { signal }),
    enabled: user !== null,
  })
}

export function useProgressHistory(
  query: ProgressHistoryQuery = { limit: 25 },
) {
  const { user } = useAuth()

  return useQuery({
    queryKey: progressHistoryQueryKey(user?.id ?? 'signed-out', query),
    queryFn: ({ signal }) => fetchProgressHistory(query, { signal }),
    enabled: user !== null,
  })
}

export function useProgressAnalytics(days = 30) {
  const { user } = useAuth()

  return useQuery({
    queryKey: progressAnalyticsQueryKey(user?.id ?? 'signed-out', days),
    queryFn: ({ signal }) => fetchProgressAnalytics(days, { signal }),
    enabled: user !== null,
  })
}

export function useSetProblemStatus() {
  const invalidate = useInvalidateProgress()

  return useMutation({
    mutationFn: ({
      problem,
      input,
    }: {
      problem: ProblemReference
      input: SetProblemStatusRequest
    }) => setProblemStatus(problem, input),
    onSuccess: invalidate,
  })
}

export function useSaveProblemReflection() {
  const invalidate = useInvalidateProgress()

  return useMutation({
    mutationFn: ({
      problem,
      input,
    }: {
      problem: ProblemReference
      input: SaveReflectionRequest
    }) => saveProblemReflection(problem, input),
    onSuccess: invalidate,
  })
}

export function useRecordProblemAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: recordProblemAction,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['progress'] })
    },
  })
}

export function useDeleteProblemProgress() {
  const invalidate = useInvalidateProgress()

  return useMutation({
    mutationFn: deleteProblemProgress,
    onSuccess: invalidate,
  })
}

export type { LearnerProblemStatus }
