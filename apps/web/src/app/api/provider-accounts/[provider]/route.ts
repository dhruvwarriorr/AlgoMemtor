import {
  DisconnectProviderAccountResponseSchema,
  isConnectorOnlyProvider,
  LinkableProviderSchema,
  LinkProviderAccountRequestSchema,
  ProviderAccountResponseSchema,
} from '@algomemtor/shared-contracts'

import { httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { ServerFetchedProviderSchema } from '@/server/http/schemas'
import { ProviderAccountHandleClaimedError } from '@/server/repositories/provider-account-repository'
import { serializeProviderAccount } from '@/server/services/provider-account-service'

type Params = { provider: string }

export const PUT = route<Params>(
  { auth: 'user' },
  async ({ app, subject, params, body }) => {
    const providerResult = ServerFetchedProviderSchema.safeParse(
      params.provider,
    )
    const accountResult = LinkProviderAccountRequestSchema.safeParse(body)

    if (isConnectorOnlyProvider(params.provider)) {
      throw httpError(
        400,
        'CONNECTOR_ONLY_PROVIDER',
        'Connect this provider with the AlgoMemtor browser connector.',
      )
    }
    if (!providerResult.success) {
      throw httpError(
        400,
        'UNSUPPORTED_LINK_PROVIDER',
        'That provider cannot be linked.',
      )
    }
    if (!accountResult.success) {
      throw httpError(
        400,
        'INVALID_PROVIDER_ACCOUNT',
        'The provider account link is invalid or consent is missing.',
        { details: accountResult.error.issues },
      )
    }

    let account
    try {
      account = await app.providerAccountRepository.upsertByAuthUserId(
        subject,
        providerResult.data,
        accountResult.data.handle,
      )
    } catch (error) {
      if (error instanceof ProviderAccountHandleClaimedError) {
        throw httpError(
          409,
          'PROVIDER_HANDLE_ALREADY_LINKED',
          'That public provider handle is already linked to another learner.',
        )
      }
      throw error
    }

    try {
      await app.providerSyncService.requestInitialSync(
        subject,
        providerResult.data,
      )
      app.wakeJobs(subject)
    } catch (error) {
      app.logger.warn('provider_initial_sync_enqueue_failed', {
        provider: providerResult.data,
        errorCode:
          error instanceof Error &&
          'code' in error &&
          typeof error.code === 'string'
            ? error.code
            : 'PROVIDER_SYNC_ENQUEUE_FAILED',
      })
    }

    return json(
      ProviderAccountResponseSchema.parse({
        data: serializeProviderAccount(account),
      }),
    )
  },
)

export const DELETE = route<Params>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const providerResult = LinkableProviderSchema.safeParse(params.provider)
    if (!providerResult.success) {
      throw httpError(
        400,
        'UNSUPPORTED_LINK_PROVIDER',
        'That provider cannot be disconnected.',
      )
    }
    await app.providerAccountRepository.disconnectByAuthUserId(
      subject,
      providerResult.data,
    )
    return json(
      DisconnectProviderAccountResponseSchema.parse({
        data: { provider: providerResult.data },
      }),
    )
  },
)
