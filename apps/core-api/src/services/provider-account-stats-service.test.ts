import { describe, expect, it, vi } from 'vitest'

import { InMemoryProviderAccountRepository } from '../repositories/provider-account-repository.js'
import { ProviderAccountStatsService } from './provider-account-stats-service.js'

const userId = '00000000-0000-4000-8000-000000000001'

describe('ProviderAccountStatsService', () => {
  it('does not disguise a persistence failure as a provider failure', async () => {
    const repository = new InMemoryProviderAccountRepository()
    await repository.upsertByAuthUserId(userId, 'codeforces', 'tourist')
    const persistenceError = new Error('database write failed')
    const saveFailure = vi.spyOn(repository, 'savePublicStatsFailure')
    vi.spyOn(repository, 'savePublicStatsSuccess').mockRejectedValue(
      persistenceError,
    )
    const service = new ProviderAccountStatsService({
      repository,
      fetchers: [
        {
          provider: 'codeforces',
          fetchSolvedCount: async () => ({
            solvedCount: 42,
            complete: true,
            source: 'codeforces_api',
            fetchedAt: new Date(),
          }),
        },
      ],
    })

    await expect(service.refresh(userId, 'codeforces')).rejects.toBe(
      persistenceError,
    )
    expect(saveFailure).not.toHaveBeenCalled()
  })
})
