import { useQuery } from '@tanstack/react-query'

import { fetchProviders } from '../api/catalog'

export const providerQueryKey = ['discovery', 'providers'] as const

export function useProviders() {
  return useQuery({
    queryKey: providerQueryKey,
    queryFn: ({ signal }) => fetchProviders({ signal }),
  })
}
