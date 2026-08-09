import type {
  ExternalProblemCatalogQueryParams,
  ExternalProblemSummary,
  ProviderFreshness,
  ProviderKey,
  ProviderWarning,
} from '@algomemtor/shared-contracts'

export type ProblemProviderRequest = {
  signal?: AbortSignal
  requestId?: string
}

export type ProviderProblemQuery = Pick<
  ExternalProblemCatalogQueryParams,
  'search' | 'difficulty' | 'topic' | 'status' | 'minRating' | 'maxRating'
>

export type ProblemProviderSearchResult = {
  problems: ExternalProblemSummary[]
  freshness: ProviderFreshness
  warnings: ProviderWarning[]
}

export interface ProblemProvider {
  readonly key: ProviderKey
  search(
    query: ProviderProblemQuery,
    request?: ProblemProviderRequest,
  ): Promise<ProblemProviderSearchResult>
  getHealth(): ProviderFreshness
}
