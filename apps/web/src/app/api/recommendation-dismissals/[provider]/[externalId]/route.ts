import {
  ProviderKeySchema,
  RecommendationRestorationResponseSchema,
} from '@algomemtor/shared-contracts'

import {
  httpError,
  mapErrors,
  rethrowProviderError,
} from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { recommendationExternalIdSchema } from '@/server/http/schemas'
import { RecommendationNotFoundError } from '@/server/services/recommendation-service'

type Params = { provider: string; externalId: string }

export const POST = route<Params>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const provider = ProviderKeySchema.safeParse(params.provider)
    const externalId = params.externalId
    if (
      !provider.success ||
      !recommendationExternalIdSchema.safeParse(externalId).success
    ) {
      throw httpError(
        400,
        'INVALID_RECOMMENDATION_ITEM',
        'The problem identity is invalid.',
      )
    }
    return json(
      await mapErrors(
        () =>
          app.recommendationService.dismissProblem(
            subject,
            provider.data,
            externalId,
          ),
        rethrowProviderError,
        (error) => {
          if (error instanceof RecommendationNotFoundError) {
            throw httpError(404, 'RECOMMENDATION_ITEM_NOT_FOUND', error.message)
          }
        },
      ),
    )
  },
)

export const DELETE = route<Params>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const provider = ProviderKeySchema.safeParse(params.provider)
    if (!provider.success) {
      throw httpError(
        400,
        'UNSUPPORTED_RECOMMENDATION_PROVIDER',
        'That provider cannot be restored from recommendations.',
      )
    }
    const externalId = params.externalId
    if (!recommendationExternalIdSchema.safeParse(externalId).success) {
      throw httpError(
        400,
        'INVALID_RECOMMENDATION_ITEM',
        'The recommendation problem ID is invalid.',
      )
    }
    return json(
      RecommendationRestorationResponseSchema.parse({
        data: await mapErrors(
          () =>
            app.recommendationService.restore(
              subject,
              provider.data,
              externalId,
            ),
          rethrowProviderError,
          (error) => {
            if (error instanceof RecommendationNotFoundError) {
              throw httpError(
                404,
                'RECOMMENDATION_DISMISSAL_NOT_FOUND',
                error.message,
              )
            }
          },
        ),
      }),
    )
  },
)
