import { z } from 'zod'

export const CodeChefContestRecordSchema = z
  .object({
    contest_id: z.union([z.string(), z.number()]),
    contest_code: z.string().trim().min(1).max(128),
    contest_name: z.string().trim().min(1).max(512),
    contest_start_date_iso: z.string().trim().min(1).max(64).optional(),
    contest_end_date_iso: z.string().trim().min(1).max(64).optional(),
    contest_duration: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough()

export const CodeChefContestsEnvelopeSchema = z
  .object({
    status: z.string().optional(),
    message: z.string().optional(),
    present_contests: z.array(z.unknown()).default([]),
    future_contests: z.array(z.unknown()).default([]),
    past_contests: z.array(z.unknown()).default([]),
    practice_contests: z.array(z.unknown()).default([]),
    skill_tests: z.array(z.unknown()).default([]),
  })
  .passthrough()

export type CodeChefContestRecord = z.infer<typeof CodeChefContestRecordSchema>
