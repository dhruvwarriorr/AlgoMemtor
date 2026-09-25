import type { AddressInfo } from 'node:net'

import {
  CoachResponseSchema,
  ProblemHelpSessionResponseSchema,
  SolutionExplorationResponseSchema,
  UpsolveResponseSchema,
  type ProblemContent,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from './app.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import type { AiCoachClient } from './integrations/ai/ai-coach-client.js'
import type { AiMemoryClient } from './integrations/ai/ai-memory-client.js'
import type {
  AiMentorClient,
  AiProblemHelpRequest,
} from './integrations/ai/ai-mentor-client.js'
import type { ProblemProvider } from './integrations/providers/problem-provider.js'
import { InMemoryMentorRepository } from './repositories/mentor-repository.js'

const userA = '00000000-0000-4000-8000-000000000021'
const userB = '00000000-0000-4000-8000-000000000022'
const problemUrl = 'https://codeforces.com/problemset/problem/2266/G'

const verifier: SupabaseJwtVerifier = async (token) => {
  if (token === 'user-a') return { subject: userA, claims: {} }
  if (token === 'user-b') return { subject: userB, claims: {} }
  throw new Error('Invalid test token.')
}

const freshness = {
  provider: 'codeforces' as const,
  availability: 'available' as const,
  stale: false,
  fetchedAt: '2026-09-10T00:00:00.000Z',
}

const content = (externalId: string): ProblemContent => ({
  provider: 'codeforces',
  externalId,
  canonicalUrl: problemUrl,
  title: 'G. Grid Paths',
  statementText: 'Count the paths in an n by m grid.',
  constraints: ['1 <= n, m <= 2*10^5'],
  examples: [{ input: '2 2', output: '2' }],
  hints: [],
  isPaidOnly: false,
  completeness: 'complete',
  provenance: {
    provider: 'codeforces',
    providerId: externalId,
    canonicalUrl: problemUrl,
    sourceUrl: problemUrl,
    extractionStrategy: 'sanitized_html',
    schemaVersion: 'test',
    completeness: 'complete',
    fetchedAt: '2026-09-10T00:00:00.000Z',
    stale: false,
  },
})

const provider: ProblemProvider = {
  key: 'codeforces',
  search: vi.fn(async () => ({ problems: [], freshness, warnings: [] })),
  getHealth: () => freshness,
  getContent: vi.fn(async (externalId: string) => ({
    content: content(externalId),
    freshness,
    warnings: [],
  })),
}

const memoryClient: AiMemoryClient = {
  processEvidence: async () => ({ status: 'processed' }),
  deleteLearnerData: async () => undefined,
  deleteProblemEvidence: async () => undefined,
  deleteLearnerPreference: async () => undefined,
  listMemories: async () => [],
  correctMemory: async () => {
    throw new Error('Not used.')
  },
  actOnMemory: async () => {
    throw new Error('Not used.')
  },
}

const fakeMentor = () => {
  const requests: AiProblemHelpRequest[] = []
  const client: AiMentorClient = {
    problemHelp: vi.fn(async (request: AiProblemHelpRequest) => {
      requests.push(request)
      return {
        answer: `## Hint ${request.hintLevel}\nThink about ${request.phase}.`,
        ...(request.doubtType === 'wrong_answer'
          ? { bugCategory: 'off_by_one' as const }
          : {}),
        guardRepaired: false,
        problemUnavailable: false,
      }
    }),
    solutions: vi.fn(async () => ({
      summary: 'Count paths with DP.',
      approaches: [
        {
          kind: 'brute_force' as const,
          name: 'Enumerate paths',
          idea: 'Try every path.',
          keyInsight: 'Exponential.',
          whyItWorks: 'Checks all paths.',
          timeComplexity: 'O(2^(n+m))',
          spaceComplexity: 'O(n+m)',
        },
      ],
      comparison: 'DP wins.',
      thinkingLessons: ['Count, do not enumerate.'],
      community: [
        {
          title: 'Contest page',
          url: 'https://codeforces.com/contest/2266',
          publisher: 'Codeforces',
          kind: 'editorial' as const,
          official: true,
        },
      ],
    })),
    contestAnalysis: vi.fn(async () => {
      throw new Error('Not used.')
    }),
    contestPatterns: vi.fn(async () => {
      throw new Error('Not used.')
    }),
    progressNarrative: vi.fn(async () => {
      throw new Error('Not used.')
    }),
  }
  return { client, requests }
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

const startApp = (options: {
  mentor: AiMentorClient
  repository?: InMemoryMentorRepository
  coach?: AiCoachClient
}) => {
  const server = createApp({
    jwtVerifier: verifier,
    problemProvider: provider,
    problemProviders: [provider],
    aiMemoryClient: memoryClient,
    aiMentorClient: options.mentor,
    mentorRepository: options.repository ?? new InMemoryMentorRepository(),
    ...(options.coach === undefined ? {} : { aiCoachClient: options.coach }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }).listen(0)
  servers.push(server)
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const headers = (token: string) => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
})

const post = (baseUrl: string, path: string, token: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  })

describe('Doubt Helper API', () => {
  it('walks the hint ladder and only reveals the solution after confirmation', async () => {
    const mentor = fakeMentor()
    const repository = new InMemoryMentorRepository()
    const baseUrl = startApp({ mentor: mentor.client, repository })
    const secretCode = 'int main(){ /* learner secret */ }'

    const started = await post(
      baseUrl,
      '/api/problem-help/sessions',
      'user-a',
      {
        problemUrl,
        language: 'C++17',
        doubtType: 'wrong_answer',
        attemptSummary: 'I used a greedy walk.',
        transientCode: secretCode,
        transientError: 'wrong answer on test 3',
      },
    )
    expect(started.status).toBe(201)
    const session = ProblemHelpSessionResponseSchema.parse(await started.json())
    expect(session.data).toMatchObject({
      stage: 'hinting',
      hintLevel: 1,
      bugCategory: 'off_by_one',
      problem: {
        provider: 'codeforces',
        externalId: '2266G',
        title: 'G. Grid Paths',
      },
    })
    expect(session.turns.map((turn) => turn.kind)).toEqual([
      'intake',
      'diagnosis',
    ])
    expect(JSON.stringify(session)).not.toContain('learner secret')
    expect(mentor.requests[0]).toMatchObject({
      phase: 'first_turn',
      hintLevel: 1,
      transientCode: secretCode,
    })
    expect(mentor.requests[0]?.problem.statement).toContain('Count the paths')

    // A crafted confirm cannot skip the confirmation step.
    const locked = await post(
      baseUrl,
      `/api/problem-help/sessions/${session.data.id}/turns`,
      'user-a',
      { action: 'confirm_solution', expectedVersion: 1 },
    )
    expect(locked.status).toBe(409)
    expect((await locked.json()).error.code).toBe(
      'PROBLEM_HELP_SOLUTION_LOCKED',
    )

    let version = session.data.version
    for (const expected of [2, 3, 4]) {
      const next = await post(
        baseUrl,
        `/api/problem-help/sessions/${session.data.id}/turns`,
        'user-a',
        { action: 'next_hint', expectedVersion: version },
      )
      const body = ProblemHelpSessionResponseSchema.parse(await next.json())
      expect(body.data.hintLevel).toBe(expected)
      version = body.data.version
    }
    const beyond = await post(
      baseUrl,
      `/api/problem-help/sessions/${session.data.id}/turns`,
      'user-a',
      { action: 'next_hint', expectedVersion: version },
    )
    expect(beyond.status).toBe(409)

    const stale = await post(
      baseUrl,
      `/api/problem-help/sessions/${session.data.id}/turns`,
      'user-a',
      { action: 'request_solution', expectedVersion: 1 },
    )
    expect((await stale.json()).error.code).toBe('PROBLEM_HELP_STALE_VERSION')

    const aiCallsBeforeReveal = mentor.requests.length
    const requested = ProblemHelpSessionResponseSchema.parse(
      await (
        await post(
          baseUrl,
          `/api/problem-help/sessions/${session.data.id}/turns`,
          'user-a',
          { action: 'request_solution', expectedVersion: version },
        )
      ).json(),
    )
    expect(requested.data.stage).toBe('solution_confirmation')
    expect(mentor.requests.length).toBe(aiCallsBeforeReveal)

    const revealed = ProblemHelpSessionResponseSchema.parse(
      await (
        await post(
          baseUrl,
          `/api/problem-help/sessions/${session.data.id}/turns`,
          'user-a',
          {
            action: 'confirm_solution',
            expectedVersion: requested.data.version,
          },
        )
      ).json(),
    )
    expect(revealed.data).toMatchObject({
      stage: 'solution_revealed',
      hintLevel: 5,
    })
    expect(revealed.turns.at(-1)?.kind).toBe('solution')
    expect(mentor.requests.at(-1)?.phase).toBe('full_solution')

    const otherUser = await fetch(
      `${baseUrl}/api/problem-help/sessions/${session.data.id}`,
      { headers: headers('user-b') },
    )
    expect(otherUser.status).toBe(404)

    const completed = ProblemHelpSessionResponseSchema.parse(
      await (
        await post(
          baseUrl,
          `/api/problem-help/sessions/${session.data.id}/turns`,
          'user-a',
          { action: 'complete', expectedVersion: revealed.data.version },
        )
      ).json(),
    )
    expect(completed.data.stage).toBe('completed')
    expect(await repository.listRevisions(userA)).toHaveLength(1)
  })

  it('requires code for debugging doubts and rejects unknown links', async () => {
    const mentor = fakeMentor()
    const baseUrl = startApp({ mentor: mentor.client })
    const missingCode = await post(
      baseUrl,
      '/api/problem-help/sessions',
      'user-a',
      {
        problemUrl,
        language: 'Python',
        doubtType: 'compilation_error',
        attemptSummary: 'It does not compile.',
      },
    )
    expect(missingCode.status).toBe(400)
    const pasted = await post(baseUrl, '/api/problem-help/sessions', 'user-a', {
      problemTitle: 'My school problem',
      transientStatement: 'Given n, print n squared.',
      language: 'Python',
      doubtType: 'understand_problem',
      attemptSummary: 'I do not get the output format.',
    })
    expect(pasted.status).toBe(201)
    expect(mentor.requests.at(-1)?.problem).toMatchObject({
      platform: 'other',
      statement: 'Given n, print n squared.',
    })
  })
})

describe('Solution Explorer API', () => {
  it('opens only after an attempt and reuses the cached exploration', async () => {
    const mentor = fakeMentor()
    const baseUrl = startApp({ mentor: mentor.client })
    const locked = await post(baseUrl, '/api/solutions/explore', 'user-a', {
      problemUrl,
      language: 'C++17',
    })
    expect(locked.status).toBe(409)
    expect((await locked.json()).error.code).toBe('SOLUTION_LOCKED')

    const first = SolutionExplorationResponseSchema.parse(
      await (
        await post(baseUrl, '/api/solutions/explore', 'user-a', {
          problemUrl,
          language: 'C++17',
          attemptConfirmed: true,
        })
      ).json(),
    )
    expect(first.cached).toBe(false)
    expect(first.data.unlockedBy).toBe('self_reported_attempt')
    const second = SolutionExplorationResponseSchema.parse(
      await (
        await post(baseUrl, '/api/solutions/explore', 'user-a', {
          problemUrl,
          language: 'C++17',
          attemptConfirmed: true,
        })
      ).json(),
    )
    expect(second.cached).toBe(true)
    expect(mentor.client.solutions).toHaveBeenCalledTimes(1)
    const officialSources = vi.mocked(mentor.client.solutions).mock
      .calls[0]?.[0].officialSources
    expect(officialSources?.[0]?.url).toBe(
      'https://codeforces.com/contest/2266',
    )
  })
})

describe('Upsolve and coach redirects', () => {
  it('returns an empty but honest upsolve state without contests', async () => {
    const baseUrl = startApp({ mentor: fakeMentor().client })
    const response = await fetch(`${baseUrl}/api/upsolve`, {
      headers: headers('user-a'),
    })
    const body = UpsolveResponseSchema.parse(await response.json())
    expect(body.data.queue).toEqual([])
    expect(body.data.summary.completionRate).toBeNull()
  })

  it('points feature requests in the coach chat to their section without a model call', async () => {
    const coach: AiCoachClient = { respond: vi.fn() }
    const baseUrl = startApp({ mentor: fakeMentor().client, coach })
    const created = await post(
      baseUrl,
      '/api/coach/conversations',
      'user-a',
      {},
    )
    const { data: conversation } = (await created.json()) as {
      data: { id: string }
    }
    const response = await post(
      baseUrl,
      `/api/coach/conversations/${conversation.id}/messages`,
      'user-a',
      { content: `help me with ${problemUrl}` },
    )
    expect(response.status).toBe(200)
    const body = CoachResponseSchema.parse(await response.json())
    expect(body.message.richContent?.blocks[0]).toMatchObject({
      type: 'feature_redirect',
      feature: 'doubt_helper',
      problemUrl,
    })
    expect(coach.respond).not.toHaveBeenCalled()
  })
})
