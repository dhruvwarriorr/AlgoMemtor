import { SetProblemStatusRequestSchema } from '@algomemtor/shared-contracts'

import { featureNotEnabled, httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { problemReference } from '@/server/http/schemas'

export const PUT = route<{ provider: string; externalId: string }>(
  { auth: 'user' },
  async ({ app, subject, params, body }) => {
    if (!app.progressEnabled) throw featureNotEnabled()
    const reference = problemReference(params)
    const input = SetProblemStatusRequestSchema.safeParse(body)
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_PROBLEM_STATUS',
        'The learner problem status is invalid.',
        { details: input.error.issues },
      )
    }
    if (input.data.recommendationItemId !== undefined) {
      const item = await app.recommendationRepository.findItemByAuthUserId(
        subject,
        input.data.recommendationItemId,
      )
      if (
        item === null ||
        item.provider !== reference.provider ||
        item.externalId !== reference.externalId
      ) {
        throw httpError(
          404,
          'RECOMMENDATION_ITEM_NOT_FOUND',
          'The recommendation item could not be found for this learner.',
        )
      }
    }
    await app.progressService.setStatus(subject, reference, input.data)
    return json(await app.progressService.getProgress(subject, reference))
  },
)
