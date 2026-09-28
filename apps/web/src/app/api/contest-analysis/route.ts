import { ContestAnalysisOverviewResponseSchema } from '@algomemtor/shared-contracts'

import { mentor, wantsRefresh } from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, async ({ app, subject, query }) =>
  json(
    ContestAnalysisOverviewResponseSchema.parse({
      data: await mentor(() =>
        app.mentorService.contestOverview(subject, {
          refresh: wantsRefresh(query),
        }),
      ),
    }),
  ),
)
