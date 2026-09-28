import {
  ConnectorIngestRequestSchema,
  ConnectorIngestResponseSchema,
} from '@algomemtor/shared-contracts'

import { httpError } from '@/server/http/errors'
import { connectorPreflight, json, route } from '@/server/http/route'
import { ProviderAccountHandleClaimedError } from '@/server/repositories/provider-account-repository'
import {
  ConnectorAccountMismatchError,
  ConnectorAccountUnavailableError,
} from '@/server/services/connector-service'

export const POST = route(
  { auth: 'connector' },
  async ({ app, subject, body }) => {
    const input = ConnectorIngestRequestSchema.safeParse(body)
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_CONNECTOR_UPLOAD',
        'The connector upload is invalid.',
        { details: input.error.issues.slice(0, 20) },
      )
    }
    try {
      const result = await app.connectorService.ingest(subject, input.data)
      await app.refreshLearnerActivity(subject)
      // Stored activity can queue memory work for this learner.
      app.wakeJobs(subject)
      return json(ConnectorIngestResponseSchema.parse({ data: result }))
    } catch (error) {
      if (
        error instanceof ConnectorAccountMismatchError ||
        error instanceof ConnectorAccountUnavailableError
      ) {
        throw httpError(409, error.code, error.message)
      }
      if (error instanceof ProviderAccountHandleClaimedError) {
        throw httpError(
          409,
          'PROVIDER_HANDLE_ALREADY_LINKED',
          'That account is already linked to another AlgoMemtor learner.',
        )
      }
      throw error
    }
  },
)

export const OPTIONS = connectorPreflight
