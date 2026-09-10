import { z } from 'zod'

import {
  ExternalProblemSummarySchema,
  ProviderKeySchema,
  ProviderFreshnessSchema,
  ProviderWarningSchema,
} from './problem-catalog.js'

const identifierSchema = z.uuid()
const nonEmptyStringSchema = z.string().trim().min(1)

export const RecommendationRankingModeSchema = z.literal('deterministic')
export type RecommendationRankingMode = z.infer<
  typeof RecommendationRankingModeSchema
>

export const RecommendationUsefulnessSchema = z.enum(['useful', 'not_useful'])
export type RecommendationUsefulness = z.infer<
  typeof RecommendationUsefulnessSchema
>

export const RecommendationDifficultyFeedbackSchema = z.enum([
  'too_easy',
  'about_right',
  'too_hard',
])
export type RecommendationDifficultyFeedback = z.infer<
  typeof RecommendationDifficultyFeedbackSchema
>

export const RecommendationFeedbackSchema = z
  .object({
    id: identifierSchema,
    recommendationItemId: identifierSchema,
    usefulness: RecommendationUsefulnessSchema.optional(),
    perceivedDifficulty: RecommendationDifficultyFeedbackSchema.optional(),
    notes: z.string().trim().min(1).max(1_000).optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()

export type RecommendationFeedback = z.infer<
  typeof RecommendationFeedbackSchema
>

export const RecommendationFeedbackInputSchema = z
  .object({
    usefulness: RecommendationUsefulnessSchema.optional(),
    perceivedDifficulty: RecommendationDifficultyFeedbackSchema.optional(),
    notes: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict()
  .refine(
    ({ perceivedDifficulty, usefulness }) =>
      usefulness !== undefined || perceivedDifficulty !== undefined,
    { message: 'Recommendation feedback requires a feedback dimension.' },
  )

export type RecommendationFeedbackInput = z.infer<
  typeof RecommendationFeedbackInputSchema
>

export const RecommendationItemSchema = z
  .object({
    id: identifierSchema,
    provider: ProviderKeySchema,
    externalId: nonEmptyStringSchema,
    position: z.number().int().positive(),
    score: z.number().finite().nonnegative(),
    reason: nonEmptyStringSchema.max(512),
    problem: ExternalProblemSummarySchema,
    feedback: RecommendationFeedbackSchema.optional(),
  })
  .strict()
  .superRefine(({ problem, provider }, context) => {
    if (problem.provider !== provider) {
      context.addIssue({
        code: 'custom',
        message: 'Recommendation item provider must match its problem.',
        path: ['provider'],
      })
    }
  })

export type RecommendationItem = z.infer<typeof RecommendationItemSchema>

export const RecommendationBatchSchema = z
  .object({
    id: identifierSchema,
    generatedAt: z.iso.datetime(),
    rankingMode: RecommendationRankingModeSchema,
    rankingVersion: nonEmptyStringSchema.max(64),
    items: z.array(RecommendationItemSchema).max(100),
  })
  .strict()

export type RecommendationBatch = z.infer<typeof RecommendationBatchSchema>

export const RecommendationFeedResponseSchema = z
  .object({
    data: RecommendationBatchSchema.nullable(),
    meta: z
      .object({
        partial: z.boolean().default(false),
        stale: z.boolean().default(false),
        warnings: z.array(ProviderWarningSchema).default([]),
        providers: z.array(ProviderFreshnessSchema).default([]),
      })
      .strict(),
  })
  .strict()

export type RecommendationFeedResponse = z.infer<
  typeof RecommendationFeedResponseSchema
>

export const RecommendationDismissalSchema = z
  .object({
    provider: ProviderKeySchema,
    externalId: nonEmptyStringSchema,
    dismissedAt: z.iso.datetime(),
    problem: ExternalProblemSummarySchema.optional(),
  })
  .strict()

export type RecommendationDismissal = z.infer<
  typeof RecommendationDismissalSchema
>

export const RecommendationDismissalsResponseSchema = z
  .object({
    data: z.array(RecommendationDismissalSchema),
  })
  .strict()

export type RecommendationDismissalsResponse = z.infer<
  typeof RecommendationDismissalsResponseSchema
>

export const RecommendationFeedbackResponseSchema = z
  .object({
    data: RecommendationFeedbackSchema,
  })
  .strict()

export type RecommendationFeedbackResponse = z.infer<
  typeof RecommendationFeedbackResponseSchema
>

export const RecommendationDismissalResponseSchema = z
  .object({
    data: RecommendationDismissalSchema,
  })
  .strict()

export type RecommendationDismissalResponse = z.infer<
  typeof RecommendationDismissalResponseSchema
>

export const RecommendationRestorationResponseSchema = z
  .object({
    data: z
      .object({
        provider: ProviderKeySchema,
        externalId: nonEmptyStringSchema,
        restored: z.literal(true),
      })
      .strict(),
  })
  .strict()

export type RecommendationRestorationResponse = z.infer<
  typeof RecommendationRestorationResponseSchema
>
