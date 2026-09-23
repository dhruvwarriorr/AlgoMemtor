import { describe, expect, it } from 'vitest'

import type { ProviderActivityDataFetcher } from '../integrations/provider-accounts/provider-public-stats.js'
import { InMemoryLearnerActivityRepository } from '../repositories/learner-activity-repository.js'
import { InMemoryProviderAccountRepository } from '../repositories/provider-account-repository.js'
import { InMemoryProviderDataRepository } from '../repositories/provider-data-repository.js'
import { InMemoryProviderSyncRepository } from '../repositories/provider-sync-repository.js'
import { CoachLiveRefreshService } from './coach-live-refresh-service.js'
import { LearnerActivityService } from './learner-activity-service.js'

const learner = '00000000-0000-4000-8000-000000000001'
const provenance = {
  provider: 'codeforces' as const,
  providerId: '9',
  canonicalUrl: 'https://codeforces.com/problemset/problem/1/A',
  sourceUrl: 'https://codeforces.com/api/user.status',
  extractionStrategy: 'official_json' as const,
  schemaVersion: 'test',
  completeness: 'complete' as const,
  fetchedAt: '2026-09-23T00:00:00.000Z',
  stale: false,
}

const setup = async (fetcher: ProviderActivityDataFetcher) => {
  let now = new Date('2026-09-23T12:00:00.000Z').getTime()
  const accounts = new InMemoryProviderAccountRepository()
  const account = await accounts.upsertByAuthUserId(
    learner,
    'codeforces',
    'learner',
  )
  const data = new InMemoryProviderDataRepository()
  const activity = new LearnerActivityService({
    repository: new InMemoryLearnerActivityRepository(),
    accountRepository: accounts,
    dataRepository: data,
    logger: { info: () => {}, warn: () => {} },
  })
  const service = new CoachLiveRefreshService({
    accountRepository: accounts,
    dataRepository: data,
    syncRepository: new InMemoryProviderSyncRepository(),
    activityFetchers: [fetcher],
    refreshDigest: async (id) => (await activity.refresh(id)).digest,
    logger: { info: () => {}, warn: () => {} },
    now: () => new Date(now),
  })
  return {
    service,
    account,
    accounts,
    data,
    advance: (ms: number) => {
      now += ms
    },
  }
}

const fetcher = (calls: { count: number }): ProviderActivityDataFetcher => ({
  provider: 'codeforces',
  fetchActivityData: async (_handle, _signal, options) => {
    calls.count += 1
    expect(options?.backfillOnly).toBe(true)
    return {
      submissions: [
        {
          provider: 'codeforces',
          externalId: '1A',
          eventId: '9',
          problemTitle: 'Theatre Square',
          canonicalUrl: provenance.canonicalUrl,
          verdict: 'OK',
          occurredAt: '2026-09-23T11:59:00.000Z',
          isAccepted: true,
          completeness: 'complete',
          provenance,
        },
      ],
      solvedProblems: [],
      ratingChanges: [],
      contestParticipations: [],
      complete: true,
      fetchedAt: new Date('2026-09-23T12:00:00.000Z'),
    }
  },
})

describe('CoachLiveRefreshService', () => {
  it('fetches and stores the newest data, then honors the cooldown', async () => {
    const calls = { count: 0 }
    const { service, data, advance } = await setup(fetcher(calls))

    const first = await service.refresh(learner, 'codeforces')
    expect(first).toMatchObject({
      status: 'refreshed',
      newSubmissions: 1,
      latestSubmissions: [{ problem: 'Theatre Square', accepted: true }],
      totals: { solved: 1, submissions: 1 },
    })
    expect(await data.listSubmissions(learner)).toHaveLength(1)

    advance(60_000)
    expect((await service.refresh(learner, 'codeforces')).status).toBe(
      'recently_refreshed',
    )
    advance(3 * 60_000)
    expect(await service.refresh(learner, 'codeforces')).toMatchObject({
      status: 'refreshed',
      newSubmissions: 0,
    })
    expect(calls.count).toBe(2)
  })

  it('explains connector-only and unlinked providers without fetching', async () => {
    const calls = { count: 0 }
    const { service, accounts } = await setup(fetcher(calls))

    expect((await service.refresh(learner, 'leetcode')).status).toBe(
      'not_linked',
    )
    await accounts.upsertByAuthUserId(learner, 'cses', '12345')
    expect(await service.refresh(learner, 'cses')).toMatchObject({
      status: 'browser_connector',
      message: expect.stringContaining('has not uploaded yet'),
    })
    expect(calls.count).toBe(0)
  })

  it('falls back to stored data when the provider fails', async () => {
    const { service } = await setup({
      provider: 'codeforces',
      fetchActivityData: async () => {
        throw new Error('offline')
      },
    })
    expect(await service.refresh(learner, 'codeforces')).toMatchObject({
      status: 'unavailable',
      latestSubmissions: [],
    })
  })
})
