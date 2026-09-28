import {
  ExploreSolutionsRequestSchema,
  SolutionExplorationResponseSchema,
} from '@algomemtor/shared-contracts'

import { invalidMentorInput, mentor } from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

export const POST = route(
  { auth: 'user', aiUsage: 'mentor' },
  async ({ app, subject, body }) => {
    const input = ExploreSolutionsRequestSchema.safeParse(body)
    if (!input.success) {
      throw invalidMentorInput(
        input.error.issues[0]?.message ?? 'The request is invalid.',
        input.error.issues,
      )
    }
    return json(
      SolutionExplorationResponseSchema.parse(
        await mentor(() =>
          app.mentorService.exploreSolutions(subject, input.data),
        ),
      ),
    )
  },
)
