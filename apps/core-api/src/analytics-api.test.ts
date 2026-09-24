import type { AddressInfo } from 'node:net'

import {
  UnifiedAnalyticsSchema,
  type ExternalProblemSummary,
  type ProviderKey,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import type { ProblemProvider } from './integrations/providers/problem-provider.js'
import { InMemoryLearnerProfileRepository } from './repositories/learner-profile-repository.js'
import { InMemoryProblemActionRepository } from './repositories/problem-action-repository.js'
import { InMemoryProviderDataRepository } from './repositories/provider-data-repository.js'

const userId = '00000000-0000-4000-8000-000000000031'

const verifier: SupabaseJwtVerifier = async (token) => {
  if (token !== 'analytics-user') throw new Error('Invalid test token.')
  return { subject: userId, claims: {} }
}

const freshness = {
  provider: 'codeforces' as const,
  availability: 'available' as const,
  stale: false,
  fetchedAt: '2026-09-20T00:00:00.000Z',
}

const catalogProvider: ProblemProvider = {
  key: 'codeforces',
  search: vi.fn(async () => ({
    problems: [] as ExternalProblemSummary[],
    freshness,
    warnings: [],
  })),
  getHealth: () => freshness,
}

const servers: ReturnType<ReturnType<typeof createApp>['listen']>[] = []

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  )
})

const solved = (provider: ProviderKey, externalId: string, at: string) => ({
  provider,
  externalId,
  canonicalUrl:
    provider === 'leetcode'
      ? `https://leetcode.com/problems/p-${externalId}/`
      : `https://codeforces.com/problemset/problem/${externalId.slice(0, -1)}/${externalId.slice(-1)}`,
  occurredAt: at,
  firstObservedAt: at,
  lastObservedAt: at,
  completeness: 'complete' as const,
  provenance: {
    provider,
    providerId: externalId,
    canonicalUrl: 'https://codeforces.com/',
    sourceUrl: 'https://codeforces.com/api/user.status',
    extractionStrategy: 'official_json' as const,
    schemaVersion: 'v1',
    completeness: 'complete' as const,
    fetchedAt: at,
    stale: false,
  },
})

const start = async () => {
  const learnerProfileRepository = new InMemoryLearnerProfileRepository()
  await learnerProfileRepository.upsertByAuthUserId(userId, {
    experience: 'intermediate',
    difficultyComfort: 'let_algomemtor_decide',
    goal: 'improve_problem_solving',
    topicPreference: { mode: 'let_algomemtor_suggest' },
    preferredTopics: [],
    platformPreferences: { platforms: ['codeforces'], standings: [] },
    learningPreferences: ['solve_problems_directly'],
    timezone: 'Asia/Kolkata',
  })
  const providerDataRepository = new InMemoryProviderDataRepository()
  // 20:00 UTC is 01:30 the next day in Kolkata: the two solves fall on
  // consecutive local days, not on one UTC day.
  await providerDataRepository.saveSolvedProblems(userId, 'cf-account', [
    solved('codeforces', '1A', '2026-09-10T10:00:00.000Z'),
    solved('codeforces', '2A', '2026-09-10T20:00:00.000Z'),
  ])
  await providerDataRepository.saveSolvedProblems(userId, 'lc-account', [
    solved('leetcode', '11', '2026-09-15T08:00:00.000Z'),
  ])
  const problemActionRepository = new InMemoryProblemActionRepository()
  await problemActionRepository.appendByAuthUserId(userId, {
    provider: 'codeforces',
    externalId: '3A',
    actionType: 'status_changed',
    learnerStatus: 'solved',
    evidenceSource: 'provider_verified',
    occurredAt: new Date('2026-09-18T06:00:00.000Z'),
  })
  const server = createApp({
    jwtVerifier: verifier,
    problemProvider: catalogProvider,
    learnerProfileRepository,
    providerDataRepository,
    problemActionRepository,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }).listen(0)
  servers.push(server)
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const analytics = async (baseUrl: string, provider?: ProviderKey) =>
  UnifiedAnalyticsSchema.parse(
    await (
      await fetch(
        `${baseUrl}/api/analytics${provider === undefined ? '' : `?provider=${provider}`}`,
        { headers: { authorization: 'Bearer analytics-user' } },
      )
    ).json(),
  )

describe('analytics API', () => {
  it('buckets solve days in the learner time zone', async () => {
    const all = await analytics(await start())
    expect(all.solvedOverTime).toEqual({
      '2026-09-10': 1,
      '2026-09-11': 1,
      '2026-09-15': 1,
      '2026-09-18': 1,
    })
  })

  it('keeps every source scoped to the selected provider', async () => {
    const baseUrl = await start()
    const leetcode = await analytics(baseUrl, 'leetcode')
    expect(leetcode.solvedOverTime).toEqual({ '2026-09-15': 1 })
    const codeforces = await analytics(baseUrl, 'codeforces')
    expect(Object.keys(codeforces.solvedOverTime).sort()).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-18',
    ])
  })
})
