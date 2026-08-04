import { z } from 'zod'

const nonEmptyStringSchema = z.string().trim().min(1)

export const DifficultySchema = z.enum(['easy', 'medium', 'hard'])

export type Difficulty = z.infer<typeof DifficultySchema>

export const ProblemStatusSchema = z.enum([
  'not_started',
  'attempted',
  'solved',
])

export type ProblemStatus = z.infer<typeof ProblemStatusSchema>

export const ProblemExampleSchema = z.object({
  input: nonEmptyStringSchema,
  output: nonEmptyStringSchema,
  explanation: nonEmptyStringSchema.optional(),
})

export type ProblemExample = z.infer<typeof ProblemExampleSchema>

export const ProblemSummarySchema = z.object({
  id: nonEmptyStringSchema,
  slug: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  difficulty: DifficultySchema,
  topics: z.array(nonEmptyStringSchema),
  status: ProblemStatusSchema,
  acceptanceRate: z.number().min(0).max(100).optional(),
})

export type ProblemSummary = z.infer<typeof ProblemSummarySchema>

export const ProblemDetailSchema = ProblemSummarySchema.extend({
  statement: nonEmptyStringSchema,
  constraints: z.array(nonEmptyStringSchema),
  examples: z.array(ProblemExampleSchema),
})

export type ProblemDetail = z.infer<typeof ProblemDetailSchema>

export const TopicSchema = z.object({
  id: nonEmptyStringSchema,
  slug: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
})

export type Topic = z.infer<typeof TopicSchema>

export const ProblemCatalogQueryParamsSchema = z.object({
  search: nonEmptyStringSchema.optional(),
  difficulty: DifficultySchema.optional(),
  topic: nonEmptyStringSchema.optional(),
  status: ProblemStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(10),
})

export type ProblemCatalogQueryParams = z.infer<
  typeof ProblemCatalogQueryParamsSchema
>

export const PaginationMetadataSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})

export type PaginationMetadata = z.infer<typeof PaginationMetadataSchema>

export const ProblemCatalogResponseSchema = z.object({
  data: z.array(ProblemSummarySchema),
  meta: PaginationMetadataSchema,
})

export type ProblemCatalogResponse = z.infer<
  typeof ProblemCatalogResponseSchema
>

export const SingleProblemResponseSchema = z.object({
  data: ProblemDetailSchema,
})

export type SingleProblemResponse = z.infer<typeof SingleProblemResponseSchema>

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
