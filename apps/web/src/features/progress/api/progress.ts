import type {
  LearnerProblemStatus,
  ProviderKey,
} from '@algomemtor/shared-contracts'

import { requestJson } from '@/features/discovery/api/client'

import {
  AiConsentResponseSchema,
  BookmarkResponseSchema,
  BookmarksResponseSchema,
  DeleteAllDataResponseSchema,
  DeleteAllDataStatusResponseSchema,
  ProgressAnalyticsResponseSchema,
  ProgressHistoryResponseSchema,
  ProblemReflectionResponseSchema,
  ProblemTimerResponseSchema,
  SaveBookmarkRequestSchema,
  ProgressResponseSchema,
  type AiConsentResponse,
  type Bookmark,
  type BookmarkQuery,
  type BookmarksResponse,
  type DeleteAllDataRequest,
  type DeleteAllDataResponse,
  type DeleteAllDataStatusResponse,
  type LearnerProgress,
  type ProblemReflectionResponse,
  type ProblemTimerResponse,
  type ProgressAnalyticsResponse,
  type ProgressHistoryQuery,
  type ProgressHistoryResponse,
  type ProgressResponse,
  type ProblemReference,
  type ResolveTimerRequest,
  type SaveAiConsentRequest,
  type SaveReflectionRequest,
  type SetProblemStatusRequest,
  type StartTimerRequest,
} from '../contracts'

type RequestOptions = { signal?: AbortSignal }

type ActionReceipt = {
  recorded: true
  actionId: string
}

type ActionReceiptResponse = { data: ActionReceipt }

type BookmarkWriteRecord = Pick<Bookmark, 'id' | 'createdAt'> & ProblemReference
type BookmarkWriteResponse = { data: BookmarkWriteRecord }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const actionReceiptSchema = {
  safeParse(value: unknown) {
    if (
      !isRecord(value) ||
      !isRecord(value.data) ||
      value.data.recorded !== true ||
      typeof value.data.actionId !== 'string' ||
      value.data.actionId.trim().length === 0
    ) {
      return {
        success: false as const,
        error: { issues: ['Invalid action response'] },
      }
    }

    return {
      success: true as const,
      data: {
        data: {
          recorded: true as const,
          actionId: value.data.actionId,
        },
      },
    }
  },
}

const noContentSchema = {
  safeParse(value: unknown) {
    return value === null
      ? { success: true as const, data: undefined }
      : {
          success: false as const,
          error: { issues: ['Expected an empty response'] },
        }
  },
}

const bookmarkWriteSchema = {
  safeParse(value: unknown) {
    const fullResponse = BookmarkResponseSchema.safeParse(value)
    if (fullResponse.success) {
      return {
        success: true as const,
        data: {
          data: {
            id: fullResponse.data.data.id,
            provider: fullResponse.data.data.problem.provider,
            externalId: fullResponse.data.data.problem.externalId,
            createdAt: fullResponse.data.data.createdAt,
          },
        },
      }
    }

    if (
      !isRecord(value) ||
      !isRecord(value.data) ||
      typeof value.data.id !== 'string' ||
      typeof value.data.provider !== 'string' ||
      value.data.provider !== 'codeforces' ||
      typeof value.data.externalId !== 'string' ||
      value.data.externalId.trim().length === 0 ||
      typeof value.data.createdAt !== 'string' ||
      Number.isNaN(Date.parse(value.data.createdAt))
    ) {
      return {
        success: false as const,
        error: { issues: ['Invalid bookmark response'] },
      }
    }

    return {
      success: true as const,
      data: {
        data: {
          id: value.data.id,
          provider: 'codeforces' as const,
          externalId: value.data.externalId,
          createdAt: value.data.createdAt,
        },
      },
    }
  },
}

function problemPath(problem: ProblemReference) {
  return (
    `/api/problems/${encodeURIComponent(problem.provider)}/` +
    `${encodeURIComponent(problem.externalId)}`
  )
}

export function fetchProgress(
  problem: ProblemReference,
  { signal }: RequestOptions = {},
) {
  return requestJson<ProgressResponse>(`${problemPath(problem)}/progress`, {
    authentication: 'required',
    schema: ProgressResponseSchema,
    signal,
  })
}

export function setProblemStatus(
  problem: ProblemReference,
  input: SetProblemStatusRequest,
) {
  return requestJson<ProgressResponse>(`${problemPath(problem)}/status`, {
    authentication: 'required',
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
    schema: ProgressResponseSchema,
  })
}

export function saveProblemReflection(
  problem: ProblemReference,
  input: SaveReflectionRequest,
) {
  return requestJson<ProblemReflectionResponse>(
    `${problemPath(problem)}/reflections`,
    {
      authentication: 'required',
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      schema: ProblemReflectionResponseSchema,
    },
  )
}

export function startProblemTimer(
  problem: ProblemReference,
  input: StartTimerRequest = { confirmSwitch: false },
) {
  return requestJson<ProblemTimerResponse>(`${problemPath(problem)}/timer`, {
    authentication: 'required',
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    schema: ProblemTimerResponseSchema,
  })
}

export function pauseTimer(timerId: string) {
  return requestJson<ProblemTimerResponse>(
    `/api/timers/${encodeURIComponent(timerId)}/pause`,
    {
      authentication: 'required',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      schema: ProblemTimerResponseSchema,
    },
  )
}

