import { z } from 'zod'

const contestId = z.number().int().positive()

export const CodeforcesContestRecordSchema = z
  .object({
    id: contestId,
    name: z.string().trim().min(1).max(512),
    type: z.string().trim().min(1).max(32),
    phase: z.string().trim().min(1).max(32),
    durationSeconds: z.number().int().positive().optional(),
    startTimeSeconds: z.number().int().nonnegative().optional(),
  })
  .passthrough()

export const CodeforcesContestEnvelopeSchema = z.union([
  z.object({ status: z.literal('OK'), result: z.array(z.unknown()) }),
  z.object({ status: z.literal('FAILED'), comment: z.string().max(1000) }),
])

export type CodeforcesContestRecord = z.infer<
  typeof CodeforcesContestRecordSchema
>
