import type {
  ContestParticipation,
  ProblemContent,
  ProviderFreshness,
  ProviderKey,
  ProviderProfile,
  ProviderRatingChange,
  ProviderSubmission,
  ProviderSolvedProblem,
} from '@algomemtor/shared-contracts'

import type {
  ProblemProviderRequest,
  ProblemProviderSearchResult,
  ProviderProblemQuery,
} from './problem-provider.js'
import type {
  ContestProviderRequest,
  ContestProviderSearchResult as ContestSearchResult,
  ProviderContestQuery,
} from './contest-provider.js'

export const providerCapabilityNames = [
  'catalog',
  'problem_content',
  'profile',
  'submissions',
  'solved_problems',
  'rating_history',
  'contests',
  'contest_participation',
] as const

export type ProviderCapability = (typeof providerCapabilityNames)[number]

export type ProviderCapabilityStatus =
  | 'supported'
  | 'unsupported'
  | 'temporarily_unavailable'
  | 'incomplete'
  | 'disabled'

export type ProviderCapabilityMap = Readonly<
  Record<ProviderCapability, ProviderCapabilityStatus>
>

export type ProviderAdapterRequest = ProblemProviderRequest &
  ContestProviderRequest

export interface ProviderAdapter {
  readonly key: ProviderKey
  readonly capabilities: ProviderCapabilityMap
  getHealth(): ProviderFreshness
  searchProblems?(
    query: ProviderProblemQuery,
    request?: ProviderAdapterRequest,
  ): Promise<ProblemProviderSearchResult>
  getProblemContent?(
    externalId: string,
    request?: ProviderAdapterRequest,
  ): Promise<{ content: ProblemContent | null; freshness: ProviderFreshness }>
  fetchProfile?(
    handle: string,
    request?: ProviderAdapterRequest,
  ): Promise<ProviderProfile>
  fetchSubmissions?(
    handle: string,
    request?: ProviderAdapterRequest,
  ): Promise<ProviderSubmission[]>
  fetchSolvedProblems?(
    handle: string,
    request?: ProviderAdapterRequest,
  ): Promise<ProviderSolvedProblem[]>
  fetchRatingHistory?(
    handle: string,
    request?: ProviderAdapterRequest,
  ): Promise<ProviderRatingChange[]>
  listContests?(
    query?: ProviderContestQuery,
    request?: ContestProviderRequest,
  ): Promise<ContestSearchResult>
  fetchContestParticipation?(
    handle: string,
    request?: ProviderAdapterRequest,
  ): Promise<ContestParticipation[]>
}

export const unsupportedProviderCapabilities = (): ProviderCapabilityMap =>
  Object.fromEntries(
    providerCapabilityNames.map((capability) => [capability, 'unsupported']),
  ) as ProviderCapabilityMap
