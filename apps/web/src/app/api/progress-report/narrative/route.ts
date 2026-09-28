import { ProgressNarrativeResponseSchema } from '@algomemtor/shared-contracts'

import { invalidMentorInput, mentor, refreshBody } from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

export const POST = route(
  { auth: 'user', aiUsage: 'mentor' },
  async ({ app, subject, body }) => {
    const input = refreshBody.safeParse(body ?? {})
    if (!input.success) throw invalidMentorInput('The request is invalid.')
    return json(
      ProgressNarrativeResponseSchema.parse({
        data: await mentor(() =>
          app.mentorService.progressNarrative(
            subject,
            input.data.refresh === true,
          ),
        ),
      }),
    )
  },
)
