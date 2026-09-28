import { ImprovementRoadmapResponseSchema } from '@algomemtor/shared-contracts'

import { mapErrors, rethrowCoachError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, async ({ app, subject }) =>
  json(
    ImprovementRoadmapResponseSchema.parse({
      data: await mapErrors(
        () => app.coachService.getRoadmap(subject),
        rethrowCoachError,
      ),
    }),
  ),
)
