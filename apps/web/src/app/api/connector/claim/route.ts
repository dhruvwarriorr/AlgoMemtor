import {
  ConnectorClaimRequestSchema,
  ConnectorClaimResponseSchema,
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
    const input = ConnectorClaimRequestSchema.safeParse(body)
    if (!input.success) {
      throw httpError(400, 'INVALID_CONNECTOR_CLAIM', 'The claim is invalid.')
    }
    try {
      const { account, newlyLinked } = await app.connectorService.claim(
        subject,
        input.data,
      )
      let syncQueued = true
      if (newlyLinked) {
        await app.providerSyncService.requestInitialSync(
          subject,
          input.data.provider,
        )
      } else {
        if (account.publicStatsConsentAt === null) {
          await app.providerAccountRepository.grantPublicStatsConsent(
            subject,
            input.data.provider,
            account.externalHandle,
            new Date(),
          )
        }
        const sync = await app.providerSyncService.requestManualSync(
          subject,
          input.data.provider,
        )
        syncQueued = sync.data.accepted
      }
      // The connector's token only reaches connector routes, so the server
      // drains the queued sync for this learner itself.
      app.wakeJobs(subject)
      return json(
        ConnectorClaimResponseSchema.parse({
          data: {
            provider: input.data.provider,
            handle: account.externalHandle,
            verified: account.verificationStatus === 'verified',
            syncQueued,
          },
        }),
      )
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
