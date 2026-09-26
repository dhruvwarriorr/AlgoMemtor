import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SendCoachMessageRequest } from '@algomemtor/shared-contracts'

import { useAuth } from '@/features/auth/useAuth'

import {
  confirmCoachAction,
  createCoachConversation,
  deleteCoachConversation,
  fetchCoachConversation,
  fetchCoachConversations,
  fetchCoachRoadmap,
  renameCoachConversation,
  sendCoachMessage,
  setCoachTopicStatus,
} from './api'

const coachKey = (userId: string) => ['coach', userId] as const

// Mello, the coach's on-page body, follows every send through this key.
export const coachSendMutationKey = ['coach', 'send'] as const

export function useCoachConversations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...coachKey(user?.id ?? 'signed-out'), 'conversations'],
    queryFn: ({ signal }) => fetchCoachConversations({ signal }),
    enabled: user !== null,
  })
}

export function useCoachConversation(conversationId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [
      ...coachKey(user?.id ?? 'signed-out'),
      'conversation',
      conversationId,
    ],
    queryFn: ({ signal }) =>
      fetchCoachConversation(conversationId ?? '', { signal }),
    enabled: user !== null && conversationId !== null,
  })
}

export function useCoachRoadmap() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...coachKey(user?.id ?? 'signed-out'), 'roadmap'],
    queryFn: ({ signal }) => fetchCoachRoadmap({ signal }),
    enabled: user !== null,
  })
}

export function useCreateCoachConversation() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: createCoachConversation,
    onSuccess: () => {
      if (user)
        void queryClient.invalidateQueries({
          queryKey: [...coachKey(user.id), 'conversations'],
        })
    },
  })
}

export function useRenameCoachConversation() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({
      conversationId,
      title,
    }: {
      conversationId: string
      title: string
    }) => renameCoachConversation(conversationId, title),
    onSuccess: (_data, variables) => {
      if (!user) return
      void queryClient.invalidateQueries({
        queryKey: [...coachKey(user.id), 'conversations'],
      })
      void queryClient.invalidateQueries({
        queryKey: [
          ...coachKey(user.id),
          'conversation',
          variables.conversationId,
        ],
      })
    },
  })
}

export function useDeleteCoachConversation() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: deleteCoachConversation,
    onSuccess: (_data, conversationId) => {
      if (!user) return
      void queryClient.invalidateQueries({
        queryKey: [...coachKey(user.id), 'conversations'],
      })
      queryClient.removeQueries({
        queryKey: [...coachKey(user.id), 'conversation', conversationId],
      })
    },
  })
}

export function useSendCoachMessage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationKey: coachSendMutationKey,
    mutationFn: ({
      conversationId,
      content,
      transientContext,
      transientMedia,
      signal,
    }: {
      conversationId: string
      content: string
      transientContext?: string
      transientMedia?: SendCoachMessageRequest['transientMedia']
      signal?: AbortSignal
    }) =>
      sendCoachMessage(
        conversationId,
        {
          content,
          ...(transientContext ? { transientContext } : {}),
          ...(transientMedia ? { transientMedia } : {}),
        },
        { signal },
      ),
    onSuccess: (_data, variables) => {
      if (!user) return
      void queryClient.invalidateQueries({
        queryKey: [...coachKey(user.id), 'conversations'],
      })
      void queryClient.invalidateQueries({
        queryKey: [...coachKey(user.id), 'roadmap'],
      })
      // Stay pending until the saved thread (question and reply) is back,
      // so the optimistic question never blinks out of view.
      return queryClient.invalidateQueries({
        queryKey: [
          ...coachKey(user.id),
          'conversation',
          variables.conversationId,
        ],
      })
    },
  })
}

export function useSetCoachTopicStatus() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({
      topic,
      status,
    }: {
      topic: string
      status: Parameters<typeof setCoachTopicStatus>[1]['status']
    }) => setCoachTopicStatus(topic, { status }),
    onSuccess: () => {
      if (user) {
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: [...coachKey(user.id), 'roadmap'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['recommendations', user.id],
          }),
        ])
      }
    },
  })
}

export function useConfirmCoachAction() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (proposalId: string) => confirmCoachAction(proposalId),
    onSuccess: () => {
      if (!user) return
      void queryClient.invalidateQueries({
        queryKey: [...coachKey(user.id), 'roadmap'],
      })
      void queryClient.invalidateQueries({
        queryKey: [...coachKey(user.id), 'conversation'],
      })
    },
  })
}
