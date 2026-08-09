import { useQuery } from '@tanstack/react-query'

import { fetchTopics } from '../api/catalog'

export const topicQueryKey = ['discovery', 'topics'] as const

export function useTopics() {
  return useQuery({
    queryKey: topicQueryKey,
    queryFn: ({ signal }) => fetchTopics({ signal }),
  })
}
