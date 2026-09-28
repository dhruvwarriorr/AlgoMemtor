import {
  DeleteAllDataRequestSchema,
  DeleteAllDataResponseSchema,
} from '@algomemtor/shared-contracts'

import { featureNotEnabled, httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const DELETE = route(
  { auth: 'user', allowDuringDeletion: true },
  async ({ app, subject, body }) => {
    if (!app.progressEnabled) throw featureNotEnabled()
    const input = DeleteAllDataRequestSchema.safeParse(body)
    if (!input.success) {
      throw httpError(
        400,
        'DELETE_CONFIRMATION_REQUIRED',
        'Type DELETE to confirm removal of AlgoMemtor data.',
        { details: input.error.issues },
      )
    }
    const job = await app.progressService.requestDeleteAll(subject)
    // Deletion starts at once; privacy jobs are also drained by every other
    // learner's activity, so it never waits for this learner.
    app.wakeJobs(subject)
    return json(
      DeleteAllDataResponseSchema.parse({
        data: { status: 'pending', jobId: job.id },
      }),
      202,
    )
  },
)
