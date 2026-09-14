import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createPrismaClient,
  type CorePrismaClient,
} from '../database/prisma.js'
import type { ProviderVerifiedActivityFetcher } from '../integrations/provider-accounts/provider-public-stats.js'
import { PrismaProblemActionRepository } from './problem-action-repository.js'
import { PrismaProviderAccountRepository } from './provider-account-repository.js'
import { ProviderActivityService } from '../services/provider-activity-service.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const firstUserId = '00000000-0000-4000-8000-000000000098'
const secondUserId = '00000000-0000-4000-8000-000000000099'

describe.skipIf(testDatabaseUrl === undefined)(
  'provider activity persistence',
  () => {
    let prisma: CorePrismaClient

    beforeAll(async () => {
      prisma = createPrismaClient({
        url: testDatabaseUrl as string,
        poolMax: 2,
        connectionTimeoutMs: 5_000,
      })
      await prisma.$connect()
    })

    afterAll(async () => {
      await prisma?.$disconnect()
    })

    const cleanup = async (authUserId: string) => {
      await prisma.coreUser.deleteMany({ where: { authUserId } })
    }

    const createService = (now: Date) => {
      const providerAccounts = new PrismaProviderAccountRepository(prisma)
      const actions = new PrismaProblemActionRepository(prisma)
      const fetcher: ProviderVerifiedActivityFetcher = {
        provider: 'codeforces',
        fetchVerifiedActivity: async () => ({
          events: [
            {
              externalId: '1900A',
              providerEventId: '1900001',
              occurredAt: new Date('2026-09-13T10:00:00.000Z'),
            },
          ],
          complete: true,
          fetchedAt: now,
        }),
      }
      const service = new ProviderActivityService({
        repository: providerAccounts,
        actionRepository: actions,
        fetchers: [fetcher],
        now: () => now,
        minRefreshIntervalMs: 0,
        logger: { info: () => {}, warn: () => {}, error: () => {} },
      })
      return { providerAccounts, actions, service }
    }

    it('persists accepted activity idempotently and isolates owners', async () => {
      await cleanup(firstUserId)
      await cleanup(secondUserId)
      const now = new Date('2026-09-14T10:00:00.000Z')
      const { providerAccounts, actions, service } = createService(now)

      await providerAccounts.upsertByAuthUserId(
        firstUserId,
        'codeforces',
        'database_activity_first',
      )
      await providerAccounts.upsertByAuthUserId(
        secondUserId,
        'codeforces',
        'database_activity_second',
      )
      await service.setConsent(firstUserId, 'codeforces', true)
      await service.sync(firstUserId, 'codeforces')
      const repeated = await service.sync(firstUserId, 'codeforces')

      expect(repeated).toMatchObject({ added: 0, confirmedSolved: 0 })
      expect(await actions.listByAuthUserId(firstUserId)).toHaveLength(1)
      expect(await actions.listByAuthUserId(secondUserId)).toEqual([])
      expect(
        await providerAccounts.listVerifiedActivityByAuthUserId(firstUserId),
      ).toMatchObject([
        {
          externalId: '1900A',
          providerEventId: '1900001',
          progressActionId: expect.any(String),
        },
      ])
    })

    it('revokes activity, disconnects, and cascades account evidence', async () => {
      await cleanup(firstUserId)
      const now = new Date('2026-09-14T11:00:00.000Z')
      const { providerAccounts, actions, service } = createService(now)

      await providerAccounts.upsertByAuthUserId(
        firstUserId,
        'codeforces',
        'database_activity_cleanup',
      )
      await service.setConsent(firstUserId, 'codeforces', true)
      await service.sync(firstUserId, 'codeforces')
      await service.setConsent(firstUserId, 'codeforces', false)

      expect(
        await providerAccounts.listVerifiedActivityByAuthUserId(firstUserId),
      ).toEqual([])
      expect(await actions.listByAuthUserId(firstUserId)).toEqual([])

      await service.setConsent(firstUserId, 'codeforces', true)
      await service.sync(firstUserId, 'codeforces')
      await providerAccounts.deleteByAuthUserId(firstUserId, 'codeforces')
      await actions.deleteProviderVerifiedByAuthUserId(
        firstUserId,
        'codeforces',
      )

      expect(
        await providerAccounts.findByAuthUserIdAndProvider(
          firstUserId,
          'codeforces',
        ),
      ).toBeNull()
      expect(
        await providerAccounts.listVerifiedActivityByAuthUserId(firstUserId),
      ).toEqual([])
      expect(await actions.listByAuthUserId(firstUserId)).toEqual([])
      await cleanup(firstUserId)
      await cleanup(secondUserId)
    })
  },
)
