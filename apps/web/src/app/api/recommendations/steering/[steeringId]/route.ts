import { RecommendationSteeringListResponseSchema } from '@algomemtor/shared-contracts'

import { steeringView } from '@/server/context'
import { httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const DELETE = route<{ steeringId: string }>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const removed = await app.recommendationService.removeSteering(
      subject,
      params.steeringId,
    )
    if (removed === null) {
      throw httpError(
        404,
        'RECOMMENDATION_INSTRUCTION_NOT_FOUND',
        'That recommendation instruction was not found.',
      )
    }
    if (removed.memoryId !== undefined) {
      try {
        await app.aiMemoryClient.actOnMemory(
          subject,
          removed.memoryId,
          'archive',
        )
      } catch {
        app.logger.warn('recommendation_steering_memory_archive_failed', {
          errorCode: 'AI_MEMORY_UNAVAILABLE',
        })
      }
    }
    const records = await app.recommendationService.listSteering(subject)
    return json(
      RecommendationSteeringListResponseSchema.parse({
        data: records.map(steeringView),
      }),
    )
  },
)
