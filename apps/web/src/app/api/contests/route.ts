import { ExternalContestsQuerySchema } from '@algomemtor/shared-contracts'

import {
  httpError,
  mapErrors,
  rethrowProviderError,
} from '@/server/http/errors'
import { json, queryRecord, route } from '@/server/http/route'

export const GET = route(
  { auth: 'user' },
  async ({ app, query, requestId }) => {
    const input = ExternalContestsQuerySchema.safeParse(queryRecord(query))
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_CONTEST_QUERY',
        'The contest query parameters are invalid.',
        { details: input.error.issues },
      )
    }
    return json(
      await mapErrors(
        () => app.contestCatalogService.getContests(input.data, requestId),
        rethrowProviderError,
      ),
    )
  },
)
