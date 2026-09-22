import { z } from 'zod'

import {
  ExternalProblemSummarySchema,
  LearnerProblemStatusSchema,
  NormalizedDifficultySchema,
  ProviderKeySchema,
} from './problem-catalog.js'

const identifierSchema = z.uuid()
const externalIdSchema = z.string().trim().min(1).max(128).regex(/^\S+$/)
const nonEmptyStringSchema = z.string().trim().min(1)
const optionalNoteSchema = z.string().trim().max(1_000).optional()

export const ProblemReferenceSchema = z
  .object({
    provider: ProviderKeySchema,
    externalId: externalIdSchema,
  })
  .strict()

export type ProblemReference = z.infer<typeof ProblemReferenceSchema>

export const EvidenceSourceSchema = z.enum(['manual', 'provider_verified'])
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>

export const ProgressEvidenceSummarySchema = z
  .object({
    provider: ProviderKeySchema,
    occurredAt: z.iso.datetime(),
    observedAt: z.iso.datetime(),
  })
  .strict()

export type ProgressEvidenceSummary = z.infer<
  typeof ProgressEvidenceSummarySchema
>

export const PerceivedDifficultySchema = NormalizedDifficultySchema
export type PerceivedDifficulty = z.infer<typeof PerceivedDifficultySchema>

export const ProblemReflectionSchema = z
  .object({
    id: identifierSchema,
    problem: ProblemReferenceSchema,
    perceivedDifficulty: PerceivedDifficultySchema,
    note: optionalNoteSchema,
    statusActionId: identifierSchema.optional(),
    createdAt: z.iso.datetime(),
    supersedesReflectionId: identifierSchema.optional(),
  })
  .strict()

export type ProblemReflection = z.infer<typeof ProblemReflectionSchema>

export const ProblemReflectionResponseSchema = z
  .object({ data: ProblemReflectionSchema })
  .strict()
export type ProblemReflectionResponse = z.infer<
  typeof ProblemReflectionResponseSchema
>

export const ProblemTimerStateSchema = z.enum([
  'running',
  'paused',
  'completed',
  'discarded',
  'capped',
])
export type ProblemTimerState = z.infer<typeof ProblemTimerStateSchema>

