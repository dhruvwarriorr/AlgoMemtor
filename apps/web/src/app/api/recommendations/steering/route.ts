import {
  RecommendationSteeringListResponseSchema,
  RecommendationSteeringResponseSchema,
  SaveRecommendationSteeringRequestSchema,
} from '@algomemtor/shared-contracts'

import { steeringView } from '@/server/context'
import {
  httpError,
  mapErrors,
  rethrowProviderError,
} from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { COACH_POLICY_VERSION } from '@/server/services/coach-service'

export const GET = route({ auth: 'user' }, async ({ app, subject }) => {
  const records = await app.recommendationService.listSteering(subject)
  return json(
    RecommendationSteeringListResponseSchema.parse({
      data: records.map(steeringView),
    }),
  )
})

// A learner's plain-language instruction for their recommendations. It is
// parsed into enforced filters, remembered by the coach (with consent), and
// the feed is regenerated under it straight away.
export const POST = route(
  { auth: 'user' },
  async ({ app, subject, body, requestId, request }) => {
    const input = SaveRecommendationSteeringRequestSchema.safeParse(body)
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_RECOMMENDATION_INSTRUCTION',
        'Describe what you want in 1 to 500 characters.',
        { details: input.error.issues },
      )
    }
    const text = input.data.text.replace(/\s+/g, ' ').trim()
    return mapErrors(async () => {
      const { record, feed } = await app.recommendationService.addSteering(
        subject,
        text,
        requestId,
        request.signal,
      )
      let saved = record
      const consent = await app.progressRepository.getConsent(subject)
      const client = app.aiMemoryClient
      if (
        consent?.enabled === true &&
        consent.policyVersion === COACH_POLICY_VERSION &&
        client.proposeMemory !== undefined
      ) {
        try {
          const proposed = await client.proposeMemory(
            subject,
            `recommendation-steering:${record.id}`,
            {
              statement:
                `Recommendation instruction from the learner: ${text}`.slice(
                  0,
                  500,
                ),
              category: 'user_instruction',
            },
          )
          if (proposed.memory !== undefined) {
            await app.aiMemoryClient.actOnMemory(
              subject,
              proposed.memory.id,
              'approve',
            )
            await app.recommendationService.recordSteeringMemory(
              subject,
              record.id,
              proposed.memory.id,
            )
            saved = { ...record, memoryId: proposed.memory.id }
          }
        } catch {
          // The instruction already steers recommendations; memory is an
          // enhancement and reports its absence through savedToMemory.
          app.logger.warn('recommendation_steering_memory_failed', {
            errorCode: 'AI_MEMORY_UNAVAILABLE',
          })
        }
      }
      return json(
        RecommendationSteeringResponseSchema.parse({
          data: {
            steering: steeringView(saved),
            feed: await app.decorateRecommendationFeed(subject, feed),
          },
        }),
      )
    }, rethrowProviderError)
  },
)
