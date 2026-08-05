import { z } from 'zod'

const nonEmptyStringSchema = z.string().trim().min(1)

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', {
    message: 'Only HTTPS URLs are allowed.',
  })

export const ProviderKeySchema = z.enum(['codeforces'])

export type ProviderKey = z.infer<typeof ProviderKeySchema>

export const ProviderAvailabilitySchema = z.enum([
  'available',
  'degraded',
  'unavailable',
])

export type ProviderAvailability = z.infer<typeof ProviderAvailabilitySchema>

export const NormalizedDifficultySchema = z.enum(['easy', 'medium', 'hard'])

export type NormalizedDifficulty = z.infer<typeof NormalizedDifficultySchema>

export const LearnerProblemStatusSchema = z.enum([
  'unsolved',
  'attempted',
  'solved',
])

export type LearnerProblemStatus = z.infer<typeof LearnerProblemStatusSchema>

export const ExternalProblemSummarySchema = z.object({
  provider: ProviderKeySchema,
  externalId: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  canonicalUrl: httpsUrlSchema,
  providerDifficulty: z
    .union([z.number().nonnegative(), nonEmptyStringSchema])
    .optional(),
  normalizedDifficulty: NormalizedDifficultySchema.optional(),
  providerTags: z.array(nonEmptyStringSchema),
  topics: z.array(nonEmptyStringSchema).min(1),
  solvedCount: z.number().int().nonnegative().optional(),
  fetchedAt: z.iso.datetime(),
  learnerStatus: LearnerProblemStatusSchema.optional(),
  recommendationReason: nonEmptyStringSchema.optional(),
})

export type ExternalProblemSummary = z.infer<
  typeof ExternalProblemSummarySchema
>

export const ProviderSummarySchema = z.object({
  key: ProviderKeySchema,
  label: nonEmptyStringSchema,
  availability: ProviderAvailabilitySchema,
})

export type ProviderSummary = z.infer<typeof ProviderSummarySchema>

export const TopicSchema = z.object({
  id: nonEmptyStringSchema,
  slug: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
})

export type Topic = z.infer<typeof TopicSchema>

export const ExternalProblemCatalogQueryParamsSchema = z
  .object({
    search: nonEmptyStringSchema.optional(),
    provider: ProviderKeySchema.optional(),
    difficulty: NormalizedDifficultySchema.optional(),
    topic: nonEmptyStringSchema.optional(),
    status: LearnerProblemStatusSchema.optional(),
    minRating: z.coerce.number().finite().nonnegative().optional(),
    maxRating: z.coerce.number().finite().nonnegative().optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(10),
  })
  .refine(
    ({ minRating, maxRating }) =>
      minRating === undefined ||
      maxRating === undefined ||
      minRating <= maxRating,
    {
      message: 'Minimum rating must not exceed maximum rating.',
      path: ['maxRating'],
    },
  )

export type ExternalProblemCatalogQueryParams = z.infer<
  typeof ExternalProblemCatalogQueryParamsSchema
>

export const OutboundEventRequestSchema = z.object({
  provider: ProviderKeySchema,
  externalId: nonEmptyStringSchema,
  event: z.literal('opened'),
})

export type OutboundEventRequest = z.infer<typeof OutboundEventRequestSchema>

export const OutboundEventResponseSchema = z.object({
  data: OutboundEventRequestSchema.extend({
    recordedAt: z.iso.datetime(),
  }),
})

export type OutboundEventResponse = z.infer<typeof OutboundEventResponseSchema>

export const PaginationMetadataSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})

export type PaginationMetadata = z.infer<typeof PaginationMetadataSchema>

export const ProviderWarningSchema = z.object({
  provider: ProviderKeySchema,
  code: nonEmptyStringSchema,
  message: nonEmptyStringSchema,
})

export type ProviderWarning = z.infer<typeof ProviderWarningSchema>

export const ExternalProblemCatalogResponseSchema = z.object({
  data: z.array(ExternalProblemSummarySchema),
  meta: PaginationMetadataSchema.extend({
    partial: z.boolean().default(false),
    warnings: z.array(ProviderWarningSchema).default([]),
  }),
})

export type ExternalProblemCatalogResponse = z.infer<
  typeof ExternalProblemCatalogResponseSchema
>

export const ProvidersResponseSchema = z.object({
  data: z.array(ProviderSummarySchema),
})

export type ProvidersResponse = z.infer<typeof ProvidersResponseSchema>

export const TopicsResponseSchema = z.object({
  data: z.array(TopicSchema),
})

export type TopicsResponse = z.infer<typeof TopicsResponseSchema>

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: nonEmptyStringSchema,
    message: nonEmptyStringSchema,
    details: z.unknown().optional(),
  }),
})

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>
