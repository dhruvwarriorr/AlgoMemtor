import { mapErrors, rethrowProviderError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, async ({ app, requestId }) =>
  json(
    await mapErrors(
      () => app.catalogService.getTopics(requestId),
      rethrowProviderError,
    ),
  ),
)
