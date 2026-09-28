import {
  ConnectorTokensResponseSchema,
  CreateConnectorTokenRequestSchema,
  CreateConnectorTokenResponseSchema,
} from '@algomemtor/shared-contracts'

import { serializeConnectorToken } from '@/server/context'
import { httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { ConnectorTokenLimitError } from '@/server/repositories/connector-token-repository'

export const GET = route({ auth: 'user' }, async ({ app, subject }) => {
  const tokens = await app.connectorService.listTokens(subject)
  return json(
    ConnectorTokensResponseSchema.parse({
      data: tokens.map(serializeConnectorToken),
    }),
  )
})

export const POST = route({ auth: 'user' }, async ({ app, subject, body }) => {
  const input = CreateConnectorTokenRequestSchema.safeParse(body)
  if (!input.success) {
    throw httpError(
      400,
      'INVALID_CONNECTOR_TOKEN_REQUEST',
      'Give the connector a short name.',
      { details: input.error.issues },
    )
  }
  try {
    const { token, secret } = await app.connectorService.createToken(
      subject,
      input.data.label,
    )
    return json(
      CreateConnectorTokenResponseSchema.parse({
        data: { token: serializeConnectorToken(token), secret },
      }),
      201,
    )
  } catch (error) {
    if (error instanceof ConnectorTokenLimitError) {
      throw httpError(409, error.code, error.message)
    }
    throw error
  }
})
