import { z } from 'zod'

const nullableNumber = z
  .union([z.number().finite(), z.string().trim().min(1)])
  .nullable()
  .optional()

export const CodeChefProblemRecordSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    difficulty_rating: z.union([z.string(), z.number()]).optional(),
    total_submissions: nullableNumber,
    successful_submissions: nullableNumber,
    distinct_successful_submissions: nullableNumber,
    partially_successful_submissions: nullableNumber,
    contest_code: z.string().trim().optional(),
    intended_contest_id: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough()

export type CodeChefProblemRecord = z.infer<typeof CodeChefProblemRecordSchema>

export const CodeChefProblemsEnvelopeSchema = z
  .object({
    status: z.string().optional(),
    message: z.string().optional(),
    data: z.array(z.unknown()),
    count: z
      .union([z.number().int().nonnegative(), z.string().trim().min(1)])
      .optional(),
  })
  .passthrough()

export type CodeChefProblemsEnvelope = z.infer<
  typeof CodeChefProblemsEnvelopeSchema
>
