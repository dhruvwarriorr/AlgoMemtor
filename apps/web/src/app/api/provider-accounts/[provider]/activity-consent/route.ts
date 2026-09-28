import {
  ProviderAccountResponseSchema,
  SetProviderActivityConsentRequestSchema,
} from '@algomemtor/shared-contracts'

import { httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { ServerFetchedProviderSchema } from '@/server/http/schemas'
import { serializeProviderAccount } from '@/server/services/provider-account-service'

export const PUT = route<{ provider: string }>(
  { auth: 'user' },
  async ({ app, subject, params, body }) => {
    const providerResult = ServerFetchedProviderSchema.safeParse(
      params.provider,
    )
    const consentResult =
      SetProviderActivityConsentRequestSchema.safeParse(body)
    if (!providerResult.success) {
      throw httpError(
        400,
        'UNSUPPORTED_LINK_PROVIDER',
        'That provider cannot supply verified activity.',
      )
    }
    if (providerResult.data !== 'codeforces') {
      throw httpError(
        400,
        'UNSUPPORTED_ACTIVITY_PROVIDER',
        'Only Codeforces public activity can be enabled in this phase.',
      )
    }
    if (!consentResult.success) {
      throw httpError(
        400,
        'PROVIDER_ACTIVITY_CONSENT_REQUIRED',
        'The Codeforces public-activity policy must be accepted explicitly.',
        { details: consentResult.error.issues },
      )
    }
    const account = await app.providerActivityService.setConsent(
      subject,
      providerResult.data,
      consentResult.data.enabled,
    )
    if (account === null) {
      throw httpError(
        404,
        'PROVIDER_ACCOUNT_NOT_LINKED',
        'Link this Codeforces account before changing activity consent.',
      )
    }
    return json(
      ProviderAccountResponseSchema.parse({
        data: serializeProviderAccount(account),
      }),
    )
  },
)
