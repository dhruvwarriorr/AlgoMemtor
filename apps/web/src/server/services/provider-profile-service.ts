import type {
  LinkableProvider,
  ProviderProfile,
} from '@algomemtor/shared-contracts'

import {
  ProviderPublicStatsError,
  type ProviderProfileFetcher,
} from '../integrations/provider-accounts/provider-public-stats'
import type { ProviderAccountRepository } from '../repositories/provider-account-repository'
import type { ProviderProfileRepository } from '../repositories/provider-profile-repository'

export class ProviderProfileService {
  private readonly fetchers = new Map<
    LinkableProvider,
    ProviderProfileFetcher
  >()

  constructor(
    private readonly options: {
      accountRepository: ProviderAccountRepository
      profileRepository: ProviderProfileRepository
      fetchers: readonly ProviderProfileFetcher[]
    },
  ) {
    for (const fetcher of options.fetchers) {
      this.fetchers.set(fetcher.provider, fetcher)
    }
  }

  async refresh(
    authUserId: string,
    provider: LinkableProvider,
  ): Promise<ProviderProfile> {
    const account =
      await this.options.accountRepository.findByAuthUserIdAndProvider(
        authUserId,
        provider,
      )
    if (account === null) {
      throw new ProviderPublicStatsError(
        'The provider account is not linked.',
        {
          provider,
          code: 'PROVIDER_ACCOUNT_NOT_FOUND',
          retryable: false,
        },
      )
    }
    const fetcher = this.fetchers.get(provider)
    if (fetcher === undefined) {
      throw new ProviderPublicStatsError(
        'The provider profile is unsupported.',
        {
          provider,
          code: 'PROVIDER_INVALID_RESPONSE',
          retryable: false,
        },
      )
    }
    const profile = await fetcher.fetchProfile(account.externalHandle)
    await this.options.profileRepository.saveSnapshot(
      authUserId,
      account.id,
      profile,
    )
    return profile
  }

  async latest(authUserId: string, provider?: LinkableProvider) {
    return this.options.profileRepository.findLatestByAuthUserId(
      authUserId,
      provider,
    )
  }
}
