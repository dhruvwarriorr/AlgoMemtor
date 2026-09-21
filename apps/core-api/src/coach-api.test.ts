import type { AddressInfo } from 'node:net'

import {
  CoachActionProposalResponseSchema,
  CoachResponseSchema,
  ExternalProblemSummarySchema,
  ImprovementRoadmapResponseSchema,
  type CoachActionProposal,
  type ExternalProblemSummary,
  type ProviderSolvedProblem,
  type ProviderRatingChange,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import type {
  AiCoachClient,
  AiCoachRequest,
  AiCoachResult,
} from './integrations/ai/ai-coach-client.js'
import type { AiMemoryClient } from './integrations/ai/ai-memory-client.js'
import type { ProblemProvider } from './integrations/providers/problem-provider.js'
import { InMemoryProblemActionRepository } from './repositories/problem-action-repository.js'
import { InMemoryProgressRepository } from './repositories/progress-repository.js'
import { InMemoryProviderDataRepository } from './repositories/provider-data-repository.js'
import { InMemoryLearnerProfileRepository } from './repositories/learner-profile-repository.js'
import { InMemoryCoachRepository } from './repositories/coach-repository.js'
import { InMemoryBookmarkRepository } from './repositories/bookmark-repository.js'
import {
  CoachTopicDefinitions,
  extractCoachTopicExclusions,
  validateCoachPrerequisiteGraph,
} from './services/coach-service.js'

const userA = '00000000-0000-4000-8000-000000000001'
const userB = '00000000-0000-4000-8000-000000000002'
const proposalId = '00000000-0000-4000-8000-000000000099'

const timestamp = '2026-09-15T12:00:00.000Z'
const providerFreshness = {
  provider: 'codeforces' as const,
  availability: 'available' as const,
  stale: false,
  fetchedAt: timestamp,
}

const problems = [
  ['100', 'easy'],
  ['101', 'easy'],
  ['102', 'medium'],
  ['103', 'medium'],
  ['104', 'hard'],
  ['105', 'hard'],
].map(([externalId, normalizedDifficulty]) =>
  ExternalProblemSummarySchema.parse({
    provider: 'codeforces',
    externalId: `${externalId}A`,
    title: `Arrays exercise ${externalId}`,
    canonicalUrl: `https://codeforces.com/problemset/problem/${externalId}/A`,
    providerDifficulty:
      normalizedDifficulty === 'easy'
        ? 900
        : normalizedDifficulty === 'medium'
          ? 1300
          : 1800,
    normalizedDifficulty,
    providerTags: ['implementation', 'arrays'],
    topics: ['arrays'],
    solvedCount: 1000,
    fetchedAt: timestamp,
  }),
)

const authorization = (token: string) => ({
  authorization: `Bearer ${token}`,
})

const verifier: SupabaseJwtVerifier = async (token) => {
  if (token === 'user-a')
    return { subject: userA, claims: { role: 'authenticated' } }
  if (token === 'user-b')
    return { subject: userB, claims: { role: 'authenticated' } }
  throw new Error('Invalid test token.')
}

const servers: ReturnType<ReturnType<typeof createApp>['listen']>[] = []

const solvedProblem = (externalId: string): ProviderSolvedProblem => ({
  provider: 'codeforces',
  externalId,
  canonicalUrl: `https://codeforces.com/problemset/problem/${externalId.slice(0, -1)}/A`,
  occurredAt: timestamp,
  firstObservedAt: timestamp,
  lastObservedAt: timestamp,
  topics: ['arrays'],
  completeness: 'complete',
  provenance: {
    provider: 'codeforces',
    providerId: externalId,
    canonicalUrl: `https://codeforces.com/problemset/problem/${externalId.slice(0, -1)}/A`,
    sourceUrl: 'https://codeforces.com/api/user.status',
    extractionStrategy: 'official_json',
    schemaVersion: 'test-v1',
    completeness: 'complete',
    fetchedAt: timestamp,
    stale: false,
  },
})

const createMemoryClient = (): AiMemoryClient => ({
  processEvidence: async () => ({ status: 'processed' }),
  deleteLearnerData: async () => undefined,
  deleteProblemEvidence: async () => undefined,
  deleteLearnerPreference: async () => undefined,
  listMemories: async () => [],
  correctMemory: async () => {
    throw new Error('Not used in coach tests.')
  },
  actOnMemory: async () => {
    throw new Error('Not used in coach tests.')
  },
})

const startApp = (options: {
  aiCoachClient?: AiCoachClient
  aiMemoryClient?: AiMemoryClient
  learnerProfileRepository?: InMemoryLearnerProfileRepository
  coachRepository?: InMemoryCoachRepository
  progressRepository?: InMemoryProgressRepository
  actionRepository?: InMemoryProblemActionRepository
  providerDataRepository?: InMemoryProviderDataRepository
  bookmarkRepository?: InMemoryBookmarkRepository
  internalServiceToken?: string
  provider?: ProblemProvider
}) => {
  const defaultProvider: ProblemProvider = {
    key: 'codeforces',
    search: vi.fn(async () => ({
      problems,
      freshness: providerFreshness,
      warnings: [],
    })),
    getHealth: () => providerFreshness,
  }
  const provider = options.provider ?? defaultProvider
  const appOptions = {
    jwtVerifier: verifier,
    problemProvider: provider,
    problemProviders: [provider],
    aiMemoryClient: options.aiMemoryClient ?? createMemoryClient(),
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    ...(options.aiCoachClient === undefined
      ? {}
      : { aiCoachClient: options.aiCoachClient }),
    ...(options.learnerProfileRepository === undefined
      ? {}
      : { learnerProfileRepository: options.learnerProfileRepository }),
    ...(options.coachRepository === undefined
      ? {}
      : { coachRepository: options.coachRepository }),
    ...(options.progressRepository === undefined
      ? {}
      : { progressRepository: options.progressRepository }),
    ...(options.actionRepository === undefined
      ? {}
      : { problemActionRepository: options.actionRepository }),
    ...(options.providerDataRepository === undefined
      ? {}
      : { providerDataRepository: options.providerDataRepository }),
    ...(options.bookmarkRepository === undefined
      ? {}
      : { bookmarkRepository: options.bookmarkRepository }),
    ...(options.internalServiceToken === undefined
      ? {}
      : { internalServiceToken: options.internalServiceToken }),
  }
  const server = createApp(appOptions).listen(0)
  servers.push(server)
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) =>
            error === undefined ? resolve() : reject(error),
          )
        }),
    ),
  )
})

