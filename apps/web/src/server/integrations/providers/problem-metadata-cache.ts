import type {
  ExternalProblemSummary,
  ProviderAvailability,
  ProviderKey,
} from '@algomemtor/shared-contracts'

export type PersistedProblemCatalog = {
  provider: ProviderKey
  problems: ExternalProblemSummary[]
  availability: ProviderAvailability
  fetchedAtMs: number
  expiresAtMs: number
}

export type ProblemReference = {
  provider: ProviderKey
  externalId: string
}

export interface ProblemMetadataCache {
  findByProvider(provider: ProviderKey): Promise<PersistedProblemCatalog | null>
  findByReferences?(
    references: readonly ProblemReference[],
  ): Promise<ExternalProblemSummary[]>
  replaceProviderCatalog(catalog: PersistedProblemCatalog): Promise<void>
}