export const ProblemTimerSessionSchema = z
  .object({
    id: identifierSchema,
    problem: ProblemReferenceSchema,
    state: ProblemTimerStateSchema,
    durationSeconds: z.number().int().nonnegative(),
    startedAt: z.iso.datetime(),
    lastResumedAt: z.iso.datetime().optional(),
    pausedAt: z.iso.datetime().optional(),
    completedAt: z.iso.datetime().optional(),
    requiresResolution: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .strict()

export type ProblemTimerSession = z.infer<typeof ProblemTimerSessionSchema>

export const ProblemTimerResponseSchema = z
  .object({ data: ProblemTimerSessionSchema })
  .strict()
export type ProblemTimerResponse = z.infer<typeof ProblemTimerResponseSchema>

export const LearnerProgressSchema = z
  .object({
    problem: ProblemReferenceSchema,
    status: LearnerProblemStatusSchema,
    evidenceSource: EvidenceSourceSchema.optional(),
    evidence: ProgressEvidenceSummarySchema.optional(),
    statusActionId: identifierSchema.optional(),
    bookmarked: z.boolean(),
    latestReflection: ProblemReflectionSchema.optional(),
    focusedSeconds: z.number().int().nonnegative(),
    activeTimer: ProblemTimerSessionSchema.optional(),
  })
  .strict()

export type LearnerProgress = z.infer<typeof LearnerProgressSchema>

export const SetProblemStatusRequestSchema = z
  .object({
    status: LearnerProblemStatusSchema,
    recommendationItemId: identifierSchema.optional(),
    sourceContext: z.string().trim().min(1).max(64).optional(),
  })
  .strict()

export type SetProblemStatusRequest = z.infer<
  typeof SetProblemStatusRequestSchema
>

export const SaveReflectionRequestSchema = z
  .object({
    perceivedDifficulty: PerceivedDifficultySchema,
    note: optionalNoteSchema,
    statusActionId: identifierSchema.optional(),
  })
  .strict()

export type SaveReflectionRequest = z.infer<typeof SaveReflectionRequestSchema>

export const StartTimerRequestSchema = z
  .object({
    confirmSwitch: z.boolean().default(false),
  })
  .strict()

export type StartTimerRequest = z.infer<typeof StartTimerRequestSchema>

export const ResolveTimerRequestSchema = z
  .object({
    resolution: z.enum(['complete', 'discard']),
  })
  .strict()

export type ResolveTimerRequest = z.infer<typeof ResolveTimerRequestSchema>

export const ProgressResponseSchema = z
  .object({
    data: LearnerProgressSchema,
  })
  .strict()
export type ProgressResponse = z.infer<typeof ProgressResponseSchema>

export const ProgressHistoryEventTypeSchema = z.enum([
  'status_changed',
  'reflection_created',
  'timer_started',
  'timer_paused',
  'timer_completed',
  'timer_discarded',
  'impression',
  'bookmark_added',
  'bookmark_removed',
  'dismissed',
  'dismissal_restored',
])
export type ProgressHistoryEventType = z.infer<
  typeof ProgressHistoryEventTypeSchema
>

export const ProgressHistoryEventSchema = z
  .object({
    id: identifierSchema,
    eventType: ProgressHistoryEventTypeSchema,
    problem: ProblemReferenceSchema,
    occurredAt: z.iso.datetime(),
    status: LearnerProblemStatusSchema.optional(),
    evidenceSource: EvidenceSourceSchema.optional(),
    evidence: ProgressEvidenceSummarySchema.optional(),
    durationSeconds: z.number().int().nonnegative().optional(),
    recommendationItemId: identifierSchema.optional(),
    sourceContext: z.string().trim().min(1).max(64).optional(),
    reflection: ProblemReflectionSchema.optional(),
  })
  .strict()

export type ProgressHistoryEvent = z.infer<typeof ProgressHistoryEventSchema>

export const ProgressHistoryQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(256).optional(),
    limit: z.coerce.number().int().positive().max(100).default(25),
    eventType: ProgressHistoryEventTypeSchema.optional(),
    status: LearnerProblemStatusSchema.optional(),
    provider: ProviderKeySchema.optional(),
    externalId: externalIdSchema.optional(),
    topic: nonEmptyStringSchema.max(64).optional(),
  })
  .strict()

export type ProgressHistoryQuery = z.infer<typeof ProgressHistoryQuerySchema>

export const ProgressAnalyticsQuerySchema = z
  .object({
    days: z.coerce.number().int().positive().max(30).default(30),
  })
  .strict()

export type ProgressAnalyticsQuery = z.infer<
  typeof ProgressAnalyticsQuerySchema
>

export const ProgressHistoryResponseSchema = z
  .object({
    data: z.array(ProgressHistoryEventSchema),
    meta: z
      .object({
        nextCursor: z.string().trim().min(1).max(256).optional(),
        hasMore: z.boolean(),
      })
      .strict(),
  })
  .strict()

export type ProgressHistoryResponse = z.infer<
  typeof ProgressHistoryResponseSchema
>

export const TopicScoreSchema = z
  .object({
    topic: nonEmptyStringSchema.max(64),
    score: z.number().int().min(0).max(100),
    evidenceCount: z.number().int().nonnegative(),
    formula: z.string().trim().min(1).max(240),
  })
  .strict()

export type TopicScore = z.infer<typeof TopicScoreSchema>

export const ProgressAnalyticsSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    timezone: z.string().trim().min(1).max(64),
    inventory: z
      .object({
        unsolved: z.number().int().nonnegative(),
        attempted: z.number().int().nonnegative(),
        solved: z.number().int().nonnegative(),
      })
      .strict(),
    window: z
      .object({
        days: z.number().int().min(1).max(30),
        attempted: z.number().int().nonnegative(),
        solved: z.number().int().nonnegative(),
      })
      .strict(),
    trend: z
      .array(
        z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            attempted: z.number().int().nonnegative(),
            solved: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(31),
    focusedSeconds: z.number().int().nonnegative(),
    averageSolvedSeconds: z.number().nonnegative().nullable(),
    currentStreak: z.number().int().nonnegative(),
    longestStreak: z.number().int().nonnegative(),
    completionRate: z.number().min(0).max(1),
    recommendationConversions: z
      .object({
        impressions: z.number().int().nonnegative(),
        attempted: z.number().int().nonnegative(),
        solved: z.number().int().nonnegative(),
        impressionToAttempt: z.number().min(0).max(1),
        impressionToSolve: z.number().min(0).max(1),
      })
      .strict(),
    topicScores: z.array(TopicScoreSchema),
  })
  .strict()

