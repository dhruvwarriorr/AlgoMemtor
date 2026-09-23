import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ProviderSolvedProblem } from '@algomemtor/shared-contracts'

import {
  createPrismaClient,
  type CorePrismaClient,
} from '../database/prisma.js'
import { PrismaProviderAccountRepository } from './provider-account-repository.js'
import { PrismaProviderDataRepository } from './provider-data-repository.js'
import { PrismaConnectorTokenRepository } from './connector-token-repository.js'
import { PrismaLearnerActivityRepository } from './learner-activity-repository.js'
import { computeLearnerActivityDigest } from '../services/learner-activity-digest.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const authUserId = '00000000-0000-4000-8000-000000000097'

const solved = (
  overrides: Partial<ProviderSolvedProblem> & { externalId: string },
): ProviderSolvedProblem => ({
  provider: 'codechef',
  canonicalUrl: `https://www.codechef.com/problems/${overrides.externalId}`,
  occurredAt: null,
  firstObservedAt: '2026-09-01T00:00:00.000Z',
  lastObservedAt: '2026-09-01T00:00:00.000Z',
  completeness: 'complete',
  provenance: {
    provider: 'codechef',
    providerId: overrides.externalId,
    canonicalUrl: `https://www.codechef.com/problems/${overrides.externalId}`,
    sourceUrl: 'https://www.codechef.com/recent/user',
    extractionStrategy: 'official_json',
    schemaVersion: 'test',
    completeness: 'complete',
    fetchedAt: '2026-09-01T00:00:00.000Z',
    stale: false,
  },
  ...overrides,
})

