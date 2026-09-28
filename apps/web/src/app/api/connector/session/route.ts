import { ConnectorSessionResponseSchema } from '@algomemtor/shared-contracts'

import { connectorPreflight, json, route } from '@/server/http/route'

// Browser-connector routes authenticate with a connector token instead of a
// Supabase session. The token can only read its own link state and upload.
export const GET = route(
  { auth: 'connector' },
  async ({ app, connectorToken, subject }) =>
    json(
      ConnectorSessionResponseSchema.parse({
        data: {
          tokenLabel: connectorToken?.label,
          accounts: await app.connectorService.linkedAccounts(subject),
        },
      }),
    ),
)

export const OPTIONS = connectorPreflight
