import {
  ProviderAccountResponseSchema,
  RefreshProviderPublicStatsRequestSchema,
} from '@algomemtor/shared-contracts'

import { httpError, publicStatsHttpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { ServerFetchedProviderSchema } from '@/server/http/schemas'
import { ProviderPublicStatsError } from '@/server/integrations/provider-accounts/provider-public-stats'
import { serializeProviderAccount } from '@/server/services/provider-account-service'
import {
  ProviderAccountChangedError,
  ProviderAccountNotLinkedError,
} from '@/server/services/provider-account-stats-service'

export const POST = route<{ provider: string }>(
  { auth: 'user' },
  async ({ app, subject, params, body }) => {
    const providerResult = ServerFetchedProviderSchema.safeParse(
      params.provider,
    )
    const consentResult =
      RefreshProviderPublicStatsRequestSchema.safeParse(body)

    if (!providerResult.success) {
      throw httpError(
        400,
        'UNSUPPORTED_LINK_PROVIDER',
        'That provider cannot supply public solved-count data.',
      )
    }

    const linkedAccount =
      await app.providerAccountRepository.findByAuthUserIdAndProvider(
        subject,
        providerResult.data,
      )
    const hasLongLivedConsent =
      linkedAccount !== null &&
      linkedAccount !== undefined &&
      linkedAccount.publicStatsConsentAt !== null
    const consentValue =
      body !== null && typeof body === 'object'
        ? (body as { consent?: unknown }).consent
        : undefined
    const explicitConsentFailure =
      consentValue !== undefined && consentValue !== true
    const consentIssues = consentResult.success
      ? []
      : consentResult.error.issues
    if (
      explicitConsentFailure ||
      (!consentResult.success && !hasLongLivedConsent)
    ) {
      throw httpError(
        400,
        'PUBLIC_STATS_CONSENT_REQUIRED',
        'Explicit consent is required before public solved-count data is fetched and stored.',
        { details: consentIssues },
      )
    }

    try {
      const account = await app.providerAccountStatsService.refresh(
        subject,
        providerResult.data,
      )
      return json(
        ProviderAccountResponseSchema.parse({
          data: serializeProviderAccount(account),
        }),
      )
    } catch (error) {
      if (error instanceof ProviderAccountNotLinkedError) {
        throw httpError(
          404,
          'PROVIDER_ACCOUNT_NOT_LINKED',
          'Link this provider account before refreshing its public statistics.',
        )
      }
      if (error instanceof ProviderAccountChangedError) {
        throw httpError(
          409,
          'PROVIDER_ACCOUNT_CHANGED',
          'The linked handle changed during the refresh. Try again.',
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
