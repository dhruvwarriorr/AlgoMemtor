import { SolutionExplorationsResponseSchema } from '@algomemtor/shared-contracts'

import { mentor } from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, async ({ app, subject }) =>
  json(
    SolutionExplorationsResponseSchema.parse({
      data: await mentor(() => app.mentorService.listExplorations(subject)),
    }),
  ),
)