export type ProgressAnalytics = z.infer<typeof ProgressAnalyticsSchema>

export const ProgressAnalyticsResponseSchema = z
  .object({ data: ProgressAnalyticsSchema })
  .strict()
export type ProgressAnalyticsResponse = z.infer<
  typeof ProgressAnalyticsResponseSchema
>

export const BookmarkSortSchema = z.enum(['newest', 'difficulty', 'title'])
export type BookmarkSort = z.infer<typeof BookmarkSortSchema>

export const BookmarkQuerySchema = z
  .object({
    search: nonEmptyStringSchema.max(200).optional(),
    topic: nonEmptyStringSchema.max(64).optional(),
    status: LearnerProblemStatusSchema.optional(),
    difficulty: NormalizedDifficultySchema.optional(),
    sort: BookmarkSortSchema.default('newest'),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()

export type BookmarkQuery = z.infer<typeof BookmarkQuerySchema>

export const BookmarkSchema = z
  .object({
    id: identifierSchema,
    problem: ExternalProblemSummarySchema,
    createdAt: z.iso.datetime(),
  })
  .strict()

export type Bookmark = z.infer<typeof BookmarkSchema>

export const BookmarkResponseSchema = z
  .object({ data: BookmarkSchema })
  .strict()
export type BookmarkResponse = z.infer<typeof BookmarkResponseSchema>

export const BookmarksResponseSchema = z
  .object({
    data: z.array(BookmarkSchema),
    meta: z
      .object({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        total: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()

export type BookmarksResponse = z.infer<typeof BookmarksResponseSchema>

export const SaveBookmarkRequestSchema = ProblemReferenceSchema
export type SaveBookmarkRequest = z.infer<typeof SaveBookmarkRequestSchema>

export const AiConsentSchema = z
  .object({
    enabled: z.boolean(),
    policyVersion: z.string().trim().min(1).max(64),
    decidedAt: z.iso.datetime().optional(),
  })
  .strict()

export type AiConsent = z.infer<typeof AiConsentSchema>

export const AiConsentResponseSchema = z
  .object({ data: AiConsentSchema.nullable() })
  .strict()
export type AiConsentResponse = z.infer<typeof AiConsentResponseSchema>

export const SaveAiConsentRequestSchema = z
  .object({
    enabled: z.boolean(),
    policyVersion: z.string().trim().min(1).max(64),
  })
  .strict()
export type SaveAiConsentRequest = z.infer<typeof SaveAiConsentRequestSchema>

export const DeleteAllDataRequestSchema = z
  .object({ confirmation: z.literal('DELETE') })
  .strict()
export type DeleteAllDataRequest = z.infer<typeof DeleteAllDataRequestSchema>

export const DeleteAllDataResponseSchema = z
  .object({
    data: z
      .object({
        status: z.enum(['pending', 'completed']),
        jobId: identifierSchema,
      })
      .strict(),
  })
  .strict()
export type DeleteAllDataResponse = z.infer<typeof DeleteAllDataResponseSchema>

export const DeleteAllDataStatusSchema = z.enum([
  'pending',
  'completed',
  'failed',
])
export type DeleteAllDataStatus = z.infer<typeof DeleteAllDataStatusSchema>

export const DeleteAllDataStatusResponseSchema = z
  .object({
    data: z.object({ status: DeleteAllDataStatusSchema }).strict(),
  })
  .strict()
export type DeleteAllDataStatusResponse = z.infer<
  typeof DeleteAllDataStatusResponseSchema
>
