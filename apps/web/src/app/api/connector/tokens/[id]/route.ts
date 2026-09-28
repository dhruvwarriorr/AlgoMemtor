import { RevokeConnectorTokenResponseSchema } from '@algomemtor/shared-contracts'

import { httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const DELETE = route<{ id: string }>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const id = params.id
    const revoked =
      /^[0-9a-f-]{36}$/i.test(id) &&
      (await app.connectorService.revokeToken(subject, id))
    if (!revoked) {
      throw httpError(
        404,
        'CONNECTOR_TOKEN_NOT_FOUND',
        'That connector is not active.',
      )
    }
    return json(RevokeConnectorTokenResponseSchema.parse({ data: { id } }))
  },
)
