import { z } from 'zod'

const identifierSchema = z.uuid()

export const LearnerMemoryCategorySchema = z.enum([
  'preference',
  'difficulty_calibration',
  'topic_weakness',
  'scheduling_preference',
  'recommendation_feedback_pattern',
  'learning_goal',
  'topic_strength',
  'coding_style',
  'problem_solving_approach',
  'learning_pace',
  'time_availability',
  'mistake_pattern',
  'contest_performance',
  'explanation_preference',
  'communication_preference',
  'user_instruction',
  'conversation_summary',
  'learning_milestone',
  'bloom_level',
  'spaced_repetition_state',
])
export type LearnerMemoryCategory = z.infer<typeof LearnerMemoryCategorySchema>

export const LearnerMemoryStatusSchema = z.enum([
  'proposed',
  'active',
  'archived',
])
export type LearnerMemoryStatus = z.infer<typeof LearnerMemoryStatusSchema>

export const LearnerMemorySchema = z
  .object({
    id: identifierSchema,
    category: LearnerMemoryCategorySchema,
    text: z.string().trim().min(1).max(500),
    confidence: z.number().min(0).max(1),
    status: LearnerMemoryStatusSchema,
    version: z.number().int().positive(),
    supersedesMemoryId: identifierSchema.optional(),
    learnerCorrected: z.boolean(),
    evidenceCount: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()

export type LearnerMemory = z.infer<typeof LearnerMemorySchema>

export const LearnerMemoriesResponseSchema = z
  .object({
    data: z.array(LearnerMemorySchema),
    meta: z.object({ pendingJobs: z.number().int().nonnegative() }).strict(),
  })
  .strict()
export type LearnerMemoriesResponse = z.infer<
  typeof LearnerMemoriesResponseSchema
>

export const CorrectLearnerMemoryRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    category: LearnerMemoryCategorySchema,
  })
  .strict()
export type CorrectLearnerMemoryRequest = z.infer<
  typeof CorrectLearnerMemoryRequestSchema
>

export const LearnerMemoryActionSchema = z.enum([
  'approve',
  'archive',
  'restore',
  'delete',
])
export type LearnerMemoryAction = z.infer<typeof LearnerMemoryActionSchema>
