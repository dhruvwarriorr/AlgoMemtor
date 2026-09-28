import { mapErrors, rethrowProviderError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, async ({ app, subject }) =>
  json(
    await mapErrors(
      () => app.recommendationService.listDismissals(subject),
      rethrowProviderError,
    ),
  ),
)
