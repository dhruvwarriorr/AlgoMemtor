import {
  ImprovementRoadmapResponseSchema,
  SetCoachTopicStatusRequestSchema,
} from '@algomemtor/shared-contracts'

import { httpError, mapErrors, rethrowCoachError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const PATCH = route<{ topic: string }>(
  { auth: 'user' },
  async ({ app, subject, params, body }) => {
    const input = SetCoachTopicStatusRequestSchema.safeParse(body ?? {})
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_COACH_TOPIC_STATUS',
        'The roadmap topic status is invalid.',
        { details: input.error.issues },
      )
    }
    return json(
      ImprovementRoadmapResponseSchema.parse({
        data: await mapErrors(
          () =>
            app.coachService.setTopicStatus(
              subject,
              params.topic,
              input.data.status,
            ),
          rethrowCoachError,
        ),
      }),
    )
  },
)
