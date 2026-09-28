import { ProviderAccountResponseSchema } from '@algomemtor/shared-contracts'

import { ProviderError } from '@/server/errors/provider-error'
import { httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { ServerFetchedProviderSchema } from '@/server/http/schemas'
import { serializeProviderAccount } from '@/server/services/provider-account-service'

const expired = () =>
  httpError(
    409,
    'PROVIDER_VERIFICATION_EXPIRED',
    'This verification code has expired. Start again to get a new code.',
  )

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
    const provider = providerResult.data
    const account =
      await app.providerAccountRepository.findByAuthUserIdAndProvider(
        subject,
        provider,
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
    const challenge = account.verificationChallenge
    const now = new Date()
    if (challenge === null || challenge.expiresAt <= now) throw expired()
    const checker = app.providerOwnershipCheckers.find(
      (candidate) => candidate.provider === provider,
    )
    if (checker === undefined) {
      throw httpError(
        503,
        'PROVIDER_VERIFICATION_UNAVAILABLE',
        'Ownership verification is not available for this provider.',
        { retryable: false },
      )
    }
    let found: boolean
    try {
      found = await checker.profileContainsCode(
        account.externalHandle,
        challenge.code,
      )
    } catch (error) {
      app.logger.warn('provider_verification_check_failed', {
        provider,
        errorCode:
          error instanceof ProviderError ? error.code : 'PROVIDER_UNAVAILABLE',
      })
      throw httpError(
        503,
        'PROVIDER_VERIFICATION_UNAVAILABLE',
        'The provider profile could not be read right now. Try again in a minute.',
        { retryable: true },
      )
    }
    app.logger.info('provider_verification_checked', { provider, found })
    if (!found) {
      throw httpError(
        422,
        'PROVIDER_VERIFICATION_CODE_NOT_FOUND',
        'The code is not on your public profile yet. Save the profile change, wait a minute, then check again.',
        { retryable: true },
      )
    }
    const verified = await app.providerAccountRepository.completeVerification(
      subject,
      provider,
      account.externalHandle,
      challenge.code,
      now,
    )
    if (verified === null) throw expired()
    return json(
      ProviderAccountResponseSchema.parse({
        data: serializeProviderAccount(verified),
      }),
    )
  },
)
