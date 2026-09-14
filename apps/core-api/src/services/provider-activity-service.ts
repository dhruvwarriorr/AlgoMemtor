import type { LinkableProvider } from '@algomemtor/shared-contracts'

import {
  ProviderPublicStatsError,
  type ProviderVerifiedActivityFetcher,
} from '../integrations/provider-accounts/provider-public-stats.js'
import type {
  ProviderAccountRecord,
  ProviderAccountRepository,
} from '../repositories/provider-account-repository.js'
import type { ProblemActionRepository } from '../repositories/problem-action-repository.js'
import {
  structuredLogger,
  type StructuredLogger,
} from '../utils/structured-logger.js'

const activityProvider = 'codeforces' as const

export class ProviderActivityNotLinkedError extends Error {
  constructor() {
    super('The Codeforces account is not linked.')
    this.name = 'ProviderActivityNotLinkedError'
  }
}

export class ProviderActivityConsentRequiredError extends Error {
  constructor() {
    super('Explicit consent is required before Codeforces activity is fetched.')
    this.name = 'ProviderActivityConsentRequiredError'
  }
}

export class ProviderActivityCooldownError extends Error {
  readonly retryAfter: Date

  constructor(retryAfter: Date) {
    super('Codeforces activity was refreshed too recently.')
    this.name = 'ProviderActivityCooldownError'
    this.retryAfter = retryAfter
  }
}

export class ProviderActivityChangedError extends Error {
  constructor() {
    super('The linked Codeforces handle changed during activity refresh.')
    this.name = 'ProviderActivityChangedError'
  }
}

export type ProviderActivityServiceOptions = {
  repository: ProviderAccountRepository
  actionRepository: ProblemActionRepository
  fetchers: readonly ProviderVerifiedActivityFetcher[]
  logger?: StructuredLogger
  now?: () => Date
  minRefreshIntervalMs?: number
}

export class ProviderActivityService {
  private readonly fetchers = new Map<
    LinkableProvider,
    ProviderVerifiedActivityFetcher
  >()
  private readonly logger: StructuredLogger
  private readonly now: () => Date
  private readonly minRefreshIntervalMs: number
  private readonly inFlight = new Map<
    string,
    Promise<ProviderActivitySyncResult>
  >()

  constructor(private readonly options: ProviderActivityServiceOptions) {
    this.logger = options.logger ?? structuredLogger
    this.now = options.now ?? (() => new Date())
    this.minRefreshIntervalMs = options.minRefreshIntervalMs ?? 900_000
    for (const fetcher of options.fetchers) {
      this.fetchers.set(fetcher.provider, fetcher)
    }
  }

  async setConsent(
    authUserId: string,
    provider: LinkableProvider,
    enabled: boolean,
  ) {
    if (provider !== activityProvider) {
      return null
    }
    const account = await this.options.repository.setVerifiedActivityConsent(
      authUserId,
      provider,
      enabled,
      this.now(),
    )
    if (!enabled) {
      await this.options.actionRepository.deleteProviderVerifiedByAuthUserId(
        authUserId,
        provider,
      )
    }
    return account
  }

  async sync(authUserId: string, provider: LinkableProvider) {
    const key = `${authUserId}:${provider}`
    const existing = this.inFlight.get(key)
    if (existing !== undefined) return existing
    const request = this.performSync(authUserId, provider).finally(() => {
      this.inFlight.delete(key)
    })
    this.inFlight.set(key, request)
    return request
  }

