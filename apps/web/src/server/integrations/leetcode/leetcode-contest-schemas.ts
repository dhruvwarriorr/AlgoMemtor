import { z } from 'zod'

export const LeetCodeContestRecordSchema = z
  .object({
    title: z.string().trim().min(1).max(512),
    titleSlug: z.string().trim().min(1).max(160),
    startTime: z.number().int().nonnegative(),
    duration: z.number().int().positive(),
    containsPremium: z.boolean().optional(),
    isVirtual: z.boolean().optional(),
  })
  .passthrough()

export const LeetCodeContestsEnvelopeSchema = z
  .object({
    data: z.object({ allContests: z.array(z.unknown()) }).passthrough(),
    errors: z.array(z.object({ message: z.string().max(1000) })).optional(),
  })
  .passthrough()
