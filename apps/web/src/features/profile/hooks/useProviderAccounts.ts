import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  LinkableProvider,
  LinkProviderAccountRequest,
  ProviderAccountsResponse,
} from '@algomemtor/shared-contracts'

import { useAuth } from '@/features/auth/useAuth'

import {
  disconnectProviderAccount,
  fetchProviderAccounts,
  linkProviderAccount,
  refreshProviderPublicStats,
  setProviderActivityConsent,
  syncProviderActivity,
} from '../api/provider-accounts'

export const providerAccountsQueryKey = (authUserId: string) =>
  ['provider-accounts', authUserId] as const

function replaceProviderAccount(
  current: ProviderAccountsResponse | undefined,
  response: ProviderAccountsResponse['data'][number],
): ProviderAccountsResponse {
  return {
    data: [
      ...(current?.data.filter(
        ({ provider }) => provider !== response.provider,
      ) ?? []),
      response,
    ].sort((left, right) => left.provider.localeCompare(right.provider)),
  }
}

export function useProviderAccounts() {
  const { user } = useAuth()

  return useQuery({
    queryKey: providerAccountsQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchProviderAccounts({ signal }),
    enabled: user !== null,
  })
}

export function useLinkProviderAccount() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      account,
      provider,
    }: {
      account: LinkProviderAccountRequest
      provider: LinkableProvider
    }) => linkProviderAccount(provider, account),
    onSuccess: (response) => {
      if (!user) {
        return
      }

      queryClient.setQueryData<ProviderAccountsResponse>(
        providerAccountsQueryKey(user.id),
        (current) => replaceProviderAccount(current, response.data),
      )
    },
  })
}

export function useRefreshProviderPublicStats() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (provider: LinkableProvider) =>
      refreshProviderPublicStats(provider),
    onSuccess: (response) => {
      if (!user) {
        return
      }

      queryClient.setQueryData<ProviderAccountsResponse>(
        providerAccountsQueryKey(user.id),
        (current) => replaceProviderAccount(current, response.data),
      )
    },
    onSettled: async () => {
      if (!user) {
        return
      }

      await queryClient.invalidateQueries({
        queryKey: providerAccountsQueryKey(user.id),
      })
    },
  })
}

export function useSetProviderActivityConsent() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({
      provider,
      enabled,
    }: {
      provider: LinkableProvider
      enabled: boolean
    }) =>
      setProviderActivityConsent(provider, {
        enabled,
        policyVersion: 'codeforces-public-activity-v1',
      }),
    onSuccess: (response) => {
      if (!user) return
      queryClient.setQueryData<ProviderAccountsResponse>(
        providerAccountsQueryKey(user.id),
        (current) => replaceProviderAccount(current, response.data),
      )
    },
  })
}

export function useSyncProviderActivity() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (provider: LinkableProvider) => syncProviderActivity(provider),
    onSettled: async () => {
      if (!user) return
      await queryClient.invalidateQueries({
        queryKey: providerAccountsQueryKey(user.id),
      })
    },
  })
}

export function useDisconnectProviderAccount() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: disconnectProviderAccount,
    onSuccess: (response) => {
      if (!user) {
        return
      }

      queryClient.setQueryData<ProviderAccountsResponse>(
        providerAccountsQueryKey(user.id),
        (current) => ({
          data:
            current?.data.filter(
              ({ provider }) => provider !== response.data.provider,
            ) ?? [],
        }),
      )
    },
  })
}
