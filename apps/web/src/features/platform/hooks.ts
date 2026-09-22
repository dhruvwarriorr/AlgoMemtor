import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type {
  ExternalContestsQuery,
  LinkableProvider,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import { useAuth } from '@/features/auth/useAuth'

import {
  deleteProviderHistory,
  fetchActivity,
  fetchAnalytics,
  fetchContests,
  fetchProviderSyncStatus,
  fetchProblemDetail,
  fetchUnifiedProfile,
  requestProviderSync,
} from './api'
import { providerSyncRefetchInterval } from './provider-sync-status'

const learnerKey = (authUserId: string) => ['platform', authUserId] as const

export function useUnifiedProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...learnerKey(user?.id ?? 'signed-out'), 'profile'],
    queryFn: ({ signal }) => fetchUnifiedProfile({ signal }),
    enabled: user !== null,
  })
}

export function useActivity(provider?: LinkableProvider) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [
      ...learnerKey(user?.id ?? 'signed-out'),
      'activity',
      provider ?? 'all',
    ],
    queryFn: ({ signal }) => fetchActivity(provider, { signal }),
    enabled: user !== null,
  })
}

export function useContests(query: Partial<ExternalContestsQuery> = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [...learnerKey(user?.id ?? 'signed-out'), 'contests', query],
    queryFn: ({ signal }) => fetchContests(query, { signal }),
    enabled: user !== null,
  })
}

export function useAnalytics(provider?: LinkableProvider) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [
      ...learnerKey(user?.id ?? 'signed-out'),
      'analytics',
      provider ?? 'all',
    ],
    queryFn: ({ signal }) => fetchAnalytics(provider, { signal }),
    enabled: user !== null,
  })
}

export function useProblemDetail(provider: ProviderKey, externalId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: [
      ...learnerKey(user?.id ?? 'signed-out'),
      'problem',
      provider,
      externalId,
    ],
    queryFn: ({ signal }) =>
      fetchProblemDetail(provider, externalId, { signal }),
    enabled: user !== null && externalId.trim().length > 0,
  })
}

export function useProviderSync(provider: LinkableProvider) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: () => requestProviderSync(provider),
    onSuccess: () => {
      if (user === null) return
      void queryClient.invalidateQueries({
        queryKey: [...learnerKey(user.id), 'sync', provider],
      })
      void queryClient.invalidateQueries({
        queryKey: [...learnerKey(user.id), 'profile'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['provider-accounts', user.id],
      })
      void queryClient.invalidateQueries({
        queryKey: [...learnerKey(user.id), 'activity'],
      })
      void queryClient.invalidateQueries({
        queryKey: [...learnerKey(user.id), 'analytics'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['progress', 'analytics', user.id],
      })
    },
  })
}

export function useProviderSyncStatus(
  provider: LinkableProvider,
  enabled = true,
) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const query = useQuery({
    queryKey: [...learnerKey(user?.id ?? 'signed-out'), 'sync', provider],
    queryFn: ({ signal }) => fetchProviderSyncStatus(provider, { signal }),
    enabled: user !== null && enabled,
    refetchInterval: (query) => providerSyncRefetchInterval(query.state.data),
  })

  const syncStatus = query.data?.data.state.status
  const lastSucceededAt = query.data?.data.state.lastSucceededAt
  useEffect(() => {
    if (
      user === null ||
      syncStatus === undefined ||
      syncStatus === 'queued' ||
      syncStatus === 'running'
    ) {
      return
    }
    void queryClient.invalidateQueries({
      queryKey: [...learnerKey(user.id), 'profile'],
    })
    void queryClient.invalidateQueries({
      queryKey: ['provider-accounts', user.id],
    })
    void queryClient.invalidateQueries({
      queryKey: [...learnerKey(user.id), 'activity'],
    })
    void queryClient.invalidateQueries({
      queryKey: [...learnerKey(user.id), 'analytics'],
    })
    void queryClient.invalidateQueries({
      queryKey: ['progress', 'analytics', user.id],
    })
  }, [lastSucceededAt, queryClient, syncStatus, user])

  return query
}

export function useDeleteProviderHistory() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (provider: LinkableProvider) => deleteProviderHistory(provider),
    onSuccess: (_response, provider) => {
      if (user === null) return
      void queryClient.invalidateQueries({
        queryKey: [...learnerKey(user.id), 'profile'],
      })
      void queryClient.invalidateQueries({
        queryKey: [...learnerKey(user.id), 'analytics'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['progress', 'analytics', user.id],
      })
      void queryClient.invalidateQueries({
        queryKey: [...learnerKey(user.id), 'activity'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['provider-accounts', user.id],
      })
      void provider
    },
  })
}
