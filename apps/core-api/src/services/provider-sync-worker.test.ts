import { describe, expect, it, vi } from 'vitest'

import { InMemoryProviderAccountRepository } from '../repositories/provider-account-repository.js'
import { InMemoryProviderSyncRepository } from '../repositories/provider-sync-repository.js'
import { ProviderAccountStatsService } from './provider-account-stats-service.js'
import { ProviderSyncWorker } from './provider-sync-worker.js'

const userId = '00000000-0000-4000-8000-000000000001'

describe('ProviderSyncWorker', () => {
  it('does not duplicate an existing future scheduled sync after a manual run', async () => {
    const now = new Date()
    const accountRepository = new InMemoryProviderAccountRepository()
    const account = await accountRepository.upsertByAuthUserId(
      userId,
      'codeforces',
      'tourist',
    )
    const repository = new InMemoryProviderSyncRepository()
    await repository.enqueue({
      userId,
      providerAccountId: account.id,
      provider: 'codeforces',
      capability: 'linked_user_sync',
      jobType: 'linked_user_sync',
      idempotencyKey: 'scheduled-test',
      runAfter: new Date(now.getTime() + 60 * 60 * 1000),
    })
    await repository.enqueue({
      userId,
      providerAccountId: account.id,
      provider: 'codeforces',
      capability: 'linked_user_sync',
      jobType: 'manual_sync',
      idempotencyKey: 'manual-test',
      runAfter: new Date(now.getTime() - 1000),
    })
    const enqueue = vi.spyOn(repository, 'enqueue')
    const statsService = new ProviderAccountStatsService({
      repository: accountRepository,
      now: () => now,
      fetchers: [
        {
          provider: 'codeforces',
          fetchSolvedCount: async () => ({
            solvedCount: 1,
            complete: true,
            source: 'codeforces_api',
            fetchedAt: now,
          }),
        },
      ],
    })
    const worker = new ProviderSyncWorker({
      repository,
      providerAccountRepository: accountRepository,
      statsService,
      now: () => now,
    })

    expect(await worker.processOnce()).toBe(true)
    expect(enqueue).not.toHaveBeenCalled()
    expect(
      (await repository.findLatest(userId, 'codeforces', account.id, 'manual_sync'))
        ?.status,
    ).toBe('completed')
  })
})
