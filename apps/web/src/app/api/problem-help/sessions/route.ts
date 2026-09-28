import {
  ProblemHelpSessionResponseSchema,
  ProblemHelpSessionsResponseSchema,
  StartProblemHelpRequestSchema,
} from '@algomemtor/shared-contracts'

import { invalidMentorInput, mentor } from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, async ({ app, subject }) =>
  json(
    ProblemHelpSessionsResponseSchema.parse({
      data: await mentor(() => app.mentorService.listHelpSessions(subject)),
    }),
  ),
)

export const POST = route(
  { auth: 'user', aiUsage: 'mentor' },
  async ({ app, subject, body }) => {
    const input = StartProblemHelpRequestSchema.safeParse(body)
    if (!input.success) {
      throw invalidMentorInput(
        input.error.issues[0]?.message ?? 'The help request is invalid.',
        input.error.issues,
      )
    }
    return json(
      ProblemHelpSessionResponseSchema.parse(
        await mentor(() =>
          app.mentorService.startHelpSession(subject, input.data),
        ),
      ),
      201,
    )
  },
)
