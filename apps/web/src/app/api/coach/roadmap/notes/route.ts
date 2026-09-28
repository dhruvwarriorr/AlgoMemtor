import {
  CoachRoadmapNoteRequestSchema,
  CoachRoadmapNoteResponseSchema,
} from '@algomemtor/shared-contracts'

import { httpError, mapErrors, rethrowCoachError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const POST = route(
  { auth: 'user', aiUsage: 'coach' },
  async ({ app, subject, body }) => {
    const input = CoachRoadmapNoteRequestSchema.safeParse(body ?? {})
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_COACH_ROADMAP_NOTE',
        'The roadmap note is invalid.',
        { details: input.error.issues },
      )
    }
    return json(
      CoachRoadmapNoteResponseSchema.parse({
        data: await mapErrors(
          () => app.coachService.submitRoadmapNote(subject, input.data.note),
          rethrowCoachError,
        ),
      }),
    )
  },
)
