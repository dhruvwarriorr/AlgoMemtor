import {
  JobPumpRequestSchema,
  JobPumpResponseSchema,
} from '@algomemtor/shared-contracts'

import { httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

// The signed-in site calls this while it is visible. It wakes a bounded drain
// of this learner's queued syncs and memory jobs, which runs after the
// response is sent, and says when to check back.
export const POST = route({ auth: 'user' }, async ({ app, subject, body }) => {
  const input = JobPumpRequestSchema.safeParse(body ?? {})
  if (!input.success) {
    throw httpError(400, 'INVALID_JOB_PUMP_REQUEST', 'The request is invalid.')
  }
  const now = Date.now()
  if (now - (app.lastPumpAt.get(subject) ?? 0) >= 1_000) {
    app.lastPumpAt.set(subject, now)
    if (app.lastPumpAt.size > 10_000) app.lastPumpAt.clear()
    if (input.data.visit === true) {
      try {
        await app.providerSyncService.requestActiveSessionSync(
          subject,
          app.activeSessionSyncStaleMs,
        )
      } catch (error) {
        app.logger.warn('active_session_sync_enqueue_failed', {
          errorCode:
            error instanceof Error &&
            'code' in error &&
            typeof error.code === 'string'
              ? error.code
              : 'PROVIDER_SYNC_ENQUEUE_FAILED',
        })
      }
    }
    app.wakeJobs(subject)
  }
  const { pending } = await app.jobPump.status(subject)
  return json(
    JobPumpResponseSchema.parse({
      data: {
        pending,
        // While work is pending the page checks back soon; otherwise a slow
        // heartbeat resumes continuations queued for later.
        nextPollAfterMs: pending ? 4_000 : 120_000,
      },
    }),
  )
})
