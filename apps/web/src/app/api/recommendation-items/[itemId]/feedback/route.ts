import { RecommendationFeedbackInputSchema } from '@algomemtor/shared-contracts'

import {
  httpError,
  mapErrors,
  rethrowProviderError,
} from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { recommendationItemIdSchema } from '@/server/http/schemas'
import { RecommendationOwnershipError } from '@/server/repositories/recommendation-repository'
import { RecommendationNotFoundError } from '@/server/services/recommendation-service'

export const PATCH = route<{ itemId: string }>(
  { auth: 'user' },
  async ({ app, subject, params, body }) => {
    const input = RecommendationFeedbackInputSchema.safeParse(body)
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_RECOMMENDATION_FEEDBACK',
        'The recommendation feedback is invalid.',
        { details: input.error.issues },
      )
    }
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
        () =>
          app.recommendationService.saveFeedback(subject, itemId, input.data),
        rethrowProviderError,
        (error) => {
          if (error instanceof RecommendationOwnershipError) {
            throw httpError(
              404,
              'RECOMMENDATION_ITEM_NOT_FOUND',
              'The recommendation item could not be found for this learner.',
            )
          }
          if (error instanceof RecommendationNotFoundError) {
            throw httpError(404, 'RECOMMENDATION_ITEM_NOT_FOUND', error.message)
          }
        },
      ),
    )
  },
)
