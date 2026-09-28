import { ProviderSyncRequestResponseSchema } from '@algomemtor/shared-contracts'

import { httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { ServerFetchedProviderSchema } from '@/server/http/schemas'
import { ProviderSyncNotLinkedError } from '@/server/services/provider-sync-service'

export const POST = route<{ provider: string }>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const providerResult = ServerFetchedProviderSchema.safeParse(
      params.provider,
    )
    if (!providerResult.success) {
      throw httpError(
        400,
        'UNSUPPORTED_LINK_PROVIDER',
        'That provider cannot be synchronized.',
      )
    }
    try {
      const account =
        await app.providerAccountRepository.findByAuthUserIdAndProvider(
          subject,
          providerResult.data,
        )
      if (account !== null && account.publicStatsConsentAt === null) {
        await app.providerAccountRepository.grantPublicStatsConsent(
          subject,
          providerResult.data,
          account.externalHandle,
          new Date(),
        )
      }
      const result = await app.providerSyncService.requestManualSync(
        subject,
        providerResult.data,
      )
      app.wakeJobs(subject)
      return json(ProviderSyncRequestResponseSchema.parse(result), 202)
    } catch (error) {
      if (error instanceof ProviderSyncNotLinkedError) {
        throw httpError(
          404,
          'PROVIDER_ACCOUNT_NOT_LINKED',
          'Link this provider account before requesting synchronization.',
        )
      }
      throw error
    }
  },
)
