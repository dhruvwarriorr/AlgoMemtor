import type {
  ExternalContest,
  ProviderFreshness,
  ProviderKey,
  ProviderWarning,
} from '@algomemtor/shared-contracts'

export type ProviderContestQuery = {
  status?: ExternalContest['status']
  startsAfter?: Date
  endsBefore?: Date
  limit?: number
}

export type ContestProviderRequest = {
  signal?: AbortSignal
  requestId?: string
}

export type ContestRefreshResult = {
  contests: ExternalContest[]
  warnings?: ProviderWarning[]
  complete?: boolean
}

export type ContestProviderSearchResult = {
  contests: ExternalContest[]
  freshness: ProviderFreshness
  warnings: ProviderWarning[]
}

export interface ContestProvider {
  readonly key: ProviderKey
  list(
    query?: ProviderContestQuery,
    request?: ContestProviderRequest,
  ): Promise<ContestProviderSearchResult>
  getHealth(): ProviderFreshness
}
