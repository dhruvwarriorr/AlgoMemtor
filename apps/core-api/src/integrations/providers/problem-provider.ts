import type {
  ExternalProblemCatalogQueryParams,
  ExternalProblemSummary,
  ProviderFreshness,
  ProviderKey,
  ProviderWarning,
  ProblemContent,
} from '@algomemtor/shared-contracts'

import type { CommunitySolutionLink } from './community-solutions.js'
import type {
  ContestProblemLink,
  ContestProblemsHint,
} from './contest-problems.js'

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

export type ProblemContentResult = {
  content: ProblemContent | null
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
  getContent?(
    externalId: string,
    request?: ProblemProviderRequest,
  ): Promise<ProblemContentResult>
  // Top solutions in one language from the platform's own public API.
  communitySolutions?(
    externalId: string,
    language: string,
    request?: ProblemProviderRequest,
  ): Promise<CommunitySolutionLink[]>
  // Every problem of one contest in contest order, for upsolving.
  contestProblems?(
    contestCode: string,
    hint: ContestProblemsHint,
    request?: ProblemProviderRequest,
  ): Promise<ContestProblemLink[]>
}