describe('coach API', () => {
  it('validates the curated prerequisite graph and rejects cycles or unknown topics', () => {
    expect(validateCoachPrerequisiteGraph(CoachTopicDefinitions)).toBe(true)
    expect(() =>
      validateCoachPrerequisiteGraph([
        { slug: 'a', name: 'A', prerequisites: ['b'] },
        { slug: 'b', name: 'B', prerequisites: ['a'] },
      ]),
    ).toThrow('Cycle in coach topic prerequisites')
    expect(() =>
      validateCoachPrerequisiteGraph([
        { slug: 'a', name: 'A', prerequisites: ['missing'] },
      ]),
    ).toThrow('Unknown coach prerequisite topic')
  })

  it('turns explicit free-text topic exclusions into coach constraints', () => {
    expect(
      extractCoachTopicExclusions(
        "I don't want practice linked list, so don't mention it anywhere.",
      ),
    ).toEqual(['linked-lists'])
    expect(
      extractCoachTopicExclusions('Prefer graph practice this week.'),
    ).toEqual([])
  })

  it('requires authentication and preserves manual roadmap status precedence', async () => {
    const progressRepository = new InMemoryProgressRepository()
    const actionRepository = new InMemoryProblemActionRepository()
    const providerDataRepository = new InMemoryProviderDataRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    await providerDataRepository.saveSolvedProblems(userA, 'account-a', [
      solvedProblem('100A'),
    ])
    await actionRepository.appendByAuthUserId(userA, {
      provider: 'codeforces',
      externalId: '101A',
      actionType: 'dismissed',
    })
    const baseUrl = startApp({
      progressRepository,
      actionRepository,
      providerDataRepository,
    })

    const unauthenticated = await fetch(`${baseUrl}/api/coach/roadmap`)
    expect(unauthenticated.status).toBe(401)

    const firstResponse = await fetch(`${baseUrl}/api/coach/roadmap`, {
      headers: authorization('user-a'),
    })
    const first = ImprovementRoadmapResponseSchema.parse(
      await firstResponse.json(),
    )
    const arrays = first.data.topics.find((topic) => topic.topic === 'arrays')
    expect(firstResponse.status).toBe(200)
    expect(arrays?.manualStatus).toBeUndefined()
    expect(
      arrays?.suggestions.map((item) => item.problem.externalId),
    ).not.toContain('100A')
    expect(
      arrays?.suggestions.map((item) => item.problem.externalId),
    ).not.toContain('101A')
    expect(arrays?.suggestions.length).toBeLessThanOrEqual(5)

    const statusResponse = await fetch(
      `${baseUrl}/api/coach/roadmap/topics/arrays/status`,
      {
        method: 'PATCH',
        headers: {
          ...authorization('user-a'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'working_on' }),
      },
    )
    const status = ImprovementRoadmapResponseSchema.parse(
      await statusResponse.json(),
    )
    const updatedArrays = status.data.topics.find(
      (topic) => topic.topic === 'arrays',
    )
    expect(statusResponse.status).toBe(200)
    expect(updatedArrays).toMatchObject({
      manualStatus: 'working_on',
      lane: 'current_focus',
    })

    const resetResponse = await fetch(
      `${baseUrl}/api/coach/roadmap/topics/arrays/status`,
      {
        method: 'PATCH',
        headers: {
          ...authorization('user-a'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: null }),
      },
    )
    const reset = ImprovementRoadmapResponseSchema.parse(
      await resetResponse.json(),
    )
    expect(
      reset.data.topics.find((topic) => topic.topic === 'arrays')?.manualStatus,
    ).toBeUndefined()
  })

  it('joins provider activity to catalog topics by canonical URL when IDs differ', async () => {
    const leetcodeProblem = ExternalProblemSummarySchema.parse({
      provider: 'leetcode',
      externalId: '204',
      title: 'Count Primes',
      canonicalUrl: 'https://leetcode.com/problems/count-primes/',
      normalizedDifficulty: 'medium',
      providerTags: ['array', 'math'],
      topics: ['array', 'math'],
      fetchedAt: timestamp,
    })
    const leetcodeProvider: ProblemProvider = {
      key: 'leetcode',
      search: vi.fn(async () => ({
        problems: [leetcodeProblem],
        freshness: {
          provider: 'leetcode' as const,
          availability: 'available' as const,
          stale: false,
          fetchedAt: timestamp,
        },
        warnings: [],
      })),
      getHealth: () => ({
        provider: 'leetcode' as const,
        availability: 'available' as const,
        stale: false,
        fetchedAt: timestamp,
      }),
    }
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const providerDataRepository = new InMemoryProviderDataRepository()
    await providerDataRepository.saveSolvedProblems(userA, 'leetcode-account', [
      {
        provider: 'leetcode',
        externalId: 'count-primes',
        canonicalUrl: leetcodeProblem.canonicalUrl,
        occurredAt: timestamp,
        firstObservedAt: timestamp,
        lastObservedAt: timestamp,
        completeness: 'complete',
        provenance: {
          provider: 'leetcode',
          providerId: 'count-primes',
          canonicalUrl: leetcodeProblem.canonicalUrl,
          sourceUrl: 'https://leetcode.com/graphql',
          extractionStrategy: 'public_graphql',
          schemaVersion: 'test-v1',
          completeness: 'complete',
          fetchedAt: timestamp,
          stale: false,
        },
      },
    ])
    const baseUrl = startApp({
      progressRepository,
      providerDataRepository,
      provider: leetcodeProvider,
    })

    const response = await fetch(`${baseUrl}/api/coach/roadmap`, {
      headers: authorization('user-a'),
    })
    const roadmap = ImprovementRoadmapResponseSchema.parse(
      await response.json(),
    )
    const arrays = roadmap.data.topics.find((topic) => topic.topic === 'arrays')

    expect(response.status).toBe(200)
    expect(arrays?.evidence.solvedProblems).toBe(1)
    expect(arrays?.evidence.uniqueProblems).toBe(1)
    expect(
      arrays?.suggestions.map((suggestion) => suggestion.problem.externalId),
    ).not.toContain('204')

    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    const create = await fetch(`${baseUrl}/api/coach/conversations`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const conversationId = (await create.json()).data.id as string
    const coachResponse = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: "don't you have data of codeforces and leetcode?",
        }),
      },
    )
    const coachBody = CoachResponseSchema.parse(await coachResponse.json())
    expect(coachResponse.status).toBe(200)
    expect(coachBody.message.fallback).toBe(true)
    expect(
      coachBody.message.evidence.some((item) => item.source === 'activity'),
    ).toBe(true)
    expect(coachBody.message.richContent?.version).toBe('coach-rich-v2')
  })

  it('stores proposals, requires consent, revalidates ownership, and confirms idempotently', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const proposal: CoachActionProposal = {
      id: proposalId,
      actionType: 'set_topic_status',
      status: 'proposed',
      label: 'Keep Arrays in focus',
      reason: 'Your recent attempts support a focused practice block.',
      topic: 'arrays',
      topicStatus: 'working_on',
    }
    const aiCoachClient: AiCoachClient = {
      respond: vi.fn(async (): Promise<AiCoachResult> => ({
        answer: 'Keep one focused Arrays block this week.',
        evidence: [],
        proposals: [proposal],
      })),
    }
    const baseUrl = startApp({ aiCoachClient, progressRepository })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    const create = await fetch(`${baseUrl}/api/coach/conversations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'Roadmap review' }),
    })
    const conversation = (await create.json()).data as { id: string }
    const response = await fetch(
      `${baseUrl}/api/coach/conversations/${conversation.id}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: 'What should I practice next?' }),
      },
    )
    const coachResponse = CoachResponseSchema.parse(await response.json())
    expect(response.status).toBe(200)
    expect(coachResponse.message.proposals[0]?.status).toBe('proposed')
    expect(coachResponse.message.richContent?.version).toBe('coach-rich-v2')

    const forbidden = await fetch(
      `${baseUrl}/api/coach/action-proposals/${proposalId}/confirm`,
      {
        method: 'POST',
        headers: {
          ...authorization('user-b'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ confirmation: 'CONFIRM' }),
      },
    )
    expect(forbidden.status).toBe(404)

    const confirmation = await fetch(
      `${baseUrl}/api/coach/action-proposals/${proposalId}/confirm`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirmation: 'CONFIRM' }),
      },
    )
    const confirmed = CoachActionProposalResponseSchema.parse(
      await confirmation.json(),
    )
    expect(confirmation.status).toBe(200)
    expect(confirmed.data.status).toBe('confirmed')

    const replay = await fetch(
      `${baseUrl}/api/coach/action-proposals/${proposalId}/confirm`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirmation: 'CONFIRM' }),
      },
    )
    expect(replay.status).toBe(200)
    expect(
      (await CoachActionProposalResponseSchema.parse(await replay.json())).data
        .status,
    ).toBe('confirmed')

    const noConsentProgress = new InMemoryProgressRepository()
    const noConsentUrl = startApp({ progressRepository: noConsentProgress })
    const noConsentConversation = await fetch(
      `${noConsentUrl}/api/coach/conversations`,
      { method: 'POST', headers, body: '{}' },
    )
    const noConsentConversationId = (await noConsentConversation.json()).data.id
    const noConsentResponse = await fetch(
      `${noConsentUrl}/api/coach/conversations/${noConsentConversationId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: 'Explain arrays.' }),
      },
    )
    expect(noConsentResponse.status).toBe(403)
  })

  it('sends bounded problem identities to AI without canonical URLs', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    let captured: AiCoachRequest | undefined
    const aiCoachClient: AiCoachClient = {
      respond: vi.fn(async (request): Promise<AiCoachResult> => {
        captured = request
        return {
          answer: 'Use one foundation problem, then reflect on the blocker.',
          evidence: [],
          proposals: [],
        }
      }),
    }
    const baseUrl = startApp({ aiCoachClient, progressRepository })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    const create = await fetch(`${baseUrl}/api/coach/conversations`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const conversationId = (await create.json()).data.id as string
    const response = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: 'What should I practice next?' }),
      },
    )

    expect(response.status).toBe(200)
    expect(JSON.stringify(captured)).not.toContain('canonicalUrl')
    expect(JSON.stringify(captured)).not.toContain('https://codeforces.com')
  })

  it('honors a learner topic exclusion in roadmap, rich content, and AI output', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const learnerProfileRepository = new InMemoryLearnerProfileRepository()
    await learnerProfileRepository.upsertByAuthUserId(userA, {
      experience: 'intermediate',
      difficultyComfort: 'medium',
      goal: 'improve_problem_solving',
      topicPreference: { mode: 'let_algomemtor_suggest' },
      preferredTopics: [],
      platformPreferences: { platforms: ['codeforces'], standings: [] },
      learningPreferences: ['mixed_approach'],
      recommendationPreference:
        "I don't want practice linked list, so don't mention it anywhere.",
    })
    let captured: AiCoachRequest | undefined
    const aiCoachClient: AiCoachClient = {
      respond: vi.fn(async (request): Promise<AiCoachResult> => {
        captured = request
        return {
          answer: 'Linked Lists are the best next topic.',
          evidence: [],
          proposals: [],
        }
      }),
    }
    const baseUrl = startApp({
      aiCoachClient,
      learnerProfileRepository,
      progressRepository,
    })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    const create = await fetch(`${baseUrl}/api/coach/conversations`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const conversationId = (await create.json()).data.id as string
    const response = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: 'Which topics are weakest right now?',
        }),
      },
    )
    const body = await response.json()
    const coachResponse = CoachResponseSchema.parse(body)
    expect(response.status).toBe(200)
    expect(coachResponse.message.fallback).toBeUndefined()
    expect(coachResponse.message.content).toContain(
      '[topic omitted by learner]',
    )
    expect(JSON.stringify(body).toLowerCase()).not.toContain('linked list')
    expect(
      coachResponse.roadmap.topics.map((topic) => topic.topic),
    ).not.toContain('linked-lists')
    expect(captured?.context.excludedTopics).toEqual(['linked-lists'])
    expect(captured?.context.userInstructions).toHaveLength(1)
    expect(
      JSON.stringify(captured?.context.userInstructions).toLowerCase(),
    ).not.toContain('linked list')
    expect(
      JSON.stringify(captured?.context.profile).toLowerCase(),
    ).not.toContain('linked list')
  })

  it('keeps rating visualization scoped to the requested provider', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const providerDataRepository = new InMemoryProviderDataRepository()
    const provenance = {
      provider: 'codeforces' as const,
      providerId: 'learner',
      canonicalUrl: 'https://codeforces.com/profile/learner',
      sourceUrl: 'https://codeforces.com/api/user.info',
      extractionStrategy: 'official_json' as const,
      schemaVersion: 'test-v1',
      completeness: 'complete' as const,
      fetchedAt: timestamp,
      stale: false,
    }
    const ratings: ProviderRatingChange[] = [
      {
        provider: 'codechef',
        eventId: 'cc-1',
        occurredAt: '2026-09-16T12:00:00.000Z',
        oldRating: 1700,
        newRating: 1707,
        delta: 7,
        provenance: { ...provenance, provider: 'codechef' },
      },
      {
        provider: 'codeforces',
        eventId: 'cf-1',
        occurredAt: '2026-09-15T12:00:00.000Z',
        oldRating: 1190,
        newRating: 1210,
        delta: 20,
        provenance,
      },
    ]
    await providerDataRepository.saveRatingChanges(
      userA,
      'mixed-account',
      ratings,
    )
    const baseUrl = startApp({ progressRepository, providerDataRepository })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    const create = await fetch(`${baseUrl}/api/coach/conversations`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const conversationId = (await create.json()).data.id as string
    const response = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: 'How can I increase my rating on Codeforces?',
        }),
      },
    )
    const coachResponse = CoachResponseSchema.parse(await response.json())
    expect(response.status).toBe(200)
    const timeline = coachResponse.message.richContent?.blocks.find(
      (block) => block.type === 'timeline',
    )
    expect(JSON.stringify(timeline).toLowerCase()).toContain('codeforces')
    expect(JSON.stringify(timeline)).toContain('20')
    expect(JSON.stringify(timeline).toLowerCase()).not.toContain('codechef')
  })

  it('builds rich content from deterministic evidence and filters unsafe citations', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const actionRepository = new InMemoryProblemActionRepository()
    await actionRepository.appendByAuthUserId(userA, {
      provider: 'codeforces',
      externalId: '100A',
      actionType: 'status_changed',
      learnerStatus: 'attempted',
      evidenceSource: 'manual',
    })
    const coachRepository = new InMemoryCoachRepository()
    await coachRepository.setTopicStatus(userA, 'arrays', 'working_on')
    const aiCoachClient: AiCoachClient = {
      respond: vi.fn(async (): Promise<AiCoachResult> => ({
        answer: 'Use the current focus and review the invariant first.',
        evidence: [],
        proposals: [],
        citations: [
          {
            id: 'unsafe-web',
            source: 'web',
            title: 'Unsafe source',
            url: 'https://localhost/private',
            retrievedAt: timestamp,
            stale: false,
          },
          {
            id: 'safe-web',
            source: 'web',
            title: 'CP reference',
            url: 'https://cp-algorithms.com',
            retrievedAt: timestamp,
            stale: false,
          },
        ],
      })),
    }
    const baseUrl = startApp({
      aiCoachClient,
      progressRepository,
      actionRepository,
      coachRepository,
    })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    const create = await fetch(`${baseUrl}/api/coach/conversations`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const conversationId = (await create.json()).data.id as string
    const response = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: 'What should I practice next? Show my progress.',
        }),
      },
    )
    const coachResponse = CoachResponseSchema.parse(await response.json())
    const richContent = coachResponse.message.richContent
    expect(response.status).toBe(200)
    expect(richContent?.version).toBe('coach-rich-v2')
    expect(
      richContent?.blocks.some(
        (block) =>
          block.type === 'chart' && block.datasetId === 'topic-assessments',
      ),
    ).toBe(true)
    expect(richContent?.citations.map((citation) => citation.id)).toContain(
      'safe-web',
    )
    expect(richContent?.citations.map((citation) => citation.id)).not.toContain(
      'unsafe-web',
    )
  })

  it('hydrates only model-selected trusted problem identities', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const coachRepository = new InMemoryCoachRepository()
    await coachRepository.setTopicStatus(userA, 'arrays', 'working_on')
    let capturedRequest: AiCoachRequest | undefined
    const aiCoachClient: AiCoachClient = {
      respond: vi.fn(async (request): Promise<AiCoachResult> => {
        capturedRequest = request
        return {
          answer: 'Start with the selected foundation problem.',
          evidence: [],
          proposals: [],
          presentation: {
            datasetIds: ['trusted-problems'],
            problemIds: ['codeforces:101A', 'codeforces:999A'],
            suggestedQuestions: ['Show me the invariant.'],
          },
        }
      }),
    }
    const baseUrl = startApp({
      aiCoachClient,
      progressRepository,
      coachRepository,
    })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    const create = await fetch(`${baseUrl}/api/coach/conversations`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const conversationId = (await create.json()).data.id as string
    const response = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: 'What should I practice next?' }),
      },
    )
    const coachResponse = CoachResponseSchema.parse(await response.json())
    const problemBlock = coachResponse.message.richContent?.blocks.find(
      (block) => block.type === 'problem_list',
    )
    const availableProblems = capturedRequest?.context[
      'availablePresentationProblems'
    ] as Array<{ id: string }> | undefined

    expect(response.status).toBe(200)
    expect(
      availableProblems?.some((problem) => problem.id === 'codeforces:101A'),
    ).toBe(true)
    expect(problemBlock?.type).toBe('problem_list')
    if (problemBlock?.type === 'problem_list') {
      expect(
        problemBlock.problems.map((problem) => problem.externalId),
      ).toEqual(['101A'])
    }
  })

  it('hydrates only grounded web citations selected as problems', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const aiCoachClient: AiCoachClient = {
      respond: vi.fn(async (): Promise<AiCoachResult> => ({
        answer:
          'Try the grounded practice problem after reviewing the pattern.',
        evidence: [],
        proposals: [],
        citations: [
          {
            id: 'web-1',
            source: 'web',
            title: 'Official sliding-window practice problem',
            url: 'https://example.com/problems/sliding-window',
            publisher: 'Example judge',
            retrievedAt: '2026-09-18T12:00:00.000Z',
            stale: false,
          },
        ],
        presentation: {
          datasetIds: [],
          problemIds: [],
          webProblemCitationIds: ['web-1', 'web-99'],
          suggestedQuestions: ['Give me the first hint.'],
        },
      })),
    }
    const baseUrl = startApp({ aiCoachClient, progressRepository })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    const create = await fetch(`${baseUrl}/api/coach/conversations`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const conversationId = (await create.json()).data.id as string
    const response = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: 'Find a sliding-window problem for me online.',
        }),
      },
    )
    const coachResponse = CoachResponseSchema.parse(await response.json())
    const block = coachResponse.message.richContent?.blocks.find(
      (candidate) => candidate.type === 'web_problem_list',
    )

    expect(response.status).toBe(200)
    expect(block?.type).toBe('web_problem_list')
    if (block?.type === 'web_problem_list') {
      expect(block.problems.map((problem) => problem.citationId)).toEqual([
        'web-1',
      ])
      expect(block.problems[0]?.url).toBe(
        'https://example.com/problems/sliding-window',
      )
    }
  })

  it('preserves generated inline identifiers while omitting generated code blocks', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const aiCoachClient: AiCoachClient = {
      respond: vi.fn(async (): Promise<AiCoachResult> => ({
        answer:
          'Move the `left` pointer after expanding `right`.\n```cpp\nint total = 0;\n```',
        evidence: [],
        proposals: [],
      })),
    }
    const baseUrl = startApp({ aiCoachClient, progressRepository })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    const create = await fetch(`${baseUrl}/api/coach/conversations`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const conversationId = (await create.json()).data.id as string
    const response = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: 'Explain the pointer movement.' }),
      },
    )
    const coachResponse = CoachResponseSchema.parse(await response.json())

    expect(coachResponse.message.content).toContain('left')
    expect(coachResponse.message.content).toContain('right')
    expect(coachResponse.message.content).toContain('[code omitted]')
    expect(coachResponse.message.content).not.toContain('int total')
  })

  it('omits transient code from saved conversation history', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const aiCoachClient: AiCoachClient = {
      respond: vi.fn(async (): Promise<AiCoachResult> => ({
        answer: 'Try this next:\n```ts\nconst secret = 1\n```',
        evidence: [],
        proposals: [],
      })),
    }
    const baseUrl = startApp({ aiCoachClient, progressRepository })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    const create = await fetch(`${baseUrl}/api/coach/conversations`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const conversationId = (await create.json()).data.id as string
    const response = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: 'Please debug this:\n```cpp\nint main() {}\n```',
          transientContext: 'copied problem statement omitted',
        }),
      },
    )
    expect(response.status).toBe(200)
    const history = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}`,
      { headers: authorization('user-a') },
    )
    const saved = (await history.json()).messages as Array<{
      content: string
      transientContextOmitted?: boolean
    }>
    expect(
      saved.every((message) => !message.content.includes('int main')),
    ).toBe(true)
    expect(saved.at(-1)?.content).toContain('[code omitted]')
    expect(saved[0]?.transientContextOmitted).toBe(true)
  })

  it('omits code-like text even when it is not fenced', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const aiCoachClient: AiCoachClient = {
      respond: vi.fn(async (): Promise<AiCoachResult> => ({
        answer: 'The trace is useful; int total = 0; then update it each loop.',
        evidence: [],
        proposals: [],
      })),
    }
    const baseUrl = startApp({ aiCoachClient, progressRepository })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    const create = await fetch(`${baseUrl}/api/coach/conversations`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const conversationId = (await create.json()).data.id as string
    const response = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: 'Please explain this code: int total = 0; return total;',
        }),
      },
    )
    expect(response.status).toBe(200)
    const history = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}`,
      { headers: authorization('user-a') },
    )
    const saved = (await history.json()).messages as Array<{
      content: string
    }>
    expect(
      saved.every((message) => !message.content.includes('int total')),
    ).toBe(true)
    expect(saved.at(-1)?.content).toContain('[code omitted]')
  })

  it('does not turn transient context into a durable memory proposal', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const aiCoachClient: AiCoachClient = {
      respond: vi.fn(async (): Promise<AiCoachResult> => ({
        answer: 'Use a small trace table before changing the loop.',
        evidence: [],
        proposals: [
          {
            id: '00000000-0000-4000-8000-000000000098',
            actionType: 'save_memory',
            status: 'proposed',
            label: 'Save this debugging note',
            reason: 'The temporary code suggests this may help later.',
            memoryText: 'The learner prefers this exact temporary code.',
            memoryCategory: 'preference',
          },
        ],
      })),
    }
    const baseUrl = startApp({ aiCoachClient, progressRepository })
    const headers = {
      ...authorization('user-a'),
      'content-type': 'application/json',
    }
    const create = await fetch(`${baseUrl}/api/coach/conversations`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const conversationId = (await create.json()).data.id as string
    const response = await fetch(
      `${baseUrl}/api/coach/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: 'Please debug this loop.',
          transientContext: 'for (let i = 0; i < n; i += 1) total += i',
        }),
      },
    )

    const coachResponse = CoachResponseSchema.parse(await response.json())
    expect(response.status).toBe(200)
    expect(coachResponse.message.proposals).toEqual([])
  })

  it('protects durable coach refreshes with the internal service token', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const baseUrl = startApp({
      progressRepository,
      internalServiceToken: 'internal-test-token',
    })

    const unauthorized = await fetch(
      `${baseUrl}/internal/coach/check-ins/refresh`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ learnerId: userA }),
      },
    )
    expect(unauthorized.status).toBe(401)

    const refreshed = await fetch(
      `${baseUrl}/internal/coach/check-ins/refresh`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-service-token': 'internal-test-token',
        },
        body: JSON.stringify({ learnerId: userA }),
      },
    )
    expect(refreshed.status).toBe(200)
    expect(await refreshed.json()).toMatchObject({ created: 0 })
  })

  it('clears derived conversation summaries when coaching consent is revoked', async () => {
    const progressRepository = new InMemoryProgressRepository()
    await progressRepository.saveConsent(
      userA,
      true,
      'personalized-coaching-rag-v2',
    )
    const coachRepository = new InMemoryCoachRepository()
    const conversation = await coachRepository.createConversation(userA)
    await coachRepository.updateSummary(
      userA,
      conversation.id,
      'Derived rolling summary that should be removed.',
    )
    const baseUrl = startApp({ progressRepository, coachRepository })
    const response = await fetch(`${baseUrl}/api/ai-consent`, {
      method: 'PUT',
      headers: {
        ...authorization('user-a'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        enabled: false,
        policyVersion: 'personalized-coaching-rag-v2',
      }),
    })
    expect(response.status).toBe(200)

    const history = await fetch(
      `${baseUrl}/api/coach/conversations/${conversation.id}`,
      { headers: authorization('user-a') },
    )
    expect((await history.json()).data.summary).toBeUndefined()
  })
})
