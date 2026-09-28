import {
  ProgressAnalyticsQuerySchema,
  ProgressAnalyticsResponseSchema,
} from '@algomemtor/shared-contracts'

import {
  featureNotEnabled,
  httpError,
  mapErrors,
  rethrowProviderError,
} from '@/server/http/errors'
import { json, queryRecord, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, async ({ app, subject, query }) => {
  if (!app.progressEnabled) throw featureNotEnabled()
  const input = ProgressAnalyticsQuerySchema.safeParse(queryRecord(query))
  if (!input.success) {
    throw httpError(
      400,
      'INVALID_PROGRESS_ANALYTICS_QUERY',
      'The progress analytics range is invalid.',
      { details: input.error.issues },
    )
  }
  return json(
    ProgressAnalyticsResponseSchema.parse(
      await mapErrors(
        () => app.progressService.analytics(subject, input.data.days),
        rethrowProviderError,
      ),
    ),
  )
})
