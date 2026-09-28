import { ContestPatternsReportResponseSchema } from '@algomemtor/shared-contracts'

import { invalidMentorInput, mentor, refreshBody } from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

export const POST = route(
  { auth: 'user', aiUsage: 'mentor' },
  async ({ app, subject, body }) => {
    const input = refreshBody.safeParse(body ?? {})
    if (!input.success) throw invalidMentorInput('The request is invalid.')
    return json(
      ContestPatternsReportResponseSchema.parse({
        data: await mentor(() =>
          app.mentorService.contestPatternsReport(
            subject,
            input.data.refresh === true,
          ),
        ),
      }),
    )
  },
)
