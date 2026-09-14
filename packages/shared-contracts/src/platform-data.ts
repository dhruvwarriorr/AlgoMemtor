import { z } from 'zod'

import {
  NormalizedDifficultySchema,
  ProviderKeySchema,
  ExternalProblemSummarySchema,
  ProviderFreshnessSchema,
  ProviderWarningSchema,
} from './problem-catalog.js'
import { ProviderAccountSchema } from './provider-account.js'

const nonEmptyStringSchema = z.string().trim().min(1)
const optionalStringSchema = nonEmptyStringSchema.optional()
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', {
    message: 'Only HTTPS URLs are allowed.',
  })

export const ExtractionStrategySchema = z.enum([
  'official_json',
  'public_graphql',
  'embedded_json',
  'sanitized_html',
  'stale_cache',
])
export type ExtractionStrategy = z.infer<typeof ExtractionStrategySchema>

export const CompletenessSchema = z.enum(['complete', 'partial', 'unknown'])
export type Completeness = z.infer<typeof CompletenessSchema>

export const ProviderProvenanceSchema = z
  .object({
    provider: ProviderKeySchema,
    providerId: nonEmptyStringSchema,
    canonicalUrl: httpsUrlSchema,
    sourceUrl: httpsUrlSchema,
    extractionStrategy: ExtractionStrategySchema,
    schemaVersion: nonEmptyStringSchema,
    completeness: CompletenessSchema,
    fetchedAt: z.iso.datetime(),
    stale: z.boolean(),
    errorCode: optionalStringSchema,
  })
  .strict()
export type ProviderProvenance = z.infer<typeof ProviderProvenanceSchema>

export const ProviderProfileSchema = z
  .object({
    provider: ProviderKeySchema,
    externalId: nonEmptyStringSchema,
    handle: nonEmptyStringSchema,
    displayName: optionalStringSchema,
    profileUrl: httpsUrlSchema,
    avatarUrl: httpsUrlSchema.optional(),
    rank: optionalStringSchema,
    globalRank: z.number().int().positive().optional(),
    rating: z.number().finite().optional(),
    solvedCount: z.number().int().nonnegative().optional(),
    acceptanceRate: z.number().finite().min(0).max(100).optional(),
    languageCounts: z.record(
      nonEmptyStringSchema,
      z.number().int().nonnegative(),
    ),
    topicCounts: z.record(nonEmptyStringSchema, z.number().int().nonnegative()),
    badges: z.array(nonEmptyStringSchema),
    calendar: z.record(nonEmptyStringSchema, z.number().int().nonnegative()),
    completeness: CompletenessSchema,
    provenance: ProviderProvenanceSchema,
  })
  .strict()
export type ProviderProfile = z.infer<typeof ProviderProfileSchema>

export const ProviderProfileResponseSchema = z
  .object({ data: ProviderProfileSchema })
  .strict()
export type ProviderProfileResponse = z.infer<
  typeof ProviderProfileResponseSchema
>

export const ProviderSubmissionSchema = z
  .object({
    provider: ProviderKeySchema,
    externalId: nonEmptyStringSchema,
    eventId: nonEmptyStringSchema,
    problemTitle: optionalStringSchema,
    canonicalUrl: httpsUrlSchema,
    verdict: nonEmptyStringSchema,
    language: optionalStringSchema,
    occurredAt: z.iso.datetime().optional(),
    isAccepted: z.boolean(),
    completeness: CompletenessSchema,
    provenance: ProviderProvenanceSchema,
  })
  .strict()
export type ProviderSubmission = z.infer<typeof ProviderSubmissionSchema>

export const ProviderSolvedProblemSchema = z
  .object({
    provider: ProviderKeySchema,
    externalId: nonEmptyStringSchema,
    canonicalUrl: httpsUrlSchema,
    occurredAt: z.iso.datetime().nullable(),
    firstObservedAt: z.iso.datetime(),
    lastObservedAt: z.iso.datetime(),
    sourceSubmissionId: nonEmptyStringSchema.optional(),
    providerTags: z.array(nonEmptyStringSchema).optional(),
    topics: z.array(nonEmptyStringSchema).optional(),
    completeness: CompletenessSchema,
    provenance: ProviderProvenanceSchema,
  })
  .strict()
export type ProviderSolvedProblem = z.infer<typeof ProviderSolvedProblemSchema>

export const ProviderRatingChangeSchema = z
  .object({
    provider: ProviderKeySchema,
    eventId: nonEmptyStringSchema,
    contestId: nonEmptyStringSchema.optional(),
    contestName: nonEmptyStringSchema.optional(),
    occurredAt: z.iso.datetime(),
    oldRating: z.number().finite(),
    newRating: z.number().finite(),
    delta: z.number().finite(),
    providerPercentile: z.number().finite().min(0).max(100).optional(),
    provenance: ProviderProvenanceSchema,
  })
  .strict()
