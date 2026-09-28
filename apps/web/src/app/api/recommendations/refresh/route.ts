import { mapErrors, rethrowProviderError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const POST = route(
  { auth: 'user', aiUsage: 'recommendations' },
  async ({ app, subject, requestId, request }) =>
    json(
      await mapErrors(
        () =>
          app.recommendationFeedForLearner(
            subject,
            true,
            requestId,
            request.signal,
          ),
        rethrowProviderError,
      ),
    ),
)
