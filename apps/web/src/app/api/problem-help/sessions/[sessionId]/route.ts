import { ProblemHelpSessionResponseSchema } from '@algomemtor/shared-contracts'

import { mentor } from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

export const GET = route<{ sessionId: string }>(
  { auth: 'user' },
  async ({ app, subject, params }) =>
    json(
      ProblemHelpSessionResponseSchema.parse(
        await mentor(() =>
          app.mentorService.getHelpSession(subject, params.sessionId),
        ),
      ),
    ),
)
