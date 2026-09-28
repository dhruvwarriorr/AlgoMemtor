import { ProgressReportResponseSchema } from '@algomemtor/shared-contracts'

import { mentor } from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, async ({ app, subject }) =>
  json(
    ProgressReportResponseSchema.parse(
      await mentor(() => app.mentorService.progressReport(subject)),
    ),
  ),
)
