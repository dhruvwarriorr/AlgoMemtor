import {
  ProgressHistoryQuerySchema,
  ProgressHistoryResponseSchema,
} from '@algomemtor/shared-contracts'

import { featureNotEnabled, httpError } from '@/server/http/errors'
import { json, queryRecord, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, async ({ app, subject, query }) => {
  if (!app.progressEnabled) throw featureNotEnabled()
  const input = ProgressHistoryQuerySchema.safeParse(queryRecord(query))
  if (!input.success) {
    throw httpError(
      400,
      'INVALID_PROGRESS_QUERY',
      'The progress history query is invalid.',
      { details: input.error.issues },
    )
  }
  return json(
    ProgressHistoryResponseSchema.parse(
      await app.progressService.history(subject, input.data),
    ),
  )
})