describe.skipIf(testDatabaseUrl === undefined)(
  'provider data persistence',
  () => {
    let prisma: CorePrismaClient

    beforeAll(async () => {
      prisma = createPrismaClient({
        url: testDatabaseUrl as string,
        poolMax: 2,
        connectionTimeoutMs: 5_000,
      })
      await prisma.$connect()
      await prisma.coreUser.deleteMany({ where: { authUserId } })
    })

    afterAll(async () => {
      await prisma?.coreUser.deleteMany({ where: { authUserId } })
      await prisma?.$disconnect()
    })

    it('merges solve windows, stores judge details, and backfills tags', async () => {
      const account = await new PrismaProviderAccountRepository(
        prisma,
      ).upsertByAuthUserId(authUserId, 'codechef', 'database_tags_learner')
      const repository = new PrismaProviderDataRepository(prisma)

      await repository.saveSolvedProblems(authUserId, account.id, [
        solved({
          externalId: 'FLOW',
          occurredAt: '2026-01-01T00:00:00.000Z',
          sourceSubmissionId: '1',
          providerTags: ['Graphs'],
          topics: ['graphs'],
        }),
        solved({ externalId: 'ADDIS', occurredAt: '2026-09-02T00:00:00.000Z' }),
        solved({ externalId: 'OLD', occurredAt: '2025-01-01T00:00:00.000Z' }),
      ])
      // A later incremental window re-solves FLOW without tags.
      await repository.saveSolvedProblems(authUserId, account.id, [
        solved({
          externalId: 'FLOW',
          occurredAt: '2026-09-10T00:00:00.000Z',
          sourceSubmissionId: '9',
          lastObservedAt: '2026-09-20T00:00:00.000Z',
        }),
      ])
      await repository.saveSubmissions(authUserId, account.id, [
        {
          provider: 'codechef',
          externalId: 'FLOW',
          eventId: '9',
          canonicalUrl: 'https://www.codechef.com/problems/FLOW',
          verdict: 'accepted',
          isAccepted: true,
          runtimeMs: 120,
          memoryKb: 2048,
          passedTestCount: 12,
          completeness: 'complete',
          provenance: solved({ externalId: 'FLOW' }).provenance,
        },
      ])

      const now = new Date('2026-09-23T00:00:00.000Z')
      const pending = await repository.listUntaggedSolvedIds(
        authUserId,
        account.id,
        10,
        now,
      )
      expect(pending).toEqual(['ADDIS', 'OLD'])

      await repository.saveSolvedTags(
        authUserId,
        account.id,
        ['ADDIS'],
        new Map([['ADDIS', { providerTags: ['Math'], topics: ['math'] }]]),
        now,
      )

      const stored = await repository.listSolvedProblems(authUserId)
      expect(stored.find((item) => item.externalId === 'FLOW')).toMatchObject({
        occurredAt: '2026-01-01T00:00:00.000Z',
        sourceSubmissionId: '1',
        providerTags: ['Graphs'],
      })
      expect(stored.find((item) => item.externalId === 'ADDIS')).toMatchObject({
        providerTags: ['Math'],
        topics: ['math'],
      })
      expect(
        await repository.listUntaggedSolvedIds(authUserId, account.id, 10, now),
      ).toEqual(['OLD'])
      expect(await repository.listSubmissions(authUserId)).toMatchObject([
        { runtimeMs: 120, memoryKb: 2048, passedTestCount: 12 },
      ])
    })

    it('verifies a handle only with the open, unexpired code', async () => {
      const accounts = new PrismaProviderAccountRepository(prisma)
      const account = await accounts.upsertByAuthUserId(
        authUserId,
        'leetcode',
        'database_verify_learner',
      )
      const now = new Date()
      const started = await accounts.startVerification(
        authUserId,
        'leetcode',
        account.externalHandle,
        { code: 'AM-ABCD2345', expiresAt: new Date(now.getTime() + 60_000) },
      )
      expect(started?.verificationChallenge?.code).toBe('AM-ABCD2345')

      expect(
        await accounts.completeVerification(
          authUserId,
          'leetcode',
          account.externalHandle,
          'AM-WRONG234',
          now,
        ),
      ).toBeNull()
      expect(
        await accounts.completeVerification(
          authUserId,
          'leetcode',
          account.externalHandle,
          'AM-ABCD2345',
          new Date(now.getTime() + 120_000),
        ),
      ).toBeNull()

      const verified = await accounts.completeVerification(
        authUserId,
        'leetcode',
        account.externalHandle,
        'AM-ABCD2345',
        now,
      )
      expect(verified).toMatchObject({
        verificationStatus: 'verified',
        verificationChallenge: null,
      })
      const relinked = await accounts.upsertByAuthUserId(
        authUserId,
        'leetcode',
        'database_verify_learner',
      )
      expect(relinked.verificationStatus).toBe('verified')
    })

    it('stores connector tokens hashed, verifies, and supersedes public rows', async () => {
      const tokens = new PrismaConnectorTokenRepository(prisma)
      const hash = 'a'.repeat(64)
      const token = await tokens.create(authUserId, 'Laptop', hash)
      expect(await tokens.findActiveByHash(hash)).toMatchObject({
        id: token.id,
        authUserId,
      })
      expect(await tokens.revoke(authUserId, token.id, new Date())).toBe(true)
      expect(await tokens.findActiveByHash(hash)).toBeNull()

      const accounts = new PrismaProviderAccountRepository(prisma)
      const account = await accounts.upsertByAuthUserId(
        authUserId,
        'cses',
        '424242',
      )
      expect(
        (await accounts.markVerified(authUserId, 'cses', '424242', new Date()))
          ?.verificationStatus,
      ).toBe('verified')

      const repository = new PrismaProviderDataRepository(prisma)
      const row = (
        eventId: string,
        strategy: 'public_graphql' | 'authenticated_connector',
      ) => ({
        provider: 'cses' as const,
        externalId: '1068',
        eventId,
        canonicalUrl: 'https://cses.fi/problemset/task/1068/',
        verdict: 'ACCEPTED',
        isAccepted: true,
        occurredAt: '2026-09-01T10:00:00.000Z',
        completeness: 'partial' as const,
        provenance: {
          ...solved({ externalId: '1068' }).provenance,
          provider: 'cses' as const,
          extractionStrategy: strategy,
        },
      })
      await repository.saveSubmissions(authUserId, account.id, [
        row('recent:1068:before', 'public_graphql'),
      ])
      await repository.saveSubmissions(authUserId, account.id, [
        row('cses:9', 'authenticated_connector'),
      ])
      await repository.deleteSupersededPublicSubmissions(
        authUserId,
        account.id,
        [{ externalId: '1068', occurredAt: '2026-09-01T10:00:00.000Z' }],
      )
      await repository.saveSubmissions(authUserId, account.id, [
        row('recent:1068:after', 'public_graphql'),
      ])
      expect(
        (await repository.listSubmissions(authUserId, 'cses')).map(
          (item) => item.eventId,
        ),
      ).toEqual(['cses:9'])
    })

    it('stores the activity digest and owner-scoped change notes', async () => {
      await new PrismaProviderAccountRepository(prisma).upsertByAuthUserId(
        authUserId,
        'codeforces',
        'database_digest_learner',
      )
      const repository = new PrismaLearnerActivityRepository(prisma)
      const digest = computeLearnerActivityDigest({
        now: new Date('2026-09-23T00:00:00.000Z'),
        accounts: [],
        submissions: [],
        solved: [],
        contests: [],
        catalog: new Map(),
      })
      await repository.saveDigest(authUserId, digest, 'b'.repeat(64))
      expect(await repository.getDigest(authUserId)).toMatchObject({
        sourceHash: 'b'.repeat(64),
        digest: { version: 'learner-activity-v1' },
      })

      const changeId = await repository.addChange(
        authUserId,
        'Solved 2 new problems.',
      )
      expect(changeId).not.toBeNull()
      expect(
        await repository.getChange(authUserId, changeId as string),
      ).toMatchObject({
        note: 'Solved 2 new problems.',
      })
      expect(
        await repository.getChange(
          '00000000-0000-4000-8000-000000000001',
          changeId as string,
        ),
      ).toBeNull()
    })
  },
)