export type ProviderRatingChange = z.infer<typeof ProviderRatingChangeSchema>

export const ExternalContestSchema = z
  .object({
    provider: ProviderKeySchema,
    externalId: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    canonicalUrl: httpsUrlSchema,
    phase: nonEmptyStringSchema.optional(),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().optional(),
    durationSeconds: z.number().int().positive().optional(),
    isRated: z.boolean().optional(),
    status: z.enum(['upcoming', 'running', 'finished', 'unknown']),
    provenance: ProviderProvenanceSchema,
  })
  .strict()
export type ExternalContest = z.infer<typeof ExternalContestSchema>

export const ContestParticipationSchema = z
  .object({
    provider: ProviderKeySchema,
    contestId: nonEmptyStringSchema,
    contestName: nonEmptyStringSchema.optional(),
    rank: z.number().int().positive().optional(),
    score: z.number().finite().optional(),
    ratingChange: z.number().finite().optional(),
    oldRating: z.number().finite().optional(),
    newRating: z.number().finite().optional(),
    attendedAt: z.iso.datetime().optional(),
    provenance: ProviderProvenanceSchema,
  })
  .strict()
export type ContestParticipation = z.infer<typeof ContestParticipationSchema>

export const ProblemContentSchema = z
  .object({
    provider: ProviderKeySchema,
    externalId: nonEmptyStringSchema,
    canonicalUrl: httpsUrlSchema,
    title: nonEmptyStringSchema,
    statementHtml: z.string().trim().optional(),
    statementText: z.string().trim().optional(),
    constraints: z.array(nonEmptyStringSchema),
    examples: z.array(
      z
        .object({
          input: z.string(),
          output: z.string(),
          explanation: z.string().optional(),
        })
        .strict(),
    ),
    hints: z.array(nonEmptyStringSchema),
    publicSolutionHtml: z.string().trim().optional(),
    isPaidOnly: z.boolean(),
    completeness: CompletenessSchema,
    provenance: ProviderProvenanceSchema,
  })
  .strict()
export type ProblemContent = z.infer<typeof ProblemContentSchema>

export const ProviderSyncStateSchema = z
  .object({
    provider: ProviderKeySchema,
    capability: nonEmptyStringSchema,
    status: z.enum([
      'idle',
      'queued',
      'running',
      'complete',
      'partial',
      'stale',
      'error',
      'disabled',
    ]),
    cursor: z.string().optional(),
    lastStartedAt: z.iso.datetime().optional(),
    lastSucceededAt: z.iso.datetime().optional(),
    nextRunAt: z.iso.datetime().optional(),
    attempts: z.number().int().nonnegative(),
    lastErrorCode: nonEmptyStringSchema.optional(),
    completeness: CompletenessSchema,
    stale: z.boolean(),
  })
  .strict()
export type ProviderSyncState = z.infer<typeof ProviderSyncStateSchema>

export const ProviderSyncJobSchema = z
  .object({
    id: z.uuid(),
    provider: ProviderKeySchema,
    capability: nonEmptyStringSchema,
    status: z.enum(['queued', 'running', 'completed', 'failed']),
    queuedAt: z.iso.datetime(),
    runAfter: z.iso.datetime(),
    cursor: z.string().optional(),
    attempts: z.number().int().nonnegative(),
    lastErrorCode: nonEmptyStringSchema.optional(),
  })
  .strict()
export type ProviderSyncJob = z.infer<typeof ProviderSyncJobSchema>

export const ProviderSyncRequestResponseSchema = z
  .object({
    data: z.object({
      provider: ProviderKeySchema,
      job: ProviderSyncJobSchema,
      accepted: z.boolean(),
      nextAllowedAt: z.iso.datetime(),
    }),
  })
  .strict()
export type ProviderSyncRequestResponse = z.infer<
  typeof ProviderSyncRequestResponseSchema
>

export const ProviderSyncStatusResponseSchema = z
  .object({
    data: z.object({
      provider: ProviderKeySchema,
      state: ProviderSyncStateSchema,
      job: ProviderSyncJobSchema.optional(),
    }),
  })
  .strict()
export type ProviderSyncStatusResponse = z.infer<
  typeof ProviderSyncStatusResponseSchema
>

export const ProviderActivityEventSchema = z
  .object({
    id: nonEmptyStringSchema,
    provider: ProviderKeySchema,
    eventType: z.enum(['submission', 'solved', 'rating_change', 'contest']),
    externalId: nonEmptyStringSchema.optional(),
    providerEventId: nonEmptyStringSchema.optional(),
    title: nonEmptyStringSchema.optional(),
    canonicalUrl: httpsUrlSchema.optional(),
    occurredAt: z.iso.datetime().nullable(),
    verdict: nonEmptyStringSchema.optional(),
    language: nonEmptyStringSchema.optional(),
    providerTags: z.array(nonEmptyStringSchema).optional(),
    topics: z.array(nonEmptyStringSchema).optional(),
    ratingDelta: z.number().finite().optional(),
    rank: z.number().int().positive().optional(),
    source: z.enum(['provider', 'manual', 'system']),
    completeness: CompletenessSchema,
  })
  .strict()
