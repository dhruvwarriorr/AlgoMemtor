import type {
  LinkableProvider,
  ContestParticipation,
  ProviderProfile,
  ProviderRatingChange,
  ProviderSolvedProblem,
  ProviderSubmission,
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

export type ProviderActivityDataFetchResult = {
  submissions: ProviderSubmission[]
  solvedProblems: ProviderSolvedProblem[]
  ratingChanges: ProviderRatingChange[]
  contestParticipations: ContestParticipation[]
  complete: boolean
  fetchedAt: Date
  // Opaque resume point for the next fetch. It must never let a later fetch
  // skip unstored submissions: it either marks the whole history as stored,
  // or records where an unfinished backfill of older history continues.
  cursor?: string
  // Set when history is still being backfilled in parts: run a short
  // continuation after this delay instead of waiting for the next hourly sync.
  continueAfterMs?: number
}

export type ProviderActivityFetchOptions = {
  cursor?: string
  // A continuation run: only advance the history backfill.
  backfillOnly?: boolean
}

export type ProviderProblemTags = {
  providerTags: string[]
  topics: string[]
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

export interface ProviderProfileFetcher {
  readonly provider: LinkableProvider
  fetchProfile(
    handle: PublicProviderHandle,
    signal?: AbortSignal,
  ): Promise<ProviderProfile>
}

export interface ProviderActivityDataFetcher {
  readonly provider: LinkableProvider
  fetchActivityData(
    handle: PublicProviderHandle,
    signal?: AbortSignal,
    options?: ProviderActivityFetchOptions,
  ): Promise<ProviderActivityDataFetchResult>
  // Look up public tags for already-stored solved problems. `null` means the
  // lookup succeeded but found no usable tags; an ID that is absent was not
  // looked up (for example, after a rate limit) and should be tried again.
  fetchProblemTags?(
    externalIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<Map<string, ProviderProblemTags | null>>
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
