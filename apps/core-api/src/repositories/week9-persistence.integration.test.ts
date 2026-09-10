import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import type { ExternalProblemSummary } from '@algomemtor/shared-contracts'

import {
  createPrismaClient,
  type CorePrismaClient,
} from '../database/prisma.js'
import type { PersistedProblemCatalog } from '../integrations/providers/problem-metadata-cache.js'
import { PrismaBookmarkRepository } from './bookmark-repository.js'
import { PrismaExternalProblemCacheRepository } from './external-problem-cache-repository.js'
import { PrismaLearnerProfileRepository } from './learner-profile-repository.js'
import {
  PrismaProblemActionRepository,
  type AppendProblemActionInput,
} from './problem-action-repository.js'
import {
  PrismaRecommendationRepository,
  RecommendationOwnershipError,
  type SaveRecommendationBatchInput,
} from './recommendation-repository.js'
import { PrismaProviderAccountRepository } from './provider-account-repository.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const hasTestDatabase = Boolean(testDatabaseUrl?.trim())

const TEST_AUTH_USER_A = '7e7b3d84-6a17-4d44-9c9a-2cda42a9d2a1'
const TEST_AUTH_USER_B = '0bcd81bb-1dd8-41e9-8fd2-7a30e4c39d6c'
const TEST_AUTH_USER_IDS = [TEST_AUTH_USER_A, TEST_AUTH_USER_B] as const

const TEST_CACHE_EXTERNAL_ID_A = '5522cbde-8d47-4e53-b3ca-1a7bbd1dc14a'
const TEST_CACHE_EXTERNAL_ID_B = 'cfcf9c33-3d8b-49af-8c1d-6ac4b5c874ef'
const TEST_CACHE_EXTERNAL_IDS = [
  TEST_CACHE_EXTERNAL_ID_A,
  TEST_CACHE_EXTERNAL_ID_B,
] as const

const PROVIDER = 'codeforces' as const
const STATUS_ACTION_OCCURRED_AT = new Date('2026-09-10T01:30:00.000Z')

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

const makeProblem = (
  externalId: string,
  title: string,
  problemIndex: 'A' | 'B',
  normalizedDifficulty: 'easy' | 'medium',
  fetchedAtMs: number,
  solvedCount: number,
): ExternalProblemSummary => ({
  provider: PROVIDER,
  externalId,
  title,
  canonicalUrl: `https://codeforces.com/problemset/problem/1900/${problemIndex}`,
  providerDifficulty: normalizedDifficulty === 'easy' ? 800 : 1200,
  normalizedDifficulty,
  providerTags: ['implementation'],
  topics: ['implementation'],
  solvedCount,
  fetchedAt: new Date(fetchedAtMs).toISOString(),
})

const makeCatalog = (
  fetchedAtMs: number,
  expiresAtMs: number,
  primaryTitle: string,
  secondaryTitle: string,
): PersistedProblemCatalog => ({
  provider: PROVIDER,
  availability: 'available',
  fetchedAtMs,
  expiresAtMs,
  problems: [
    makeProblem(
      TEST_CACHE_EXTERNAL_ID_A,
      primaryTitle,
      'A',
      'easy',
      fetchedAtMs,
      101,
    ),
    makeProblem(
      TEST_CACHE_EXTERNAL_ID_B,
      secondaryTitle,
      'B',
      'medium',
      fetchedAtMs,
      202,
    ),
  ],
})

const makeRecommendationBatchInput = (): SaveRecommendationBatchInput => ({
  requestCriteria: {
    provider: PROVIDER,
    topics: ['implementation'],
    difficulty: 'easy',
    minRating: 800,
    maxRating: 1200,
    pageSize: 2,
  },
  rankingMode: 'deterministic',
  rankingVersion: 'week9-integration-v1',
  items: [
    {
      provider: PROVIDER,
      externalId: TEST_CACHE_EXTERNAL_ID_A,
      position: 1,
      score: 0.91,
      reason: 'Matches the learner topic and rating range.',
    },
    {
      provider: PROVIDER,
      externalId: TEST_CACHE_EXTERNAL_ID_B,
      position: 2,
      score: 0.72,
      reason: 'Provides a slightly harder follow-up problem.',
    },
  ],
})

const makeOpenedActionInput = (
  recommendationBatchId?: string,
): AppendProblemActionInput => ({
  provider: PROVIDER,
  externalId: TEST_CACHE_EXTERNAL_ID_A,
  actionType: 'opened',
  ...(recommendationBatchId === undefined ? {} : { recommendationBatchId }),
  occurredAt: STATUS_ACTION_OCCURRED_AT,
})

