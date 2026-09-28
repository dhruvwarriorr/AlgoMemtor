import { ExternalProblemCatalogQueryParamsSchema } from '@algomemtor/shared-contracts'

import { latestLearnerStatuses } from '@/server/context'
import { ProviderError } from '@/server/errors/provider-error'
import { httpError, providerHttpError } from '@/server/http/errors'
import { json, queryRecord, route } from '@/server/http/route'

export const GET = route(
  { auth: 'user' },
  async ({ app, subject, query, requestId }) => {
    const queryResult = ExternalProblemCatalogQueryParamsSchema.safeParse(
      queryRecord(query),
    )
    if (!queryResult.success) {
      throw httpError(
        400,
        'INVALID_QUERY_PARAMETERS',
        'The external problem catalog query parameters are invalid.',
        { details: queryResult.error.issues },
      )
    }

    try {
      const learnerStatuses =
        queryResult.data.status === undefined
          ? undefined
          : latestLearnerStatuses(
              await app.problemActionRepository.listByAuthUserId(subject),
            )
      const catalog = await app.catalogService.getProblems(
        queryResult.data,
        requestId,
        learnerStatuses,
      )
      return json({
        ...catalog,
        data: app.progressEnabled
          ? await app.decorateProblemsForLearner(subject, catalog.data)
          : catalog.data,
      })
    } catch (error) {
      if (error instanceof ProviderError) {
        app.logger.warn('catalog_provider_error', {
          service: 'core-api',
          route: '/api/problems',
          provider: error.provider,
          errorCode: error.code,
          retryable: error.retryable,
          requestId,
        })
        throw providerHttpError(error)
      }
      throw error
    }
  },
)
