import { describe, expect, it } from 'vitest'

import { InMemoryProviderAccountRepository } from '../repositories/provider-account-repository.js'
import { InMemoryProviderSyncRepository } from '../repositories/provider-sync-repository.js'
import { ProviderSyncService } from './provider-sync-service.js'

const userId = '00000000-0000-4000-8000-000000000001'
const now = new Date('2026-09-21T08:00:00.000Z')

describe('ProviderSyncService', () => {
  it('queues a first sync immediately without using the manual cooldown', async () => {
    const providerAccountRepository = new InMemoryProviderAccountRepository(
      () => now,
    )
    const account = await providerAccountRepository.upsertByAuthUserId(
      userId,
      'codeforces',
      'tourist',
    )
    const repository = new InMemoryProviderSyncRepository()
    const service = new ProviderSyncService({
      repository,
      providerAccountRepository,
      now: () => now,
    })

    const initial = await service.requestInitialSync(userId, 'codeforces')
    const manual = await service.requestManualSync(userId, 'codeforces')

    expect(initial.accepted).toBe(true)
    expect(initial.job.jobType).toBe('initial_sync')
    expect(initial.job.providerAccountId).toBe(account.id)
    expect(initial.job.status).toBe('queued')
    expect(manual.data.accepted).toBe(true)
    expect(
      (
        await repository.findLatest(
          userId,
          'codeforces',
          account.id,
          'manual_sync',
        )
      )?.jobType,
    ).toBe('manual_sync')
  })

  it('allows a manual sync while a scheduled job is queued', async () => {
    const providerAccountRepository = new InMemoryProviderAccountRepository(
      () => now,
    )
    const account = await providerAccountRepository.upsertByAuthUserId(
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
    const service = new ProviderSyncService({
      repository,
      providerAccountRepository,
      now: () => now,
    })

    const first = await service.requestManualSync(userId, 'codeforces')
    const second = await service.requestManualSync(userId, 'codeforces')

    expect(first.data.accepted).toBe(true)
    expect(first.data.job.runAfter).toBeDefined()
    expect(second.data.accepted).toBe(false)
    expect(second.data.job.id).toBe(first.data.job.id)
  })
})
