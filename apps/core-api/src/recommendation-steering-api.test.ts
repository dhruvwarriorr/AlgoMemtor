import type { AddressInfo } from 'node:net'

import {
  RecommendationDismissalsResponseSchema,
  RecommendationFeedResponseSchema,
  RecommendationSteeringListResponseSchema,
  RecommendationSteeringResponseSchema,
  type ExternalProblemSummary,
  type ProviderKey,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import type { AiMemoryClient } from './integrations/ai/ai-memory-client.js'
import type { ProblemProvider } from './integrations/providers/problem-provider.js'
import { InMemoryProgressRepository } from './repositories/progress-repository.js'

const userA = '00000000-0000-4000-8000-000000000011'
const userB = '00000000-0000-4000-8000-000000000012'

const makeProblems = (provider: ProviderKey): ExternalProblemSummary[] =>
  Array.from({ length: 40 }, (_, index) => {
    const rating = 800 + (index % 10) * 100
    const topic = index % 2 === 0 ? 'math' : 'greedy'
    return {
      provider,
      externalId:
        provider === 'codeforces' ? `${900 + index}B` : `${index + 1}`,
      title: `${provider} problem ${index}`,
      canonicalUrl:
        provider === 'codeforces'
          ? `https://codeforces.com/problemset/problem/${900 + index}/B`
          : `https://leetcode.com/problems/problem-${index}/`,
      providerDifficulty: rating,
      normalizedDifficulty:
        rating <= 1000 ? 'easy' : rating <= 1400 ? 'medium' : 'hard',
      providerTags: [topic],
      topics: [topic],
      solvedCount: 5_000 - index,
      fetchedAt: '2026-09-10T00:00:00.000Z',
    }
  })

const providerFor = (key: ProviderKey): ProblemProvider => {
  const freshness = {
    provider: key,
    availability: 'available' as const,
    stale: false,
    fetchedAt: '2026-09-10T00:00:00.000Z',
  }
  return {
    key,
    search: vi.fn(async () => ({
      problems: makeProblems(key),
      freshness,
      warnings: [],
    })),
    getHealth: () => freshness,
  }
}

const verifier: SupabaseJwtVerifier = async (token) => {
  if (token === 'user-a') return { subject: userA, claims: {} }
  if (token === 'user-b') return { subject: userB, claims: {} }
  throw new Error('Invalid test token.')
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

const memoryClient = () => {
  const proposed: { learnerId: string; statement: string }[] = []
  const actions: { memoryId: string; action: string }[] = []
  const client: AiMemoryClient = {
    processEvidence: async () => ({ status: 'processed' }),
    deleteLearnerData: async () => undefined,
    deleteProblemEvidence: async () => undefined,
    deleteLearnerPreference: async () => undefined,
    listMemories: async () => [],
    correctMemory: async () => {
      throw new Error('Not used.')
    },
    proposeMemory: async (learnerId, requestId, input) => {
      proposed.push({ learnerId, statement: input.statement })
      return {
        requestId,
        action: 'propose',
        idempotent: false,
        memory: {
          id: '00000000-0000-4000-8000-0000000000aa',
          learnerId,
          category: input.category,
          statement: input.statement,
          structuredValue: {},
          confidence: 0.5,
          status: 'proposed',
          evidenceIds: ['00000000-0000-4000-8000-0000000000bb'],
          version: 1,
          supersedesMemoryId: undefined,
          learnerCorrected: false,
          similarity: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        auditId: undefined,
      }
    },
    actOnMemory: async (_learnerId, memoryId, action) => {
      actions.push({ memoryId, action })
      return {
        requestId: 'r',
        action,
        idempotent: false,
        memory: undefined,
        auditId: undefined,
      }
    },
  }
  return { client, proposed, actions }
}

const startApp = (options: { memory?: AiMemoryClient; consent?: boolean }) => {
  const progressRepository = new InMemoryProgressRepository()
  if (options.consent === true) {
    void progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
  }
  const codeforces = providerFor('codeforces')
  const server = createApp({
    jwtVerifier: verifier,
    problemProvider: codeforces,
    problemProviders: [codeforces, providerFor('leetcode')],
    progressRepository,
    ...(options.memory === undefined ? {} : { aiMemoryClient: options.memory }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }).listen(0)
  servers.push(server)
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const headers = (token: string) => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
})

const steer = async (baseUrl: string, token: string, text: string) =>
  fetch(`${baseUrl}/api/recommendations/steering`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ text }),
  })

