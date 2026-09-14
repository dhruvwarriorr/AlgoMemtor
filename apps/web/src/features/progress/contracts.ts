import {
  BookmarkSortSchema,
  ProblemReferenceSchema,
  type BookmarkSort,
} from '@algomemtor/shared-contracts'

export {
  AiConsentResponseSchema,
  AiConsentSchema,
  BookmarkQuerySchema,
  BookmarkResponseSchema,
  BookmarkSchema,
  BookmarkSortSchema,
  BookmarksResponseSchema,
  DeleteAllDataRequestSchema,
  DeleteAllDataResponseSchema,
  DeleteAllDataStatusSchema,
  DeleteAllDataStatusResponseSchema,
  EvidenceSourceSchema,
  LearnerProgressSchema,
  PerceivedDifficultySchema,
  ProblemReflectionResponseSchema,
  ProblemReflectionSchema,
  ProblemReferenceSchema,
  ProblemTimerResponseSchema,
  ProblemTimerSessionSchema,
  ProblemTimerStateSchema,
  ProgressAnalyticsResponseSchema,
  ProgressAnalyticsQuerySchema,
  ProgressAnalyticsSchema,
  ProgressHistoryEventSchema,
  ProgressHistoryEventTypeSchema,
  ProgressHistoryQuerySchema,
  ProgressHistoryResponseSchema,
  ProgressResponseSchema,
  ResolveTimerRequestSchema,
  SaveAiConsentRequestSchema,
  SaveBookmarkRequestSchema,
  SaveReflectionRequestSchema,
  SetProblemStatusRequestSchema,
  StartTimerRequestSchema,
} from '@algomemtor/shared-contracts'

export type {
  AiConsent,
  AiConsentResponse,
  Bookmark,
  BookmarkQuery,
  BookmarkResponse,
  BookmarksResponse,
  DeleteAllDataRequest,
  DeleteAllDataResponse,
  DeleteAllDataStatus,
  DeleteAllDataStatusResponse,
  EvidenceSource,
  LearnerProgress,
  PerceivedDifficulty,
  ProblemReflection,
  ProblemReflectionResponse,
  ProblemReference,
  ProblemTimerResponse,
  ProblemTimerSession,
  ProblemTimerState,
  ProgressAnalytics,
  ProgressAnalyticsResponse,
  ProgressAnalyticsQuery,
  ProgressHistoryEvent,
  ProgressHistoryEventType,
  ProgressHistoryQuery,
  ProgressHistoryResponse,
  ProgressResponse,
  ResolveTimerRequest,
  SaveAiConsentRequest,
  SaveBookmarkRequest,
  SaveReflectionRequest,
  SetProblemStatusRequest,
  StartTimerRequest,
  BookmarkSort,
} from '@algomemtor/shared-contracts'

export type ResponseParseResult<T> =
  { success: true; data: T } | { success: false; error: { issues: unknown } }

export type ResponseSchema<T> = {
  safeParse: (value: unknown) => ResponseParseResult<T>
}

export function bookmarkSort(value: string | null): BookmarkSort {
  const parsed = BookmarkSortSchema.safeParse(value)
  return parsed.success ? parsed.data : 'newest'
}

export function isProblemReference(value: unknown): value is {
  provider: 'codeforces'
  externalId: string
} {
  return ProblemReferenceSchema.safeParse(value).success
}

export function problemKey(value: {
  provider: 'codeforces'
  externalId: string
}) {
  return `${value.provider}:${value.externalId}`
}
