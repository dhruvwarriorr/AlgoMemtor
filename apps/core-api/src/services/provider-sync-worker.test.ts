import { describe, expect, it, vi } from 'vitest'

import type { ProviderSolvedProblem } from '@algomemtor/shared-contracts'

import type { ProviderActivityDataFetcher } from '../integrations/provider-accounts/provider-public-stats.js'
import { InMemoryProviderAccountRepository } from '../repositories/provider-account-repository.js'
import { InMemoryProviderDataRepository } from '../repositories/provider-data-repository.js'
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

  const solved = (
    externalId: string,
    occurredAt: string | null,
    tags?: string[],
  ): ProviderSolvedProblem => ({
    provider: 'codechef',
    externalId,
    canonicalUrl: `https://www.codechef.com/problems/${externalId}`,
    occurredAt,
    firstObservedAt: '2026-09-01T00:00:00.000Z',
    lastObservedAt: '2026-09-01T00:00:00.000Z',
    ...(tags === undefined ? {} : { providerTags: tags, topics: tags }),
    completeness: 'complete',
    provenance: {
      provider: 'codechef',
      providerId: externalId,
      canonicalUrl: `https://www.codechef.com/problems/${externalId}`,
      sourceUrl: 'https://www.codechef.com/recent/user',
      extractionStrategy: 'official_json',
      schemaVersion: 'test',
      completeness: 'complete',
      fetchedAt: '2026-09-01T00:00:00.000Z',
      stale: false,
    },
  })

  const setup = async (
    fetcher: ProviderActivityDataFetcher,
    clock: () => Date = () => new Date('2026-09-23T00:00:00.000Z'),
  ) => {
    const now = clock()
    const accountRepository = new InMemoryProviderAccountRepository()
    const account = await accountRepository.upsertByAuthUserId(
      userId,
      'codechef',
      'learner',
    )
    await accountRepository.grantPublicStatsConsent(
      userId,
      'codechef',
      'learner',
      now,
    )
    const repository = new InMemoryProviderSyncRepository()
    const dataRepository = new InMemoryProviderDataRepository()
    const statsService = new ProviderAccountStatsService({
      repository: accountRepository,
      now: () => now,
      fetchers: [
        {
          provider: 'codechef',
          fetchSolvedCount: async () => ({
            solvedCount: 2,
            complete: true,
            source: 'codechef_public_profile_html',
            fetchedAt: now,
          }),
        },
      ],
    })
    const worker = new ProviderSyncWorker({
      repository,
      providerAccountRepository: accountRepository,
      statsService,
      dataRepository,
      activityFetchers: [fetcher],
      logger: { info: () => {}, warn: () => {} },
      now: clock,
    })
    const enqueue = (key: string) =>
      repository.enqueue({
        userId,
        providerAccountId: account.id,
        provider: 'codechef',
        capability: 'linked_user_sync',
        jobType: 'manual_sync',
        idempotencyKey: key,
        runAfter: new Date(now.getTime() - 1000),
      })
    return {
      account,
      repository,
      dataRepository,
      worker,
      enqueue,
      statsService,
    }
  }

  it('resumes activity from the stored cursor and backfills tags', async () => {
    const cursors: Array<string | undefined> = []
    const fetcher: ProviderActivityDataFetcher = {
      provider: 'codechef',
      fetchActivityData: async (_handle, _signal, options) => {
        cursors.push(options?.cursor)
        return {
          submissions: [],
          solvedProblems: [
            solved('FLOW', '2026-09-10T00:00:00.000Z'),
            solved('ADDIS', '2026-09-05T00:00:00.000Z'),
          ],
          ratingChanges: [],
          contestParticipations: [],
          complete: true,
          fetchedAt: new Date(),
          cursor: String(100 + cursors.length),
        }
      },
      fetchProblemTags: async (ids) =>
        new Map(
          ids.map((id) => [
            id,
            id === 'FLOW'
              ? { providerTags: ['Graphs'], topics: ['graphs'] }
              : null,
          ]),
        ),
    }
    const { account, repository, dataRepository, worker, enqueue } =
      await setup(fetcher)

    await enqueue('first')
    await worker.processOnce()
    await enqueue('second')
    await worker.processOnce()

    expect(cursors).toEqual([undefined, '101'])
    expect(
      (await repository.getState(userId, 'codechef', account.id)).cursor,
    ).toBe('102')
    const stored = await dataRepository.listSolvedProblems(userId, 'codechef')
    expect(stored.find((item) => item.externalId === 'FLOW')).toMatchObject({
      providerTags: ['Graphs'],
    })
    // ADDIS was checked and had no tags, so it waits for the weekly recheck.
    expect(
      await dataRepository.listUntaggedSolvedIds(
        userId,
        account.id,
        10,
        new Date('2026-09-23T00:00:00.000Z'),
      ),
    ).toEqual([])
  })

  it('keeps the previous cursor when an activity fetch fails', async () => {
    let calls = 0
    const fetcher: ProviderActivityDataFetcher = {
      provider: 'codechef',
      fetchActivityData: async () => {
        calls += 1
        if (calls > 1) throw new Error('offline')
        return {
          submissions: [],
          solvedProblems: [],
          ratingChanges: [],
          contestParticipations: [],
          complete: true,
          fetchedAt: new Date(),
          cursor: '55',
        }
      },
    }
    const { account, repository, worker, enqueue } = await setup(fetcher)

    await enqueue('first')
    await worker.processOnce()
    await enqueue('second')
    await worker.processOnce()

    expect(calls).toBe(2)
    expect(
      (await repository.getState(userId, 'codechef', account.id)).cursor,
    ).toBe('55')
  })

  it('continues an unfinished backfill in short steps until it stops progressing', async () => {
    const calls: Array<{ cursor?: string; backfillOnly?: boolean }> = []
    const cursors = ['v2:10:5:4', 'v2:10:5:2', 'v2:10:5:2']
    const fetcher: ProviderActivityDataFetcher = {
      provider: 'codechef',
      fetchActivityData: async (_handle, _signal, options) => {
        calls.push({
          ...(options?.cursor === undefined ? {} : { cursor: options.cursor }),
          ...(options?.backfillOnly === undefined
            ? {}
            : { backfillOnly: options.backfillOnly }),
        })
        const cursor = cursors[calls.length - 1] ?? 'v2:10:5:2'
        return {
          submissions: [],
          solvedProblems: [],
          ratingChanges: [],
          contestParticipations: [],
          complete: false,
          fetchedAt: new Date(),
          cursor,
          continueAfterMs: 120_000,
        }
      },
    }
    let clock = new Date('2026-09-23T00:00:00.000Z').getTime()
    const { account, repository, worker, enqueue, statsService } = await setup(
      fetcher,
      () => new Date(clock),
    )
    const statsRefresh = vi.spyOn(statsService, 'refresh')

    await enqueue('first')
    await worker.processOnce()
    const continuation = await repository.findLatest(
      userId,
      'codechef',
      account.id,
      'backfill_continuation',
    )
    expect(continuation?.status).toBe('queued')

    // Let each queued continuation come due. (The hourly sync is an hour
    // away, so only continuations can run.)
    const runDue = async () => {
      clock += 3 * 60 * 1000
      return worker.processOnce()
    }
    expect(await runDue()).toBe(true)
    expect(await runDue()).toBe(true)
    // The last continuation made no progress, so nothing else is queued.
    expect(await runDue()).toBe(false)

    expect(calls).toEqual([
      {},
      { cursor: 'v2:10:5:4', backfillOnly: true },
      { cursor: 'v2:10:5:2', backfillOnly: true },
    ])
    // Only the first, full sync refreshed the solved count.
    expect(statsRefresh).toHaveBeenCalledTimes(1)
  })
})

