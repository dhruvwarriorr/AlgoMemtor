import { describe, expect, it, vi } from 'vitest'

import type { ProviderVerifiedActivityFetcher } from '../integrations/provider-accounts/provider-public-stats.js'
import { ProviderPublicStatsError } from '../integrations/provider-accounts/provider-public-stats.js'
import { InMemoryProblemActionRepository } from '../repositories/problem-action-repository.js'
import { InMemoryProviderAccountRepository } from '../repositories/provider-account-repository.js'
import {
  ProviderActivityChangedError,
  ProviderActivityCooldownError,
  ProviderActivityService,
} from './provider-activity-service.js'

const learnerId = '00000000-0000-4000-8000-000000000001'

describe('ProviderActivityService', () => {
  it('requires consent, appends accepted evidence once, and is idempotent', async () => {
    let now = new Date('2026-09-14T10:00:00.000Z')
    const repository = new InMemoryProviderAccountRepository(() => now)
    const actionRepository = new InMemoryProblemActionRepository(() => now)
    const fetcher: ProviderVerifiedActivityFetcher = {
      provider: 'codeforces',
      fetchVerifiedActivity: vi.fn(async () => ({
        events: [
          {
            externalId: 'contest:1:A',
            providerEventId: '10',
            occurredAt: new Date('2026-09-13T10:00:00.000Z'),
          },
        ],
        complete: true,
        fetchedAt: now,
      })),
    }
    const service = new ProviderActivityService({
      repository,
      actionRepository,
      fetchers: [fetcher],
      now: () => now,
      minRefreshIntervalMs: 1_000,
    })

    await repository.upsertByAuthUserId(learnerId, 'codeforces', 'tourist')
    await expect(service.sync(learnerId, 'codeforces')).rejects.toThrow(
      'Explicit consent',
    )
    await service.setConsent(learnerId, 'codeforces', true)

    await expect(service.sync(learnerId, 'codeforces')).resolves.toMatchObject({
      discovered: 1,
      added: 1,
      confirmedSolved: 1,
    })
    const firstActions = await actionRepository.listByAuthUserId(learnerId)
    expect(firstActions).toHaveLength(1)
    expect(firstActions[0]).toMatchObject({
      learnerStatus: 'solved',
      evidenceSource: 'provider_verified',
    })

    now = new Date('2026-09-14T10:00:01.000Z')
    await expect(service.sync(learnerId, 'codeforces')).resolves.toMatchObject({
      discovered: 1,
      added: 0,
      confirmedSolved: 0,
    })
    expect(await actionRepository.listByAuthUserId(learnerId)).toHaveLength(1)
  })

  it('returns a cooldown after a recent attempt', async () => {
    let now = new Date('2026-09-14T10:00:00.000Z')
    const repository = new InMemoryProviderAccountRepository(() => now)
    const actionRepository = new InMemoryProblemActionRepository(() => now)
    const fetcher: ProviderVerifiedActivityFetcher = {
      provider: 'codeforces',
      fetchVerifiedActivity: async () => ({
        events: [],
        complete: true,
        fetchedAt: now,
      }),
    }
    const service = new ProviderActivityService({
      repository,
      actionRepository,
      fetchers: [fetcher],
      now: () => now,
      minRefreshIntervalMs: 900_000,
    })
    await repository.upsertByAuthUserId(learnerId, 'codeforces', 'tourist')
    await service.setConsent(learnerId, 'codeforces', true)
    await service.sync(learnerId, 'codeforces')
    now = new Date('2026-09-14T10:01:00.000Z')

    await expect(service.sync(learnerId, 'codeforces')).rejects.toBeInstanceOf(
      ProviderActivityCooldownError,
    )
  })

  it('removes provider evidence and generated actions when consent is revoked', async () => {
    let now = new Date('2026-09-14T10:00:00.000Z')
    const repository = new InMemoryProviderAccountRepository(() => now)
    const actionRepository = new InMemoryProblemActionRepository(() => now)
    const service = new ProviderActivityService({
      repository,
      actionRepository,
      fetchers: [
        {
          provider: 'codeforces',
          fetchVerifiedActivity: async () => ({
            events: [
              {
                externalId: 'contest:1:A',
                providerEventId: '10',
                occurredAt: new Date('2026-09-13T10:00:00.000Z'),
              },
            ],
            complete: true,
            fetchedAt: now,
          }),
        },
      ],
      now: () => now,
      minRefreshIntervalMs: 0,
    })

    await repository.upsertByAuthUserId(learnerId, 'codeforces', 'tourist')
    await actionRepository.appendByAuthUserId(learnerId, {
      provider: 'codeforces',
      externalId: 'contest:1:A',
      actionType: 'status_changed',
      learnerStatus: 'attempted',
      evidenceSource: 'manual',
    })
    await service.setConsent(learnerId, 'codeforces', true)
    await service.sync(learnerId, 'codeforces')
    expect(await actionRepository.listByAuthUserId(learnerId)).toHaveLength(2)

    await service.setConsent(learnerId, 'codeforces', false)
    expect(await actionRepository.listByAuthUserId(learnerId)).toHaveLength(1)
    expect(
      (await actionRepository.listByAuthUserId(learnerId))[0],
    ).toMatchObject({ evidenceSource: 'manual', learnerStatus: 'attempted' })
    expect(
      (await repository.findByAuthUserIdAndProvider(learnerId, 'codeforces'))
        ?.verifiedActivity.status,
    ).toBe('not_enabled')
  })

  it('keeps prior evidence when a later provider refresh fails', async () => {
    let now = new Date('2026-09-14T10:00:00.000Z')
    const repository = new InMemoryProviderAccountRepository(() => now)
    const actionRepository = new InMemoryProblemActionRepository(() => now)
    let calls = 0
    const service = new ProviderActivityService({
      repository,
      actionRepository,
      fetchers: [
        {
          provider: 'codeforces',
          fetchVerifiedActivity: async () => {
            calls += 1
            if (calls === 2) {
              throw new ProviderPublicStatsError('upstream failed', {
                provider: 'codeforces',
                code: 'PROVIDER_UNAVAILABLE',
                retryable: true,
              })
            }
            return {
              events: [
                {
                  externalId: 'contest:2:B',
                  providerEventId: '20',
                  occurredAt: new Date('2026-09-13T10:00:00.000Z'),
                },
              ],
              complete: true,
              fetchedAt: now,
            }
          },
        },
      ],
      now: () => now,
      minRefreshIntervalMs: 1_000,
    })

    await repository.upsertByAuthUserId(learnerId, 'codeforces', 'tourist')
    await service.setConsent(learnerId, 'codeforces', true)
    await service.sync(learnerId, 'codeforces')
    now = new Date('2026-09-14T10:00:02.000Z')

    await expect(service.sync(learnerId, 'codeforces')).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    })
    expect(await actionRepository.listByAuthUserId(learnerId)).toHaveLength(1)
    expect(
      (await repository.findByAuthUserIdAndProvider(learnerId, 'codeforces'))
        ?.verifiedActivity,
    ).toMatchObject({ status: 'error', acceptedProblemCount: 1 })
  })

  it('does not restore activity error state after consent is revoked in flight', async () => {
    let now = new Date('2026-09-14T10:00:00.000Z')
    const repository = new InMemoryProviderAccountRepository(() => now)
    const actionRepository = new InMemoryProblemActionRepository(() => now)
    let service: ProviderActivityService
    service = new ProviderActivityService({
      repository,
      actionRepository,
      fetchers: [
        {
          provider: 'codeforces',
          fetchVerifiedActivity: async () => {
            await service.setConsent(learnerId, 'codeforces', false)
            throw new ProviderPublicStatsError('upstream failed', {
              provider: 'codeforces',
              code: 'PROVIDER_UNAVAILABLE',
              retryable: true,
            })
          },
        },
      ],
      now: () => now,
      minRefreshIntervalMs: 0,
    })

    await repository.upsertByAuthUserId(learnerId, 'codeforces', 'tourist')
    await service.setConsent(learnerId, 'codeforces', true)

    await expect(service.sync(learnerId, 'codeforces')).rejects.toBeInstanceOf(
      ProviderActivityChangedError,
    )
    expect(
      (await repository.findByAuthUserIdAndProvider(learnerId, 'codeforces'))
        ?.verifiedActivity,
    ).toMatchObject({ enabled: false, status: 'not_enabled' })
  })
})
