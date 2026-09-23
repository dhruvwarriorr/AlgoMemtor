import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'

import {
  createConnectorToken,
  fetchConnectorTokens,
  revokeConnectorToken,
} from '../api/connector'
import { providerAccountsQueryKey } from './useProviderAccounts'

const connectorTokensQueryKey = (authUserId: string) =>
  ['connector-tokens', authUserId] as const

export function useConnectorTokens() {
  const { user } = useAuth()
  return useQuery({
    queryKey: connectorTokensQueryKey(user?.id ?? 'signed-out'),
    queryFn: ({ signal }) => fetchConnectorTokens({ signal }),
    enabled: user !== null,
  })
}

export function useConnectorTokenActions() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const refresh = async () => {
    if (!user) return
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: connectorTokensQueryKey(user.id),
      }),
      // A connector upload can link or verify accounts.
      queryClient.invalidateQueries({
        queryKey: providerAccountsQueryKey(user.id),
      }),
    ])
  }
  return {
    create: useMutation({
      mutationFn: createConnectorToken,
      onSettled: refresh,
    }),
    revoke: useMutation({
      mutationFn: revokeConnectorToken,
      onSettled: refresh,
    }),
  }
}