describe('InMemoryProviderDataRepository solved merge', () => {
  it('keeps the earliest solve and existing tags when a later window lacks them', async () => {
    const repository = new InMemoryProviderDataRepository()
    const base = {
      provider: 'codechef' as const,
      externalId: 'FLOW',
      canonicalUrl: 'https://www.codechef.com/problems/FLOW',
      firstObservedAt: '2026-09-01T00:00:00.000Z',
      lastObservedAt: '2026-09-01T00:00:00.000Z',
      completeness: 'complete' as const,
      provenance: {
        provider: 'codechef' as const,
        providerId: 'FLOW',
        canonicalUrl: 'https://www.codechef.com/problems/FLOW',
        sourceUrl: 'https://www.codechef.com/recent/user',
        extractionStrategy: 'official_json' as const,
        schemaVersion: 'test',
        completeness: 'complete' as const,
        fetchedAt: '2026-09-01T00:00:00.000Z',
        stale: false,
      },
    }
    await repository.saveSolvedProblems(userId, 'account', [
      {
        ...base,
        occurredAt: '2026-01-01T00:00:00.000Z',
        sourceSubmissionId: '1',
        providerTags: ['Graphs'],
        topics: ['graphs'],
      },
    ])
    await repository.saveSolvedProblems(userId, 'account', [
      {
        ...base,
        occurredAt: '2026-09-01T00:00:00.000Z',
        sourceSubmissionId: '9',
        lastObservedAt: '2026-09-20T00:00:00.000Z',
      },
    ])

    expect(await repository.listSolvedProblems(userId)).toMatchObject([
      {
        occurredAt: '2026-01-01T00:00:00.000Z',
        sourceSubmissionId: '1',
        providerTags: ['Graphs'],
        lastObservedAt: '2026-09-20T00:00:00.000Z',
      },
    ])
  })
})
