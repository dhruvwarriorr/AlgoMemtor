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

export interface ProblemMetadataCache {
  findByProvider(provider: ProviderKey): Promise<PersistedProblemCatalog | null>
  replaceProviderCatalog(catalog: PersistedProblemCatalog): Promise<void>
}
