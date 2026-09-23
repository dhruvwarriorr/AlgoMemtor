import { z } from 'zod'

import { ProviderKeySchema } from './problem-catalog.js'

// A deterministic summary of everything synced from a learner's platforms.
// It is recomputed after each sync and is what the coach reads first, so it
// holds aggregates and short lists, never raw provider payloads.

export const LEARNER_ACTIVITY_DIGEST_VERSION = 'learner-activity-v1'

const count = z.number().int().nonnegative()
const percent = z.number().min(0).max(100)
const topic = z.string().trim().min(1).max(64)
const isoDate = z.iso.datetime({ offset: true })

export const VerdictGroupSchema = z.enum([
  'accepted',
  'wrong_answer',
  'time_limit',
  'memory_limit',
  'runtime_error',
  'compile_error',
  'other',
])
export type VerdictGroup = z.infer<typeof VerdictGroupSchema>

const ProblemRefSchema = z
  .object({
    provider: ProviderKeySchema,
    externalId: z.string().trim().min(1).max(128),
    title: z.string().trim().min(1).max(512).optional(),
    rating: z.number().int().positive().optional(),
    topics: z.array(topic).max(12),
  })
  .strict()

export const LearnerActivityDigestSchema = z
  .object({
    version: z.literal(LEARNER_ACTIVITY_DIGEST_VERSION),
    computedAt: isoDate,
    totals: z
      .object({
        solved: count,
        attemptedUnsolved: count,
        submissions: count,
        acceptedSubmissions: count,
        acceptanceRate: percent.optional(),
        // Solved problems whose first observed submission was accepted.
        firstTryRate: percent.optional(),
        submissionsPerSolve: z.number().nonnegative().optional(),
      })
      .strict(),
    providers: z
      .array(
        z
          .object({
            provider: ProviderKeySchema,
            handle: z.string().trim().min(1).max(64),
            verified: z.boolean(),
            // Whether the stored history is the account's whole history.
            historyComplete: z.boolean(),
            viaConnector: z.boolean(),
            platformSolvedCount: count.optional(),
            solved: count,
            attemptedUnsolved: count,
            submissions: count,
            rating: z.number().optional(),
            maxRating: z.number().optional(),
            lastActivityAt: isoDate.optional(),
          })
          .strict(),
      )
      .max(4),
    verdicts: z.partialRecord(VerdictGroupSchema, count),
    failurePatterns: z
      .array(
        z
          .object({
            verdict: VerdictGroupSchema,
            count,
            shareOfFailures: percent,
            // Topics where this failure happens most often.
            topics: z.array(topic).max(5),
          })
          .strict(),
      )
      .max(6),
    topics: z
      .object({
        strengths: z
          .array(
            z
              .object({
                topic,
                solved: count,
                firstTryRate: percent.optional(),
              })
              .strict(),
          )
          .max(8),
        weaknesses: z
          .array(
            z
              .object({
                topic,
                solved: count,
                attemptedUnsolved: count,
                failedSubmissions: count,
                failureRate: percent,
              })
              .strict(),
          )
          .max(8),
      })
      .strict(),
    difficulty: z
      .array(
        z
          .object({
            provider: ProviderKeySchema,
            medianSolvedRating: z.number().int().positive().optional(),
            recentMedianSolvedRating: z.number().int().positive().optional(),
            maxSolvedRating: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .max(4),
    activity: z
      .object({
        solvedLast7Days: count,
        solvedLast30Days: count,
        solvedLast90Days: count,
        submissionsLast30Days: count,
        activeDaysLast30: count,
        currentStreakDays: count,
        lastActiveAt: isoDate.optional(),
        busiestHourUtc: z.number().int().min(0).max(23).optional(),
      })
      .strict(),
    contests: z
      .object({
        total: count,
        recent: z
          .array(
            z
              .object({
                provider: ProviderKeySchema,
                name: z.string().trim().min(1).max(512).optional(),
                rank: z.number().int().positive().optional(),
                delta: z.number().optional(),
                at: isoDate.optional(),
              })
              .strict(),
          )
          .max(5),
      })
      .strict(),
    languages: z.record(z.string().trim().min(1).max(64), count),
    recentSolves: z
      .array(ProblemRefSchema.extend({ solvedAt: isoDate.optional() }).strict())
      .max(10),
    openAttempts: z
      .array(
        ProblemRefSchema.extend({
          failedSubmissions: count,
          lastVerdict: VerdictGroupSchema,
          lastAttemptAt: isoDate.optional(),
        }).strict(),
      )
      .max(10),
  })
  .strict()
export type LearnerActivityDigest = z.infer<typeof LearnerActivityDigestSchema>

export const LearnerActivityDigestResponseSchema = z
  .object({ data: LearnerActivityDigestSchema.nullable() })
  .strict()
export type LearnerActivityDigestResponse = z.infer<
  typeof LearnerActivityDigestResponseSchema
>