  private async performSync(
    authUserId: string,
    provider: LinkableProvider,
  ): Promise<ProviderActivitySyncResult> {
    if (provider !== activityProvider) {
      throw new ProviderPublicStatsError(
        'The provider does not support verified activity.',
        {
          provider,
          code: 'PROVIDER_INVALID_RESPONSE',
          retryable: false,
        },
      )
    }
    const verifiedProvider = activityProvider
    const account = await this.options.repository.findByAuthUserIdAndProvider(
      authUserId,
      provider,
    )
    if (account === null) throw new ProviderActivityNotLinkedError()
    if (!account.verifiedActivity.enabled) {
      throw new ProviderActivityConsentRequiredError()
    }

    const attemptedAt = this.now()
    const lastAttemptedAt = account.verifiedActivity.lastAttemptedAt
    if (
      lastAttemptedAt !== null &&
      attemptedAt.getTime() - lastAttemptedAt.getTime() <
        this.minRefreshIntervalMs
    ) {
      throw new ProviderActivityCooldownError(
        new Date(lastAttemptedAt.getTime() + this.minRefreshIntervalMs),
      )
    }

    const fetcher = this.fetchers.get(provider)
    if (fetcher === undefined) {
      throw new ProviderPublicStatsError(
        'The provider does not support verified activity.',
        {
          provider,
          code: 'PROVIDER_INVALID_RESPONSE',
          retryable: false,
        },
      )
    }

    const startedAtMs = Date.now()
    try {
      const activity = await fetcher.fetchVerifiedActivity(
        account.externalHandle,
      )
      const saved = await this.options.repository.saveVerifiedActivitySuccess(
        authUserId,
        verifiedProvider,
        account.externalHandle,
        { ...activity, attemptedAt },
      )
      if (saved === null) throw new ProviderActivityChangedError()

      let confirmedSolved = 0
      const existingActions =
        await this.options.actionRepository.listByAuthUserId(authUserId)
      for (const event of [...saved.added, ...saved.pending]) {
        const existingAction = existingActions.find(
          (candidate) =>
            candidate.provider === verifiedProvider &&
            candidate.externalId === event.externalId &&
            candidate.actionType === 'status_changed' &&
            candidate.learnerStatus === 'solved' &&
            candidate.evidenceSource === 'provider_verified',
        )
        const action =
          existingAction ??
          (await this.options.actionRepository.appendByAuthUserId(authUserId, {
            provider: verifiedProvider,
            externalId: event.externalId,
            actionType: 'status_changed',
            learnerStatus: 'solved',
            evidenceSource: 'provider_verified',
            occurredAt: event.occurredAt,
            sourceContext: 'codeforces_public_activity',
          }))
        if (existingAction === undefined) {
          existingActions.push(action)
          confirmedSolved += 1
        }
        await this.options.repository.linkVerifiedActivityAction(
          authUserId,
          verifiedProvider,
          event.externalId,
          action.id,
        )
      }

      this.logger.info('provider_verified_activity_sync_succeeded', {
        service: 'core-api',
        provider: verifiedProvider,
        complete: activity.complete,
        discovered: activity.events.length,
        added: saved.added.length,
        confirmedSolved,
        durationMs: Math.max(0, Date.now() - startedAtMs),
      })
      return {
        provider: activityProvider,
        discovered: activity.events.length,
        added: saved.added.length,
        confirmedSolved,
        complete: activity.complete,
        syncedAt: attemptedAt,
        nextAllowedAt: new Date(
          attemptedAt.getTime() + this.minRefreshIntervalMs,
        ),
        account: saved.record,
      }
    } catch (error) {
      if (
        error instanceof ProviderActivityChangedError ||
        error instanceof ProviderActivityCooldownError ||
        error instanceof ProviderActivityConsentRequiredError
      ) {
        throw error
      }
      const providerError =
        error instanceof ProviderPublicStatsError
          ? error
          : new ProviderPublicStatsError(
              'The provider verified-activity refresh failed.',
              {
                provider,
                code: 'PROVIDER_UNAVAILABLE',
                retryable: true,
                cause: error,
              },
            )
      const saved = await this.options.repository.saveVerifiedActivityFailure(
        authUserId,
        provider,
        account.externalHandle,
        {
          errorCode: providerError.code,
          attemptedAt,
          ...(providerError.retryable
            ? {
                retryAfter: new Date(
                  attemptedAt.getTime() + this.minRefreshIntervalMs,
                ),
              }
            : {}),
        },
      )
      if (saved === null) throw new ProviderActivityChangedError()
      this.logger.warn('provider_verified_activity_sync_failed', {
        service: 'core-api',
        provider,
        errorCode: providerError.code,
        retryable: providerError.retryable,
        durationMs: Math.max(0, Date.now() - startedAtMs),
      })
      throw providerError
    }
  }
}

export type ProviderActivitySyncResult = {
  provider: 'codeforces'
  discovered: number
  added: number
  confirmedSolved: number
  complete: boolean
  syncedAt: Date
  nextAllowedAt: Date
  account: ProviderAccountRecord
}
