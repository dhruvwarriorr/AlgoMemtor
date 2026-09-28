import { ProviderAccountResponseSchema } from '@algomemtor/shared-contracts'

import { createVerificationCode, VERIFICATION_TTL_MS } from '@/server/context'
import { httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { ServerFetchedProviderSchema } from '@/server/http/schemas'
import { serializeProviderAccount } from '@/server/services/provider-account-service'

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
        'That provider cannot be verified.',
      )
    }
    const account =
      await app.providerAccountRepository.findByAuthUserIdAndProvider(
        subject,
        providerResult.data,
      )
    if (account === null) {
      throw httpError(
        404,
        'PROVIDER_ACCOUNT_NOT_LINKED',
        'Link this provider account before verifying it.',
      )
    }
    if (account.verificationStatus === 'verified') {
      return json(
        ProviderAccountResponseSchema.parse({
          data: serializeProviderAccount(account),
        }),
      )
    }
    const updated = await app.providerAccountRepository.startVerification(
      subject,
      providerResult.data,
      account.externalHandle,
      {
        code: createVerificationCode(),
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    )
    if (updated === null) {
      throw httpError(
        409,
        'PROVIDER_ACCOUNT_CHANGED',
        'The linked handle changed. Refresh and try again.',
      )
    }
    return json(
      ProviderAccountResponseSchema.parse({
        data: serializeProviderAccount(updated),
      }),
    )
  },
)
