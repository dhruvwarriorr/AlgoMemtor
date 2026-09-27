import { z } from 'zod'

// The signed-in website wakes queued server work (provider syncs, learner
// memory) while it is visible; there are no always-on workers. The response
// says only whether this learner still has work pending, never job details.

export const JobPumpRequestSchema = z
  .object({
    // The first wake of a visit also refreshes linked accounts whose last
    // sync is older than the server's freshness window.
    visit: z.boolean().optional(),
  })
  .strict()
export type JobPumpRequest = z.infer<typeof JobPumpRequestSchema>

export const JobPumpResponseSchema = z
  .object({
    data: z
      .object({
        // Work for this learner is running or due now.
        pending: z.boolean(),
        // When the page should wake the pump again.
        nextPollAfterMs: z.number().int().min(1_000).max(600_000),
      })
      .strict(),
  })
  .strict()
export type JobPumpResponse = z.infer<typeof JobPumpResponseSchema>
