import {
  ConnectorTokensResponseSchema,
  CreateConnectorTokenRequestSchema,
  CreateConnectorTokenResponseSchema,
  RevokeConnectorTokenResponseSchema,
  type ConnectorTokensResponse,
  type CreateConnectorTokenResponse,
  type RevokeConnectorTokenResponse,
} from '@algomemtor/shared-contracts'

import { requestJson } from '@/features/discovery/api/client'

export function fetchConnectorTokens({
  signal,
}: { signal?: AbortSignal } = {}) {
  return requestJson<ConnectorTokensResponse>('/api/connector/tokens', {
    authentication: 'required',
    schema: ConnectorTokensResponseSchema,
    signal,
  })
}

export function createConnectorToken(label: string) {
  return requestJson<CreateConnectorTokenResponse>('/api/connector/tokens', {
    authentication: 'required',
    body: JSON.stringify(CreateConnectorTokenRequestSchema.parse({ label })),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    schema: CreateConnectorTokenResponseSchema,
  })
}

export function revokeConnectorToken(id: string) {
  return requestJson<RevokeConnectorTokenResponse>(
    `/api/connector/tokens/${encodeURIComponent(id)}`,
    {
      authentication: 'required',
      method: 'DELETE',
      schema: RevokeConnectorTokenResponseSchema,
    },
  )
}
