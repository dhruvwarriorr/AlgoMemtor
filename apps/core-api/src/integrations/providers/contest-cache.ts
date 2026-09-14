import type {
  ExternalContest,
  ProviderAvailability,
  ProviderKey,
} from '@algomemtor/shared-contracts'

export type PersistedContestCatalog = {
  provider: ProviderKey
  contests: ExternalContest[]
  availability: ProviderAvailability
  fetchedAtMs: number
  expiresAtMs: number
}

export interface ContestCache {
  findByProvider(provider: ProviderKey): Promise<PersistedContestCatalog | null>
  replaceProviderCatalog(catalog: PersistedContestCatalog): Promise<void>
}
