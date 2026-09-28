import {
  httpError,
  mapErrors,
  rethrowProviderError,
} from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { recommendationItemIdSchema } from '@/server/http/schemas'
import { RecommendationNotFoundError } from '@/server/services/recommendation-service'

export const POST = route<{ itemId: string }>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const itemId = params.itemId
    if (!recommendationItemIdSchema.safeParse(itemId).success) {
      throw httpError(
        400,
        'INVALID_RECOMMENDATION_ITEM',
        'The recommendation item ID is invalid.',
      )
    }
    return json(
      await mapErrors(
        () => app.recommendationService.dismiss(subject, itemId),
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
