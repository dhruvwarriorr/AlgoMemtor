import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createPrismaClient } from '../database/prisma.js'
import {
  PrismaLearnerProfileRepository,
  type LearnerProfileRepository,
} from './learner-profile-repository.js'
import {
  PrismaProviderAccountRepository,
  type ProviderAccountRepository,
} from './provider-account-repository.js'
import type { CorePrismaClient } from '../database/prisma.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL

const validProfile = {
  experience: 'beginner' as const,
  difficultyComfort: 'introductory' as const,
  goal: 'improve_problem_solving' as const,
  topicPreference: {
    mode: 'selected' as const,
    topics: ['implementation' as const],
  },
  preferredTopics: ['strings' as const],
  platformPreferences: {
    platforms: ['codeforces' as const],
    standings: [],
  },
  ratingComfortRange: {
    platform: 'codeforces' as const,
    min: 800,
    max: 1200,
  },
  learningPreferences: ['solve_problems_directly' as const],
}

describe.skipIf(testDatabaseUrl === undefined)(
  'Prisma core repositories',
  () => {
    let prisma: CorePrismaClient
    let learnerProfiles: LearnerProfileRepository
    let providerAccounts: ProviderAccountRepository

    beforeAll(async () => {
      prisma = createPrismaClient({
        url: testDatabaseUrl as string,
        poolMax: 2,
        connectionTimeoutMs: 5000,
      })
      await prisma.$connect()
      learnerProfiles = new PrismaLearnerProfileRepository(prisma)
      providerAccounts = new PrismaProviderAccountRepository(prisma)
    })

    afterAll(async () => {
      await prisma?.$disconnect()
    })

    it('persists profiles and provider stats across a client reconnect', async () => {
      const authUserId = '00000000-0000-4000-8000-000000000091'

      await learnerProfiles.upsertByAuthUserId(authUserId, validProfile)
      await providerAccounts.upsertByAuthUserId(
        authUserId,
        'codeforces',
        'durable_user',
      )
      await providerAccounts.savePublicStatsSuccess(
        authUserId,
        'codeforces',
        'durable_user',
        {
          solvedCount: 88,
          complete: false,
          source: 'codeforces_api',
          fetchedAt: new Date('2026-08-27T12:00:00.000Z'),
          attemptedAt: new Date('2026-08-27T12:00:00.000Z'),
        },
      )

      await prisma.$disconnect()
      prisma = createPrismaClient({
        url: testDatabaseUrl as string,
        poolMax: 2,
        connectionTimeoutMs: 5000,
      })
      await prisma.$connect()
      learnerProfiles = new PrismaLearnerProfileRepository(prisma)
      providerAccounts = new PrismaProviderAccountRepository(prisma)

      await expect(
        learnerProfiles.findByAuthUserId(authUserId),
      ).resolves.toMatchObject({
        ...validProfile,
        onboardingCompleted: true,
      })
      await expect(
        providerAccounts.findAllByAuthUserId(authUserId),
      ).resolves.toMatchObject([
        {
          provider: 'codeforces',
          externalHandle: 'durable_user',
          solvedCount: 88,
          statsComplete: false,
          statsSource: 'codeforces_api',
        },
      ])
    })

    it('keeps provider records isolated by the verified auth subject', async () => {
      const firstUserId = '00000000-0000-4000-8000-000000000092'
      const secondUserId = '00000000-0000-4000-8000-000000000093'

      await providerAccounts.upsertByAuthUserId(
        firstUserId,
        'leetcode',
        'first_user',
      )

      await expect(
        providerAccounts.findAllByAuthUserId(secondUserId),
      ).resolves.toEqual([])
    })
  },
)
