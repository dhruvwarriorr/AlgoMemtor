import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type {
  LearnerProblemStatus,
  NormalizedDifficulty,
} from '@algomemtor/shared-contracts'

import { useAuth } from '@/features/auth/useAuth'
import {
  addBookmark,
  fetchBookmarks,
  removeBookmark,
} from '@/features/progress/api/progress'
import {
  bookmarkSort,
  type BookmarkQuery,
  type ProblemReference,
} from '@/features/progress/contracts'

export const bookmarksQueryKey = (authUserId: string, query: BookmarkQuery) =>
  ['bookmarks', authUserId, query] as const

type BookmarkQueryUpdates = {
  search?: string | null
  topic?: string | null
  status?: LearnerProblemStatus | null
  difficulty?: NormalizedDifficulty | null
  sort?: BookmarkQuery['sort']
  page?: number
  pageSize?: number
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function useBookmarkFilters() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = useMemo<BookmarkQuery>(() => {
    const search = searchParams.get('search')?.trim()
    const topic = searchParams.get('topic')?.trim()
    const status = searchParams.get('status')
    const difficulty = searchParams.get('difficulty')
    const pageSize = parsePositiveInteger(searchParams.get('pageSize'), 20)

    return {
      ...(search ? { search } : {}),
      ...(topic ? { topic } : {}),
      ...(status === 'unsolved' || status === 'attempted' || status === 'solved'
        ? { status }
        : {}),
      ...(difficulty === 'easy' ||
      difficulty === 'medium' ||
      difficulty === 'hard'
        ? { difficulty }
        : {}),
      sort: bookmarkSort(searchParams.get('sort')),
      page: parsePositiveInteger(searchParams.get('page'), 1),
      pageSize: [10, 20, 50].includes(pageSize) ? pageSize : 20,
    }
  }, [searchParams])

  const update = useCallback(
    (updates: BookmarkQueryUpdates, preservePage = false) => {
      const next = { ...query, ...updates, page: preservePage ? query.page : 1 }
      if (updates.search === null) delete next.search
      if (updates.topic === null) delete next.topic
      if (updates.status === null) delete next.status
      if (updates.difficulty === null) delete next.difficulty
      const nextParams = new URLSearchParams()
      if (next.search) nextParams.set('search', next.search)
      if (next.topic) nextParams.set('topic', next.topic)
      if (next.status) nextParams.set('status', next.status)
      if (next.difficulty) nextParams.set('difficulty', next.difficulty)
      if (next.sort !== 'newest') nextParams.set('sort', next.sort)
      if (next.page !== 1) nextParams.set('page', String(next.page))
      if (next.pageSize !== 20)
        nextParams.set('pageSize', String(next.pageSize))
      setSearchParams(nextParams)
    },
    [query, setSearchParams],
  )

  const clear = useCallback(
    () => setSearchParams(new URLSearchParams()),
    [setSearchParams],
  )

  return {
    query,
    hasActiveFilters:
      Boolean(
        query.search || query.topic || query.status || query.difficulty,
      ) ||
      query.sort !== 'newest' ||
      query.page !== 1 ||
      query.pageSize !== 20,
    update,
    setPage: (page: number) => update({ page }, true),
    clear,
  }
}

export function useBookmarks(query: BookmarkQuery) {
  const { user } = useAuth()

  return useQuery({
    queryKey: bookmarksQueryKey(user?.id ?? 'signed-out', query),
    queryFn: ({ signal }) => fetchBookmarks(query, { signal }),
    enabled: user !== null,
  })
}

function invalidateBookmarkQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['bookmarks'] }),
    queryClient.invalidateQueries({
      queryKey: ['discovery', 'problem-catalog'],
    }),
    queryClient.invalidateQueries({ queryKey: ['recommendations'] }),
    queryClient.invalidateQueries({ queryKey: ['progress'] }),
  ])
}

export function useAddBookmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (problem: ProblemReference) => addBookmark(problem),
    onSuccess: () => invalidateBookmarkQueries(queryClient),
  })
}

export function useRemoveBookmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (problem: ProblemReference) => removeBookmark(problem),
    onSuccess: () => invalidateBookmarkQueries(queryClient),
  })
}
