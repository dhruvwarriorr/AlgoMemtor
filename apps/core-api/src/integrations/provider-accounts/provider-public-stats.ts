import type {
  LinkableProvider,
  ProviderPublicStatsErrorCode,
  ProviderPublicStatsSource,
  PublicProviderHandle,
} from '@algomemtor/shared-contracts'

export type ProviderVerifiedActivityEvent = {
  externalId: string
  providerEventId: string
  occurredAt: Date
}

export type ProviderVerifiedActivityFetchResult = {
  events: ProviderVerifiedActivityEvent[]
  complete: boolean
  fetchedAt: Date
}

export type ProviderPublicStatsFetchResult = {
  solvedCount: number
  complete: boolean
  source: ProviderPublicStatsSource
  fetchedAt: Date
}

export interface ProviderPublicStatsFetcher {
  readonly provider: LinkableProvider
  fetchSolvedCount(
    handle: PublicProviderHandle,
    signal?: AbortSignal,
  ): Promise<ProviderPublicStatsFetchResult>
}

export interface ProviderVerifiedActivityFetcher {
  readonly provider: LinkableProvider
  fetchVerifiedActivity(
    handle: PublicProviderHandle,
    signal?: AbortSignal,
  ): Promise<ProviderVerifiedActivityFetchResult>
}

export class ProviderPublicStatsError extends Error {
  readonly provider: LinkableProvider
  readonly code: ProviderPublicStatsErrorCode
  readonly retryable: boolean

  constructor(
    message: string,
    options: {
      provider: LinkableProvider
      code: ProviderPublicStatsErrorCode
      retryable: boolean
      cause?: unknown
    },
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    )
    this.name = 'ProviderPublicStatsError'
    this.provider = options.provider
    this.code = options.code
    this.retryable = options.retryable
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
