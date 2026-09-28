import {
  ProblemHelpSessionResponseSchema,
  ProblemHelpTurnRequestSchema,
} from '@algomemtor/shared-contracts'

import { invalidMentorInput, isModelTurn, mentor } from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

export const POST = route<{ sessionId: string }>(
  { auth: 'user', aiUsage: 'mentor', aiUsageApplies: isModelTurn },
  async ({ app, subject, params, body }) => {
    const input = ProblemHelpTurnRequestSchema.safeParse(body)
    if (!input.success) {
      throw invalidMentorInput(
        input.error.issues[0]?.message ?? 'The help action is invalid.',
        input.error.issues,
      )
    }
    return json(
      ProblemHelpSessionResponseSchema.parse(
        await mentor(() =>
          app.mentorService.helpTurn(subject, params.sessionId, input.data),
        ),
      ),
    )
  },
)
