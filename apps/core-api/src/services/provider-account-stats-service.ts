import type {
  LinkableProvider,
  ProviderPublicStatsSource,
} from '@algomemtor/shared-contracts'

import {
  ProviderPublicStatsError,
  type ProviderPublicStatsFetcher,
} from '../integrations/provider-accounts/provider-public-stats.js'
import type {
  ProviderAccountRecord,
  ProviderAccountRepository,
} from '../repositories/provider-account-repository.js'
import {
  structuredLogger,
  type StructuredLogger,
} from '../utils/structured-logger.js'

const expectedSourceByProvider: Record<
  LinkableProvider,
  ProviderPublicStatsSource
> = {
  codeforces: 'codeforces_api',
  codechef: 'codechef_public_profile_html',
  leetcode: 'leetcode_website_graphql',
}

export class ProviderAccountNotLinkedError extends Error {
  constructor() {
    super('The provider account is not linked.')
    this.name = 'ProviderAccountNotLinkedError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ProviderAccountChangedError extends Error {
  constructor() {
    super('The provider account changed while statistics were refreshing.')
    this.name = 'ProviderAccountChangedError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export type ProviderAccountStatsServiceOptions = {
  repository: ProviderAccountRepository
  fetchers: readonly ProviderPublicStatsFetcher[]
  logger?: StructuredLogger
  now?: () => Date
  minRefreshIntervalMs?: number
}

export class ProviderAccountStatsService {
  private readonly repository: ProviderAccountRepository
  private readonly fetchers = new Map<
    LinkableProvider,
    ProviderPublicStatsFetcher
  >()
  private readonly logger: StructuredLogger
  private readonly now: () => Date
  private readonly minRefreshIntervalMs: number
  private readonly inFlight = new Map<string, Promise<ProviderAccountRecord>>()

  constructor(options: ProviderAccountStatsServiceOptions) {
    this.repository = options.repository
    this.logger = options.logger ?? structuredLogger
    this.now = options.now ?? (() => new Date())
    this.minRefreshIntervalMs = options.minRefreshIntervalMs ?? 60_000

    if (this.minRefreshIntervalMs < 0) {
      throw new Error('The provider statistics refresh interval is invalid.')
    }

    for (const fetcher of options.fetchers) {
      if (this.fetchers.has(fetcher.provider)) {
        throw new Error(
          `Duplicate public-statistics fetcher for ${fetcher.provider}.`,
        )
      }

      this.fetchers.set(fetcher.provider, fetcher)
    }
  }

  async refresh(authUserId: string, provider: LinkableProvider) {
    const key = `${authUserId}:${provider}`
    const existingRefresh = this.inFlight.get(key)

    if (existingRefresh !== undefined) {
      return existingRefresh
    }

    const refresh = this.performRefresh(authUserId, provider).finally(() => {
      this.inFlight.delete(key)
    })
    this.inFlight.set(key, refresh)

    return refresh
  }

  private async performRefresh(authUserId: string, provider: LinkableProvider) {
    const account = await this.repository.findByAuthUserIdAndProvider(
      authUserId,
      provider,
    )

    if (account === null) {
      throw new ProviderAccountNotLinkedError()
    }

    const attemptedAt = this.now()

    if (
      account.statsAttemptedAt !== null &&
      attemptedAt.getTime() - account.statsAttemptedAt.getTime() <
        this.minRefreshIntervalMs
    ) {
      return account
    }

    const fetcher = this.fetchers.get(provider)

    if (fetcher === undefined) {
      throw new Error(`No public-statistics fetcher for ${provider}.`)
    }

    try {
      const stats = await fetcher.fetchSolvedCount(account.externalHandle)

      if (stats.source !== expectedSourceByProvider[provider]) {
        throw new ProviderPublicStatsError(
          'The provider returned an unexpected statistics source.',
          {
            provider,
            code: 'PROVIDER_INVALID_RESPONSE',
            retryable: false,
          },
        )
      }

      const saved = await this.repository.savePublicStatsSuccess(
        authUserId,
        provider,
        account.externalHandle,
        { ...stats, attemptedAt },
      )

      if (saved === null) {
        throw new ProviderAccountChangedError()
      }

      this.logger.info('provider_public_stats_refresh_succeeded', {
        service: 'core-api',
        provider,
        complete: stats.complete,
      })
      return saved
    } catch (error) {
      if (error instanceof ProviderAccountChangedError) {
        throw error
      }

      const providerError =
        error instanceof ProviderPublicStatsError
          ? error
          : new ProviderPublicStatsError(
              'The provider public-statistics refresh failed.',
              {
                provider,
                code: 'PROVIDER_UNAVAILABLE',
                retryable: true,
                cause: error,
              },
            )

      const saved = await this.repository.savePublicStatsFailure(
        authUserId,
        provider,
        account.externalHandle,
        {
          errorCode: providerError.code,
          retryable: providerError.retryable,
          attemptedAt,
        },
      )

      if (saved === null) {
        throw new ProviderAccountChangedError()
      }

      this.logger.warn('provider_public_stats_refresh_failed', {
        service: 'core-api',
        provider,
        errorCode: providerError.code,
        retryable: providerError.retryable,
      })
      throw providerError
    }
  }
}
