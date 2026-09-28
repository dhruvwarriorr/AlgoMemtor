import { z } from 'zod'

export const LeetCodeTopicSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
  })
  .passthrough()

export const LeetCodeQuestionSchema = z
  .object({
    questionId: z.union([z.string(), z.number()]),
    title: z.string().trim().min(1),
    titleSlug: z.string().trim().min(1),
    difficulty: z.string().trim().min(1),
    isPaidOnly: z.boolean(),
    acRate: z.number().finite().nonnegative().optional(),
    topicTags: z.array(z.unknown()).optional(),
  })
  .passthrough()

export const LeetCodeQuestionListEnvelopeSchema = z
  .object({
    data: z
      .object({
        questionList: z.object({
          totalNum: z.number().int().nonnegative(),
          data: z.array(z.unknown()),
        }),
      })
      .passthrough(),
  })
  .passthrough()

export type LeetCodeQuestion = z.infer<typeof LeetCodeQuestionSchema>

export const LeetCodeQuestionContentSchema = z
  .object({
    questionId: z.union([z.string(), z.number()]),
    title: z.string().trim().min(1),
    content: z.string().nullable().optional(),
    isPaidOnly: z.boolean(),
    hints: z.array(z.string()).nullable().optional(),
  })
  .passthrough()

export const LeetCodeQuestionContentEnvelopeSchema = z
  .object({
    data: z
      .object({ question: LeetCodeQuestionContentSchema.nullable() })
      .passthrough()
      .optional(),
    errors: z.array(z.object({ message: z.string().max(1000) })).optional(),
  })
  .passthrough()
