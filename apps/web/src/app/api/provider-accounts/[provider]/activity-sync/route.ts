import { ProviderActivitySyncResponseSchema } from '@algomemtor/shared-contracts'

import { httpError, publicStatsHttpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { ServerFetchedProviderSchema } from '@/server/http/schemas'
import { ProviderPublicStatsError } from '@/server/integrations/provider-accounts/provider-public-stats'
import {
  ProviderActivityChangedError,
  ProviderActivityConsentRequiredError,
  ProviderActivityCooldownError,
  ProviderActivityNotLinkedError,
} from '@/server/services/provider-activity-service'

export const POST = route<{ provider: string }>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const providerResult = ServerFetchedProviderSchema.safeParse(
      params.provider,
    )
    if (!providerResult.success || providerResult.data !== 'codeforces') {
      throw httpError(
        400,
        'UNSUPPORTED_ACTIVITY_PROVIDER',
        'Only Codeforces public activity can be synchronized in this phase.',
      )
    }
    try {
      const result = await app.providerActivityService.sync(
        subject,
        providerResult.data,
      )
      return json(
        ProviderActivitySyncResponseSchema.parse({
          data: {
            provider: result.provider,
            discovered: result.discovered,
            added: result.added,
            confirmedSolved: result.confirmedSolved,
            complete: result.complete,
            syncedAt: result.syncedAt.toISOString(),
            nextAllowedAt: result.nextAllowedAt.toISOString(),
          },
        }),
      )
    } catch (error) {
      if (error instanceof ProviderActivityNotLinkedError) {
        throw httpError(
          404,
          'PROVIDER_ACCOUNT_NOT_LINKED',
          'Link this Codeforces account before synchronizing activity.',
        )
      }
      if (error instanceof ProviderActivityConsentRequiredError) {
        throw httpError(
          400,
          'PROVIDER_ACTIVITY_CONSENT_REQUIRED',
          'Enable Codeforces public activity consent before synchronizing.',
        )
      }
      if (error instanceof ProviderActivityCooldownError) {
        throw httpError(
          429,
          'PROVIDER_ACTIVITY_COOLDOWN',
          'Codeforces activity was synchronized too recently.',
          {
            retryable: true,
            details: { retryAfter: error.retryAfter.toISOString() },
          },
        )
      }
      if (error instanceof ProviderActivityChangedError) {
        throw httpError(
          409,
          'PROVIDER_ACCOUNT_CHANGED',
          'The linked Codeforces handle changed during synchronization. Try again.',
          { retryable: true },
        )
      }
      if (error instanceof ProviderPublicStatsError) {
        throw publicStatsHttpError(error)
      }
      throw error
    }
  },
)
