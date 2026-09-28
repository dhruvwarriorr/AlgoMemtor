import { featureNotEnabled, httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { recommendationItemIdSchema } from '@/server/http/schemas'

export const POST = route<{ itemId: string }>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    if (!app.progressEnabled) throw featureNotEnabled()
    const itemId = params.itemId
    if (!recommendationItemIdSchema.safeParse(itemId).success) {
      throw httpError(
        400,
        'INVALID_RECOMMENDATION_ITEM',
        'The recommendation item ID is invalid.',
      )
    }
    const item = await app.recommendationRepository.findItemByAuthUserId(
      subject,
      itemId,
    )
    if (item === null) {
      throw httpError(
        404,
        'RECOMMENDATION_ITEM_NOT_FOUND',
        'The recommendation item could not be found for this learner.',
      )
    }
    const action = await app.progressService.recordAction(
      subject,
      { provider: item.provider, externalId: item.externalId },
      'impression',
      { recommendationItemId: item.id, sourceContext: 'recommendation' },
    )
    return json({ data: { recorded: true, actionId: action.id } }, 201)
  },
)