describe.skipIf(!hasTestDatabase)('Week 9 Prisma persistence', () => {
  let prisma: CorePrismaClient | undefined
  let learnerProfiles: PrismaLearnerProfileRepository
  let providerAccounts: PrismaProviderAccountRepository
  let bookmarks: PrismaBookmarkRepository
  let problemActions: PrismaProblemActionRepository
  let recommendations: PrismaRecommendationRepository
  let metadataCache: PrismaExternalProblemCacheRepository

  const getTestDatabaseUrl = () => {
    if (testDatabaseUrl === undefined || !testDatabaseUrl.trim()) {
      throw new Error(
        'TEST_DATABASE_URL is required for this integration suite.',
      )
    }

    return testDatabaseUrl
  }

  const getPrisma = () => {
    if (prisma === undefined) {
      throw new Error('The test Prisma client has not been initialized.')
    }

    return prisma
  }

  const attachRepositories = () => {
    const client = getPrisma()
    learnerProfiles = new PrismaLearnerProfileRepository(client)
    providerAccounts = new PrismaProviderAccountRepository(client)
    bookmarks = new PrismaBookmarkRepository(client)
    problemActions = new PrismaProblemActionRepository(client)
    recommendations = new PrismaRecommendationRepository(client)
    metadataCache = new PrismaExternalProblemCacheRepository(client)
  }

  const cleanupTestRows = async () => {
    const client = getPrisma()

    await client.externalProblemCache.deleteMany({
      where: {
        provider: PROVIDER,
        externalId: { in: [...TEST_CACHE_EXTERNAL_IDS] },
      },
    })
    await client.coreUser.deleteMany({
      where: { authUserId: { in: [...TEST_AUTH_USER_IDS] } },
    })
  }

  const reconnect = async () => {
    const client = getPrisma()
    await client.$disconnect()
    prisma = createPrismaClient({
      url: getTestDatabaseUrl(),
      poolMax: 2,
      connectionTimeoutMs: 5_000,
    })
    await getPrisma().$connect()
    attachRepositories()
  }

  beforeAll(async () => {
    prisma = createPrismaClient({
      url: getTestDatabaseUrl(),
      poolMax: 2,
      connectionTimeoutMs: 5_000,
    })
    await getPrisma().$connect()
    attachRepositories()
  })

  beforeEach(async () => {
    await cleanupTestRows()
  })

  afterEach(async () => {
    await cleanupTestRows()
  })

  afterAll(async () => {
    if (prisma === undefined) {
      return
    }

    await cleanupTestRows()
    await prisma.$disconnect()
  })

  it('durably replaces provider metadata without duplicate identities', async () => {
    const firstFetchedAtMs = Date.parse('2026-09-10T00:00:00.000Z')
    const firstExpiresAtMs = Date.parse('2026-09-10T01:00:00.000Z')
    const secondFetchedAtMs = Date.parse('2026-09-10T02:00:00.000Z')
    const secondExpiresAtMs = Date.parse('2026-09-10T03:00:00.000Z')

    await metadataCache.replaceProviderCatalog(
      makeCatalog(
        firstFetchedAtMs,
        firstExpiresAtMs,
        'Initial cache title A',
        'Initial cache title B',
      ),
    )

    const firstCount = await getPrisma().externalProblemCache.count({
      where: {
        provider: PROVIDER,
        externalId: { in: [...TEST_CACHE_EXTERNAL_IDS] },
      },
    })
    expect(firstCount).toBe(2)

    await expect(
      metadataCache.replaceProviderCatalog({
        provider: PROVIDER,
        availability: 'available',
        fetchedAtMs: firstFetchedAtMs,
        expiresAtMs: firstExpiresAtMs,
        problems: [],
      }),
    ).rejects.toThrow('cannot be empty')
    await expect(
      getPrisma().externalProblemCache.count({
        where: {
          provider: PROVIDER,
          externalId: { in: [...TEST_CACHE_EXTERNAL_IDS] },
        },
      }),
    ).resolves.toBe(2)

    await metadataCache.replaceProviderCatalog(
      makeCatalog(
        secondFetchedAtMs,
        secondExpiresAtMs,
        'Replaced cache title A',
        'Replaced cache title B',
      ),
    )

    const replacedRows = await getPrisma().externalProblemCache.findMany({
      where: {
        provider: PROVIDER,
        externalId: { in: [...TEST_CACHE_EXTERNAL_IDS] },
      },
      orderBy: { externalId: 'asc' },
    })
    expect(replacedRows).toHaveLength(2)
    expect(
      new Set(replacedRows.map((row) => `${row.provider}:${row.externalId}`))
        .size,
    ).toBe(2)
    expect(replacedRows.map((row) => row.title)).toEqual([
      'Replaced cache title A',
      'Replaced cache title B',
    ])

    await reconnect()

    await expect(metadataCache.findByProvider(PROVIDER)).resolves.toMatchObject(
      {
        provider: PROVIDER,
        availability: 'available',
        fetchedAtMs: secondFetchedAtMs,
        expiresAtMs: secondExpiresAtMs,
        problems: [
          expect.objectContaining({
            externalId: TEST_CACHE_EXTERNAL_ID_A,
            title: 'Replaced cache title A',
            solvedCount: 101,
          }),
          expect.objectContaining({
            externalId: TEST_CACHE_EXTERNAL_ID_B,
            title: 'Replaced cache title B',
            solvedCount: 202,
          }),
        ],
      },
    )
  })

  it('persists learner records and feedback across a Prisma client reconnect', async () => {
    await learnerProfiles.upsertByAuthUserId(TEST_AUTH_USER_A, validProfile)
    await providerAccounts.upsertByAuthUserId(
      TEST_AUTH_USER_A,
      'codeforces',
      'week9_owner_a',
    )
    const firstBookmark = await bookmarks.saveByAuthUserId(TEST_AUTH_USER_A, {
      provider: PROVIDER,
      externalId: TEST_CACHE_EXTERNAL_ID_A,
    })
    const duplicateBookmark = await bookmarks.saveByAuthUserId(
      TEST_AUTH_USER_A,
      { provider: PROVIDER, externalId: TEST_CACHE_EXTERNAL_ID_A },
    )
    const savedBatch = await recommendations.saveBatchByAuthUserId(
      TEST_AUTH_USER_A,
      makeRecommendationBatchInput(),
    )
    const firstItem = savedBatch.items[0]
    const secondItem = savedBatch.items[1]

    if (firstItem === undefined || secondItem === undefined) {
      throw new Error('The recommendation batch did not persist both items.')
    }

    const savedAction = await problemActions.appendByAuthUserId(
      TEST_AUTH_USER_A,
      makeOpenedActionInput(savedBatch.id),
    )
    const savedFeedback = await recommendations.saveFeedbackByAuthUserId(
      TEST_AUTH_USER_A,
      firstItem.id,
      {
        usefulness: 'useful',
        perceivedDifficulty: 'about_right',
        notes: 'The recommendation was a good fit.',
      },
    )

    expect(duplicateBookmark.id).toBe(firstBookmark.id)
    await expect(
      getPrisma().bookmark.count({
        where: {
          user: { authUserId: TEST_AUTH_USER_A },
          provider: PROVIDER,
          externalId: TEST_CACHE_EXTERNAL_ID_A,
        },
      }),
    ).resolves.toBe(1)

    await reconnect()

    await expect(
      learnerProfiles.findByAuthUserId(TEST_AUTH_USER_A),
    ).resolves.toMatchObject({
      ...validProfile,
      onboardingCompleted: true,
    })
    await expect(
      providerAccounts.findAllByAuthUserId(TEST_AUTH_USER_A),
    ).resolves.toMatchObject([
      {
        provider: PROVIDER,
        externalHandle: 'week9_owner_a',
        consentScope: 'store_public_profile_reference',
      },
    ])
    await expect(bookmarks.listByAuthUserId(TEST_AUTH_USER_A)).resolves.toEqual(
      [
        expect.objectContaining({
          id: firstBookmark.id,
          provider: PROVIDER,
          externalId: TEST_CACHE_EXTERNAL_ID_A,
        }),
      ],
    )
    await expect(
      problemActions.listByAuthUserId(TEST_AUTH_USER_A),
    ).resolves.toEqual([
      expect.objectContaining({
        id: savedAction.id,
        actionType: 'opened',
        recommendationBatchId: savedBatch.id,
      }),
    ])
    await expect(
      recommendations.listBatchesByAuthUserId(TEST_AUTH_USER_A),
    ).resolves.toEqual([
      expect.objectContaining({
        id: savedBatch.id,
        rankingMode: 'deterministic',
        rankingVersion: 'week9-integration-v1',
        items: [
          expect.objectContaining({
            id: firstItem.id,
            externalId: TEST_CACHE_EXTERNAL_ID_A,
            position: 1,
          }),
          expect.objectContaining({
            id: secondItem.id,
            externalId: TEST_CACHE_EXTERNAL_ID_B,
            position: 2,
          }),
        ],
      }),
    ])
    await expect(
      recommendations.listFeedbackByAuthUserId(TEST_AUTH_USER_A),
    ).resolves.toEqual([
      expect.objectContaining({
        id: savedFeedback.id,
        recommendationItemId: firstItem.id,
        usefulness: 'useful',
        perceivedDifficulty: 'about_right',
        notes: 'The recommendation was a good fit.',
      }),
    ])
  })

  it('isolates every learner-owned repository by auth subject', async () => {
    await learnerProfiles.upsertByAuthUserId(TEST_AUTH_USER_A, validProfile)
    await providerAccounts.upsertByAuthUserId(
      TEST_AUTH_USER_A,
      'codeforces',
      'isolated_owner_a',
    )
    await bookmarks.saveByAuthUserId(TEST_AUTH_USER_A, {
      provider: PROVIDER,
      externalId: TEST_CACHE_EXTERNAL_ID_A,
    })
    await problemActions.appendByAuthUserId(
      TEST_AUTH_USER_A,
      makeOpenedActionInput(),
    )
    const batch = await recommendations.saveBatchByAuthUserId(
      TEST_AUTH_USER_A,
      makeRecommendationBatchInput(),
    )
    const firstItem = batch.items[0]

    if (firstItem === undefined) {
      throw new Error('The recommendation batch did not persist an item.')
    }

    await recommendations.saveFeedbackByAuthUserId(
      TEST_AUTH_USER_A,
      firstItem.id,
      { usefulness: 'useful' },
    )

    await expect(
      learnerProfiles.findByAuthUserId(TEST_AUTH_USER_B),
    ).resolves.toBeNull()
    await expect(
      providerAccounts.findAllByAuthUserId(TEST_AUTH_USER_B),
    ).resolves.toEqual([])
    await expect(bookmarks.listByAuthUserId(TEST_AUTH_USER_B)).resolves.toEqual(
      [],
    )
    await expect(
      problemActions.listByAuthUserId(TEST_AUTH_USER_B),
    ).resolves.toEqual([])
    await expect(
      recommendations.listBatchesByAuthUserId(TEST_AUTH_USER_B),
    ).resolves.toEqual([])
    await expect(
      recommendations.listFeedbackByAuthUserId(TEST_AUTH_USER_B),
    ).resolves.toEqual([])
  })

  it('rejects cross-learner recommendation feedback and action references', async () => {
    const batch = await recommendations.saveBatchByAuthUserId(
      TEST_AUTH_USER_A,
      makeRecommendationBatchInput(),
    )
    const firstItem = batch.items[0]

    if (firstItem === undefined) {
      throw new Error('The recommendation batch did not persist an item.')
    }

    const itemId = firstItem.id

    await expect(
      recommendations.saveFeedbackByAuthUserId(TEST_AUTH_USER_B, itemId, {
        usefulness: 'useful',
      }),
    ).rejects.toBeInstanceOf(RecommendationOwnershipError)
    await expect(
      problemActions.appendByAuthUserId(
        TEST_AUTH_USER_B,
        makeOpenedActionInput(batch.id),
      ),
    ).rejects.toThrow('not owned by this learner')

    await expect(
      recommendations.listFeedbackByAuthUserId(TEST_AUTH_USER_A),
    ).resolves.toEqual([])
    await expect(
      recommendations.listFeedbackByAuthUserId(TEST_AUTH_USER_B),
    ).resolves.toEqual([])
    await expect(
      problemActions.listByAuthUserId(TEST_AUTH_USER_B),
    ).resolves.toEqual([])
  })

  it('enforces status and evidence consistency at the database boundary', async () => {
    const user = await getPrisma().coreUser.upsert({
      where: { authUserId: TEST_AUTH_USER_A },
      create: { authUserId: TEST_AUTH_USER_A },
      update: {},
      select: { id: true },
    })
    const baseAction = {
      userId: user.id,
      provider: PROVIDER,
      externalId: TEST_CACHE_EXTERNAL_ID_A,
      occurredAt: STATUS_ACTION_OCCURRED_AT,
    }

    await expect(
      getPrisma().problemAction.create({
        data: { ...baseAction, actionType: 'status_changed' },
      }),
    ).rejects.toThrow()
    await expect(
      getPrisma().problemAction.create({
        data: {
          ...baseAction,
          actionType: 'status_changed',
          learnerStatus: 'solved',
        },
      }),
    ).rejects.toThrow()
    await expect(
      getPrisma().problemAction.create({
        data: {
          ...baseAction,
          actionType: 'opened',
          learnerStatus: 'solved',
          evidenceSource: 'manual',
        },
      }),
    ).rejects.toThrow()

    await expect(
      getPrisma().problemAction.create({
        data: {
          ...baseAction,
          actionType: 'status_changed',
          learnerStatus: 'solved',
          evidenceSource: 'provider_verified',
        },
      }),
    ).resolves.toMatchObject({
      actionType: 'status_changed',
      learnerStatus: 'solved',
      evidenceSource: 'provider_verified',
    })
  })
})
