import { z } from 'zod'

const nonEmptyStringSchema = z.string().trim().min(1)

const contestIdSchema = z.number().int().positive()

export const CodeforcesProblemSchema = z.object({
  contestId: contestIdSchema.optional(),
  problemsetName: nonEmptyStringSchema.optional(),
  index: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  type: z.enum(['PROGRAMMING', 'QUESTION']),
  points: z.number().finite().nonnegative().optional(),
  rating: z.number().int().nonnegative().optional(),
  tags: z.array(nonEmptyStringSchema),
})

export type CodeforcesProblem = z.infer<typeof CodeforcesProblemSchema>

export const CodeforcesProblemStatisticsSchema = z.object({
  contestId: contestIdSchema.optional(),
  index: nonEmptyStringSchema,
  solvedCount: z.number().int().nonnegative(),
})

export type CodeforcesProblemStatistics = z.infer<
  typeof CodeforcesProblemStatisticsSchema
>

export const CodeforcesProblemsetResultSchema = z.object({
  problems: z.array(CodeforcesProblemSchema),
  problemStatistics: z.array(CodeforcesProblemStatisticsSchema),
})

export type CodeforcesProblemsetResult = z.infer<
  typeof CodeforcesProblemsetResultSchema
>

export const CodeforcesProblemsetEnvelopeSchema = z.discriminatedUnion(
  'status',
  [
    z.object({
      status: z.literal('OK'),
      result: z.object({
        problems: z.array(z.unknown()),
        problemStatistics: z.array(z.unknown()),
      }),
    }),
    z.object({
      status: z.literal('FAILED'),
      comment: nonEmptyStringSchema,
    }),
  ],
)

export type CodeforcesProblemsetEnvelope = z.infer<
  typeof CodeforcesProblemsetEnvelopeSchema
>

export const CodeforcesProblemsetResponseSchema = z.discriminatedUnion(
  'status',
  [
    z.object({
      status: z.literal('OK'),
      result: CodeforcesProblemsetResultSchema,
    }),
    z.object({
      status: z.literal('FAILED'),
      comment: nonEmptyStringSchema,
    }),
  ],
)

export type CodeforcesProblemsetResponse = z.infer<
  typeof CodeforcesProblemsetResponseSchema
>
