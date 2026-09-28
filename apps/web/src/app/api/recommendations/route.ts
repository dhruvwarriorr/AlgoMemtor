import { mapErrors, rethrowProviderError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const GET = route(
  { auth: 'user' },
  async ({ app, subject, requestId, request }) =>
    json(
      await mapErrors(
        () =>
          app.recommendationFeedForLearner(
            subject,
            false,
            requestId,
            request.signal,
          ),
        rethrowProviderError,
      ),
    ),
)
