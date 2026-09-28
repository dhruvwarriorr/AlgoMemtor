import { ProviderProfileResponseSchema } from '@algomemtor/shared-contracts'

import { ProviderError } from '@/server/errors/provider-error'
import {
  httpError,
  providerHttpError,
  publicStatsHttpError,
} from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { ServerFetchedProviderSchema } from '@/server/http/schemas'
import { ProviderPublicStatsError } from '@/server/integrations/provider-accounts/provider-public-stats'

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
        'That provider cannot supply a public profile.',
      )
    }
    try {
      const profile = await app.providerProfileService.refresh(
        subject,
        providerResult.data,
      )
      return json(ProviderProfileResponseSchema.parse({ data: profile }))
    } catch (error) {
      if (error instanceof ProviderPublicStatsError) {
        throw publicStatsHttpError(error)
      }
      if (error instanceof ProviderError) throw providerHttpError(error)
      throw error
    }
  },
)