describe('recommendation steering API', () => {
  it('applies a plain-language instruction and regenerates the feed', async () => {
    const baseUrl = startApp({})
    const before = RecommendationFeedResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/recommendations`, {
          headers: headers('user-a'),
        })
      ).json(),
    )
    expect(
      before.data?.items.some((item) => item.provider === 'leetcode'),
    ).toBe(true)

    const response = await steer(
      baseUrl,
      'user-a',
      'No LeetCode please, only math problems around 1200',
    )
    expect(response.status).toBe(200)
    const { data } = RecommendationSteeringResponseSchema.parse(
      await response.json(),
    )
    expect(data.steering.applied).toEqual(
      expect.arrayContaining([
        'No LeetCode problems',
        'Only Math',
        'Rating 1100–1300',
      ]),
    )
    expect(data.steering.savedToMemory).toBe(false)
    const items = data.feed.data?.items ?? []
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.provider === 'codeforces')).toBe(true)
    expect(items.every((item) => item.problem.topics.includes('math'))).toBe(
      true,
    )

    // A later GET keeps honouring the instruction.
    const reloaded = RecommendationFeedResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/recommendations`, {
          headers: headers('user-a'),
        })
      ).json(),
    )
    expect(reloaded.data?.id).toBe(data.feed.data?.id)

    // Another learner is unaffected and cannot remove it.
    const other = RecommendationSteeringListResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/recommendations/steering`, {
          headers: headers('user-b'),
        })
      ).json(),
    )
    expect(other.data).toEqual([])
    const forbidden = await fetch(
      `${baseUrl}/api/recommendations/steering/${data.steering.id}`,
      { method: 'DELETE', headers: headers('user-b') },
    )
    expect(forbidden.status).toBe(404)

    const removed = await fetch(
      `${baseUrl}/api/recommendations/steering/${data.steering.id}`,
      { method: 'DELETE', headers: headers('user-a') },
    )
    expect(
      RecommendationSteeringListResponseSchema.parse(await removed.json()).data,
    ).toEqual([])
    const after = RecommendationFeedResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/recommendations`, {
          headers: headers('user-a'),
        })
      ).json(),
    )
    expect(after.data?.id).not.toBe(data.feed.data?.id)
    expect(after.data?.items.some((item) => item.provider === 'leetcode')).toBe(
      true,
    )
  })

  it('removes a named problem from the feed as a dismissal', async () => {
    const baseUrl = startApp({})
    const feed = RecommendationFeedResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/recommendations`, {
          headers: headers('user-a'),
        })
      ).json(),
    )
    const target = feed.data?.items[0]
    expect(target).toBeDefined()
    const response = await steer(
      baseUrl,
      'user-a',
      `I don't want ${target?.problem.title}`,
    )
    const { data } = RecommendationSteeringResponseSchema.parse(
      await response.json(),
    )
    expect(
      data.feed.data?.items.some(
        (item) =>
          item.problem.externalId === target?.problem.externalId &&
          item.provider === target.provider,
      ),
    ).toBe(false)
    const dismissals = RecommendationDismissalsResponseSchema.parse(
      await (
        await fetch(`${baseUrl}/api/recommendation-dismissals`, {
          headers: headers('user-a'),
        })
      ).json(),
    )
    expect(
      dismissals.data.some(
        (item) => item.externalId === target?.problem.externalId,
      ),
    ).toBe(true)
  })

  it('saves the instruction to learner memory with consent and archives it on removal', async () => {
    const memory = memoryClient()
    const baseUrl = startApp({ memory: memory.client, consent: true })
    const response = await steer(baseUrl, 'user-a', 'more dp problems')
    const { data } = RecommendationSteeringResponseSchema.parse(
      await response.json(),
    )
    expect(data.steering.savedToMemory).toBe(true)
    expect(memory.proposed).toEqual([
      {
        learnerId: userA,
        statement:
          'Recommendation instruction from the learner: more dp problems',
      },
    ])
    expect(memory.actions).toEqual([
      { memoryId: '00000000-0000-4000-8000-0000000000aa', action: 'approve' },
    ])
    await fetch(`${baseUrl}/api/recommendations/steering/${data.steering.id}`, {
      method: 'DELETE',
      headers: headers('user-a'),
    })
    expect(memory.actions.at(-1)).toEqual({
      memoryId: '00000000-0000-4000-8000-0000000000aa',
      action: 'archive',
    })
  })

  it('rejects an empty instruction', async () => {
    const baseUrl = startApp({})
    const response = await steer(baseUrl, 'user-a', '   ')
    expect(response.status).toBe(400)
  })
})
