import { ConnectorReportRequestSchema } from '@algomemtor/shared-contracts'

import { httpError } from '@/server/http/errors'
import { connectorPreflight, noContent, route } from '@/server/http/route'

export const POST = route({ auth: 'connector' }, ({ app, body }) => {
  const input = ConnectorReportRequestSchema.safeParse(body)
  if (!input.success) {
    throw httpError(400, 'INVALID_CONNECTOR_REPORT', 'The report is invalid.')
  }
  const fields = {
    provider: input.data.provider,
    status: input.data.status,
    detail: input.data.message.replace(/[^\w .,:;()/'-]/g, '').slice(0, 300),
  }
  if (input.data.status === 'synced') {
    app.logger.info('connector_sync_reported', fields)
  } else {
    app.logger.warn('connector_sync_reported', fields)
  }
  return noContent()
})

export const OPTIONS = connectorPreflight