export type ProviderActivityEvent = z.infer<typeof ProviderActivityEventSchema>

export const ProviderActivityResponseSchema = z
  .object({
    data: z.array(ProviderActivityEventSchema),
    meta: z.object({
      partial: z.boolean(),
      stale: z.boolean(),
      providers: z.array(ProviderFreshnessSchema),
    }),
  })
  .strict()
export type ProviderActivityResponse = z.infer<
  typeof ProviderActivityResponseSchema
>

export const ExternalContestsResponseSchema = z
  .object({
    data: z.array(ExternalContestSchema),
    meta: z.object({
      partial: z.boolean(),
      stale: z.boolean(),
      providers: z.array(ProviderFreshnessSchema),
    }),
  })
  .strict()
export type ExternalContestsResponse = z.infer<
  typeof ExternalContestsResponseSchema
>

export const ExternalContestsQuerySchema = z
  .object({
    provider: ProviderKeySchema.optional(),
    status: ExternalContestSchema.shape.status.optional(),
    startsAfter: z.iso.datetime().optional(),
    endsBefore: z.iso.datetime().optional(),
    limit: z.coerce.number().int().positive().max(500).default(100),
  })
  .refine(
    ({ startsAfter, endsBefore }) =>
      startsAfter === undefined ||
      endsBefore === undefined ||
      Date.parse(startsAfter) <= Date.parse(endsBefore),
    {
      message: 'startsAfter must not be later than endsBefore.',
      path: ['endsBefore'],
    },
  )
export type ExternalContestsQuery = z.infer<typeof ExternalContestsQuerySchema>

export const ProblemDetailResponseSchema = z
  .object({
    data: z.object({
      summary: ExternalProblemSummarySchema,
      content: ProblemContentSchema.nullable(),
    }),
    meta: z
      .object({
        warnings: z.array(ProviderWarningSchema),
        freshness: ProviderFreshnessSchema,
      })
      .optional(),
  })
  .strict()
export type ProblemDetailResponse = z.infer<typeof ProblemDetailResponseSchema>

export const UnifiedProfileProviderSummarySchema = z
  .object({
    provider: ProviderKeySchema,
    handle: nonEmptyStringSchema,
    solvedCount: z.number().int().nonnegative().optional(),
    complete: z.boolean().optional(),
    stale: z.boolean(),
    rating: z.number().finite().optional(),
    rank: nonEmptyStringSchema.optional(),
    syncEnabled: z.boolean().optional(),
    fetchedAt: z.iso.datetime().optional(),
  })
  .strict()
export type UnifiedProfileProviderSummary = z.infer<
  typeof UnifiedProfileProviderSummarySchema
>

export const UnifiedProfileSchema = z
  .object({
    solvedTotal: z.number().int().nonnegative(),
    providers: z.array(UnifiedProfileProviderSummarySchema),
    profiles: z.array(ProviderProfileSchema).optional(),
    accounts: z.array(ProviderAccountSchema),
    archivedAccounts: z.array(ProviderAccountSchema).optional(),
    completeness: CompletenessSchema,
    staleProviders: z.array(ProviderKeySchema),
    generatedAt: z.iso.datetime(),
  })
  .strict()
export type UnifiedProfile = z.infer<typeof UnifiedProfileSchema>

export const UnifiedProfileResponseSchema = z
  .object({ data: UnifiedProfileSchema })
  .strict()
export type UnifiedProfileResponse = z.infer<
  typeof UnifiedProfileResponseSchema
>

export const UnifiedAnalyticsSchema = z
  .object({
    solvedTotal: z.number().int().nonnegative(),
    solvedByProvider: z.record(
      ProviderKeySchema,
      z.number().int().nonnegative(),
    ),
    solvedOverTime: z.record(
      nonEmptyStringSchema,
      z.number().int().nonnegative(),
    ),
    solvedByDifficulty: z.record(
      NormalizedDifficultySchema,
      z.number().int().nonnegative(),
    ),
    topicCounts: z.record(nonEmptyStringSchema, z.number().int().nonnegative()),
    languageCounts: z.record(
      nonEmptyStringSchema,
      z.number().int().nonnegative(),
    ),
    acceptanceRate: z.number().finite().min(0).max(100).optional(),
    ratingHistory: z.array(ProviderRatingChangeSchema),
    contestParticipation: z.array(ContestParticipationSchema),
    dataCompleteness: CompletenessSchema,
    staleProviders: z.array(ProviderKeySchema),
    generatedAt: z.iso.datetime(),
  })
  .strict()
export type UnifiedAnalytics = z.infer<typeof UnifiedAnalyticsSchema>
