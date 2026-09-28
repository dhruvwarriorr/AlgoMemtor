import {
  SolutionChatRequestSchema,
  SolutionChatResponseSchema,
} from '@algomemtor/shared-contracts'

import { invalidMentorInput, mentor } from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

export const POST = route(
  { auth: 'user', aiUsage: 'mentor' },
  async ({ app, subject, body }) => {
    const input = SolutionChatRequestSchema.safeParse(body)
    if (!input.success) {
      throw invalidMentorInput(
        input.error.issues[0]?.message ?? 'The request is invalid.',
        input.error.issues,
      )
    }
    return json(
      SolutionChatResponseSchema.parse({
        data: await mentor(() =>
          app.mentorService.solutionChat(subject, input.data),
        ),
      }),
    )
  },
)
