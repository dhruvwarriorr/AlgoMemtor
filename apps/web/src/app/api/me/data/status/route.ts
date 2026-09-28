import { DeleteAllDataStatusResponseSchema } from '@algomemtor/shared-contracts'

import { featureNotEnabled } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const GET = route(
  { auth: 'user', allowDuringDeletion: true },
  async ({ app, subject }) => {
    if (!app.progressEnabled) throw featureNotEnabled()
    return json(
      DeleteAllDataStatusResponseSchema.parse(
        await app.progressService.getDeleteStatus(subject),
      ),
    )
  },
)