export function resumeTimer(timerId: string) {
  return requestJson<ProblemTimerResponse>(
    `/api/timers/${encodeURIComponent(timerId)}/resume`,
    {
      authentication: 'required',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      schema: ProblemTimerResponseSchema,
    },
  )
}

export function resolveTimer(timerId: string, input: ResolveTimerRequest) {
  return requestJson<ProblemTimerResponse>(
    `/api/timers/${encodeURIComponent(timerId)}/resolve`,
    {
      authentication: 'required',
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      schema: ProblemTimerResponseSchema,
    },
  )
}

export function deleteProblemProgress(problem: ProblemReference) {
  return requestJson<void>(`${problemPath(problem)}/progress`, {
    authentication: 'required',
    method: 'DELETE',
    schema: noContentSchema,
  })
}

export function fetchProgressHistory(
  query: ProgressHistoryQuery = { limit: 25 },
  { signal }: RequestOptions = {},
) {
  const params = new URLSearchParams()
  params.set('limit', String(query.limit ?? 25))
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.eventType) params.set('eventType', query.eventType)
  if (query.status) params.set('status', query.status)
  if (query.provider) params.set('provider', query.provider)
  if (query.externalId) params.set('externalId', query.externalId)
  if (query.topic) params.set('topic', query.topic)

  return requestJson<ProgressHistoryResponse>(
    `/api/progress/history?${params.toString()}`,
    {
      authentication: 'required',
      schema: ProgressHistoryResponseSchema,
      signal,
    },
  )
}

export function fetchProgressAnalytics(
  days = 30,
  { signal }: RequestOptions = {},
) {
  const params = new URLSearchParams({ days: String(days) })

  return requestJson<ProgressAnalyticsResponse>(
    `/api/progress/analytics?${params.toString()}`,
    {
      authentication: 'required',
      schema: ProgressAnalyticsResponseSchema,
      signal,
    },
  )
}

export function recordProblemAction(input: {
  problem: ProblemReference
  actionType: 'impression' | 'opened'
  recommendationItemId?: string
  sourceContext?: string
}) {
  if (
    input.actionType === 'impression' &&
    input.recommendationItemId === undefined
  ) {
    return Promise.reject(
      new Error('A recommendation item is required to record an impression.'),
    )
  }

  const endpoint =
    input.actionType === 'impression'
      ? `/api/recommendation-items/${encodeURIComponent(input.recommendationItemId as string)}/impression`
      : `${problemPath(input.problem)}/open`
  const body =
    input.actionType === 'impression'
      ? undefined
      : JSON.stringify({
          ...(input.recommendationItemId === undefined
            ? {}
            : { recommendationItemId: input.recommendationItemId }),
          ...(input.sourceContext === undefined
            ? {}
            : { sourceContext: input.sourceContext }),
        })

  return requestJson<ActionReceiptResponse>(endpoint, {
    authentication: 'required',
    ...(body === undefined ? {} : { body }),
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' } }),
    keepalive: input.actionType === 'opened',
    method: 'POST',
    schema: actionReceiptSchema,
  })
}

export function fetchAiConsent({ signal }: RequestOptions = {}) {
  return requestJson<AiConsentResponse>('/api/ai-consent', {
    authentication: 'required',
    schema: AiConsentResponseSchema,
    signal,
  })
}

export function saveAiConsent(input: SaveAiConsentRequest) {
  return requestJson<AiConsentResponse>('/api/ai-consent', {
    authentication: 'required',
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
    schema: AiConsentResponseSchema,
  })
}

export function deleteAllData(input: DeleteAllDataRequest) {
  return requestJson<DeleteAllDataResponse>('/api/me/data', {
    authentication: 'required',
    body: JSON.stringify(input),
    headers: { 'content-type': 'application/json' },
    method: 'DELETE',
    schema: DeleteAllDataResponseSchema,
  })
}

export function fetchDeleteAllDataStatus({ signal }: RequestOptions = {}) {
  return requestJson<DeleteAllDataStatusResponse>('/api/me/data/status', {
    authentication: 'required',
    schema: DeleteAllDataStatusResponseSchema,
    signal,
  })
}

export type { BookmarkQuery, BookmarksResponse, LearnerProgress }

export function fetchBookmarks(
  query: BookmarkQuery,
  { signal }: RequestOptions = {},
) {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.topic) params.set('topic', query.topic)
  if (query.status) params.set('status', query.status)
  if (query.difficulty) params.set('difficulty', query.difficulty)
  if (query.sort !== 'newest') params.set('sort', query.sort)
  if (query.page !== 1) params.set('page', String(query.page))
  if (query.pageSize !== 20) params.set('pageSize', String(query.pageSize))

  const queryString = params.toString()
  return requestJson<BookmarksResponse>(
    queryString ? `/api/bookmarks?${queryString}` : '/api/bookmarks',
    {
      authentication: 'required',
      schema: BookmarksResponseSchema,
      signal,
    },
  )
}

export function addBookmark(problem: ProblemReference) {
  return requestJson<BookmarkWriteResponse>('/api/bookmarks', {
    authentication: 'required',
    body: JSON.stringify(SaveBookmarkRequestSchema.parse(problem)),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    schema: bookmarkWriteSchema,
  })
}

export function removeBookmark(problem: ProblemReference) {
  return requestJson<void>(
    `/api/bookmarks/${encodeURIComponent(problem.provider)}/${encodeURIComponent(problem.externalId)}`,
    {
      authentication: 'required',
      method: 'DELETE',
      schema: noContentSchema,
    },
  )
}

export type { LearnerProblemStatus, ProviderKey }
