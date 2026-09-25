import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ExploreSolutionsRequest,
  ProblemHelpSessionResponse,
  ProblemHelpTurnRequest,
  ProviderKey,
  SolutionChatRequest,
  StartProblemHelpRequest,
  UpdateUpsolveItemRequest,
} from '@algomemtor/shared-contracts'

import { useAuth } from '@/features/auth/useAuth'

import {
  askSolutionChat,
  exploreSolutions,
  fetchContestDetail,
  fetchContestOverview,
  fetchExplorations,
  fetchHelpSession,
  fetchHelpSessions,
  fetchProgressReport,
  fetchRevisions,
  fetchSolutionAccess,
  fetchUpsolve,
  generateContestNarrative,
  generateContestPatterns,
  generateProgressNarrative,
  reviewRevision,
  sendHelpTurn,
  startHelpSession,
  updateUpsolveItem,
} from './api'

const mentorKey = (userId: string) => ['mentor', userId] as const

function useMentorKey() {
  const { user } = useAuth()
  return { key: mentorKey(user?.id ?? 'signed-out'), enabled: user !== null }
}

// Doubt Helper -------------------------------------------------------------

export function useHelpSessions() {
  const { key, enabled } = useMentorKey()
  return useQuery({
    queryKey: [...key, 'help-sessions'],
    queryFn: ({ signal }) => fetchHelpSessions({ signal }),
    enabled,
  })
}

export function useHelpSession(id: string | null) {
  const { key, enabled } = useMentorKey()
  return useQuery({
    queryKey: [...key, 'help-session', id],
    queryFn: ({ signal }) => fetchHelpSession(id ?? '', { signal }),
    enabled: enabled && id !== null,
  })
}

export function useStartHelpSession() {
  const { key } = useMentorKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: StartProblemHelpRequest) => startHelpSession(input),
    onSuccess: (response) => {
      queryClient.setQueryData(
        [...key, 'help-session', response.data.id],
        response,
      )
      void queryClient.invalidateQueries({
        queryKey: [...key, 'help-sessions'],
      })
    },
  })
}

export function useHelpTurn(id: string | null) {
  const { key } = useMentorKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProblemHelpTurnRequest) =>
      sendHelpTurn(id ?? '', input),
    onSuccess: (response: ProblemHelpSessionResponse) => {
      queryClient.setQueryData(
        [...key, 'help-session', response.data.id],
        response,
      )
      void queryClient.invalidateQueries({
        queryKey: [...key, 'help-sessions'],
      })
      if (response.data.stage === 'completed') {
        void queryClient.invalidateQueries({ queryKey: [...key, 'revisions'] })
      }
    },
    onError: () => {
      // A stale version or failed generation keeps the stored state; reload it.
      void queryClient.invalidateQueries({
        queryKey: [...key, 'help-session', id],
      })
    },
  })
}

// Solution Explorer --------------------------------------------------------

export function useExplorations() {
  const { key, enabled } = useMentorKey()
  return useQuery({
    queryKey: [...key, 'explorations'],
    queryFn: ({ signal }) => fetchExplorations({ signal }),
    enabled,
  })
}

export function useSolutionAccess(problemUrl: string | null, language: string) {
  const { key, enabled } = useMentorKey()
  return useQuery({
    queryKey: [...key, 'solution-access', problemUrl, language],
    queryFn: ({ signal }) =>
      fetchSolutionAccess(problemUrl ?? '', language, { signal }),
    enabled: enabled && problemUrl !== null,
    retry: false,
  })
}

export function useExploreSolutions() {
  const { key } = useMentorKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ExploreSolutionsRequest) => exploreSolutions(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...key, 'explorations'] })
      void queryClient.invalidateQueries({
        queryKey: [...key, 'solution-access'],
      })
    },
  })
}

export function useSolutionChat() {
  return useMutation({
    mutationFn: (input: SolutionChatRequest) => askSolutionChat(input),
  })
}

// Upsolve and revisions ----------------------------------------------------

export function useUpsolve() {
  const { key, enabled } = useMentorKey()
  return useQuery({
    queryKey: [...key, 'upsolve'],
    queryFn: ({ signal }) => fetchUpsolve({ signal }),
    enabled,
  })
}

export function useUpdateUpsolveItem() {
  const { key } = useMentorKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      provider: ProviderKey
      externalId: string
      state: UpdateUpsolveItemRequest['state']
    }) =>
      updateUpsolveItem(input.provider, input.externalId, {
        state: input.state,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...key, 'upsolve'] })
    },
  })
}

export function useRevisions() {
  const { key, enabled } = useMentorKey()
  return useQuery({
    queryKey: [...key, 'revisions'],
    queryFn: ({ signal }) => fetchRevisions({ signal }),
    enabled,
  })
}

export function useReviewRevision() {
  const { key } = useMentorKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; outcome: 'remembered' | 'struggled' }) =>
      reviewRevision(input.id, { outcome: input.outcome }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...key, 'revisions'] })
      void queryClient.invalidateQueries({ queryKey: [...key, 'upsolve'] })
    },
  })
}

// Contest analysis ---------------------------------------------------------

export function useContestOverview() {
  const { key, enabled } = useMentorKey()
  return useQuery({
    queryKey: [...key, 'contest-overview'],
    queryFn: ({ signal }) => fetchContestOverview({ signal }),
    enabled,
  })
}

export function useContestDetail(
  contest: { provider: ProviderKey; contestId: string } | null,
) {
  const { key, enabled } = useMentorKey()
  return useQuery({
    queryKey: [...key, 'contest', contest?.provider, contest?.contestId],
    queryFn: ({ signal }) =>
      fetchContestDetail(
        contest?.provider ?? 'codeforces',
        contest?.contestId ?? '',
        { signal },
      ),
    enabled: enabled && contest !== null,
    retry: false,
  })
}

export function useContestNarrative() {
  const { key } = useMentorKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      provider: ProviderKey
      contestId: string
      refresh: boolean
    }) =>
      generateContestNarrative(input.provider, input.contestId, input.refresh),
    onSuccess: (response, input) => {
      queryClient.setQueryData(
        [...key, 'contest', input.provider, input.contestId],
        response,
      )
      void queryClient.invalidateQueries({
        queryKey: [...key, 'contest-overview'],
      })
    },
  })
}

export function useContestPatterns() {
  const { key } = useMentorKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (refresh: boolean) => generateContestPatterns(refresh),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...key, 'contest-overview'],
      })
    },
  })
}

// Progress report ----------------------------------------------------------

export function useProgressReport() {
  const { key, enabled } = useMentorKey()
  return useQuery({
    queryKey: [...key, 'progress-report'],
    queryFn: ({ signal }) => fetchProgressReport({ signal }),
    enabled,
  })
}

export function useProgressNarrative() {
  const { key } = useMentorKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (refresh: boolean) => generateProgressNarrative(refresh),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...key, 'progress-report'],
      })
    },
  })
}
