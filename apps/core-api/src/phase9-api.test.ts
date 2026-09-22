import type { AddressInfo } from 'node:net'

import {
  ApiErrorResponseSchema,
  BookmarkResponseSchema,
  BookmarksResponseSchema,
  DeleteAllDataResponseSchema,
  DeleteAllDataStatusResponseSchema,
  ProblemReflectionResponseSchema,
  ProblemTimerResponseSchema,
  ProgressAnalyticsResponseSchema,
  ProgressHistoryResponseSchema,
  ProgressResponseSchema,
  ProviderActivityResponseSchema,
  RecommendationFeedbackResponseSchema,
  type ExternalProblemSummary,
} from '@algomemtor/shared-contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createApp } from './app.js'
import type { SupabaseJwtVerifier } from './auth/supabase-jwt.js'
import type { ProblemProvider } from './integrations/providers/problem-provider.js'
import { InMemoryBookmarkRepository } from './repositories/bookmark-repository.js'
import { InMemoryProblemActionRepository } from './repositories/problem-action-repository.js'
import { InMemoryProviderDataRepository } from './repositories/provider-data-repository.js'
import { InMemoryProgressRepository } from './repositories/progress-repository.js'
import { InMemoryRecommendationRepository } from './repositories/recommendation-repository.js'

const userId = '00000000-0000-4000-8000-000000000001'
const secondUserId = '00000000-0000-4000-8000-000000000002'

const authorization = { authorization: 'Bearer phase9-user' }

const verifier: SupabaseJwtVerifier = async (token) => {
  if (token !== 'phase9-user') {
    throw new Error('Invalid test access token.')
  }

  return {
    subject: userId,
    claims: { role: 'authenticated' },
  }
}

const freshness = {
  provider: 'codeforces' as const,
  availability: 'available' as const,
  stale: false,
  fetchedAt: '2026-09-13T00:00:00.000Z',
}

const problem = (
  externalId: string,
  title: string,
  normalizedDifficulty: 'easy' | 'medium' | 'hard',
  providerDifficulty: number,
): ExternalProblemSummary => ({
  provider: 'codeforces',
  externalId,
  title,
  canonicalUrl: `https://codeforces.com/problemset/problem/${externalId.slice(0, -1)}/${externalId.slice(-1)}`,
  providerDifficulty,
  normalizedDifficulty,
  providerTags: ['implementation'],
  topics: ['implementation'],
  solvedCount: 1_000,
  fetchedAt: freshness.fetchedAt,
})

const problems = [
  problem('1900A', 'First Phase 9 Problem', 'easy', 800),
  problem('1900B', 'Second Phase 9 Problem', 'medium', 1200),
]

type TestClock = {
  now: () => Date
  advance: (seconds: number) => void
}

const createClock = (): TestClock => {
  let current = new Date('2026-09-13T10:00:00.000Z').getTime()

  return {
    now: () => new Date(current),
    advance: (seconds) => {
      current += seconds * 1_000
    },
  }
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

const actionResponseSchema = z
  .object({
    data: z
      .object({
        recorded: z.literal(true),
        actionId: z.uuid(),
      })
      .strict(),
  })
  .strict()

const servers: ReturnType<ReturnType<typeof createApp>['listen']>[] = []

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

const startApp = (clock = createClock()) => {
  const actionRepository = new InMemoryProblemActionRepository(clock.now)
  const progressRepository = new InMemoryProgressRepository(clock.now)
  const bookmarkRepository = new InMemoryBookmarkRepository(clock.now)
  const recommendationRepository = new InMemoryRecommendationRepository(
    clock.now,
  )
  const providerDataRepository = new InMemoryProviderDataRepository()
  const provider: ProblemProvider = {
    key: 'codeforces',
    search: vi.fn(async () => ({
      problems,
      freshness,
      warnings: [],
    })),
    getHealth: () => freshness,
  }
  const server = createApp({
    jwtVerifier: verifier,
    logger,
    problemProvider: provider,
    problemActionRepository: actionRepository,
    progressRepository,
    bookmarkRepository,
    recommendationRepository,
    providerDataRepository,
  }).listen(0)
  servers.push(server)
  const address = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    actionRepository,
    progressRepository,
    bookmarkRepository,
    recommendationRepository,
    providerDataRepository,
    clock,
  }
}

const jsonRequest = (
  baseUrl: string,
  path: string,
  options: {
    method?: string
    body?: unknown
  } = {},
) =>
  fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...authorization,
      ...(options.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  })

describe('Phase 9 core progress API', () => {
  it('serves dated provider activity but hides a legacy open event', async () => {
    const app = startApp()
    const timestamp = new Date().toISOString()
    const provenance = {
      provider: 'codeforces' as const,
      providerId: '1900A',
      canonicalUrl: problems[0]!.canonicalUrl,
      sourceUrl: 'https://codeforces.com/api/user.status',
      extractionStrategy: 'official_json' as const,
      schemaVersion: 'v1',
      completeness: 'partial' as const,
      fetchedAt: timestamp,
      stale: false,
    }
    await app.providerDataRepository.saveSubmissions(userId, userId, [
      {
        provider: 'codeforces',
        externalId: '1900A',
        eventId: 'accepted-1900A',
        canonicalUrl: problems[0]!.canonicalUrl,
        verdict: 'OK',
        occurredAt: timestamp,
        isAccepted: true,
        completeness: 'partial',
        provenance,
      },
    ])
    await app.providerDataRepository.saveSolvedProblems(userId, userId, [
      {
        provider: 'codeforces',
        externalId: '1900A',
        canonicalUrl: problems[0]!.canonicalUrl,
        occurredAt: timestamp,
        firstObservedAt: timestamp,
        lastObservedAt: timestamp,
        completeness: 'partial',
        provenance,
      },
    ])
    await app.actionRepository.appendByAuthUserId(userId, {
      provider: 'codeforces',
      externalId: '1900A',
      actionType: 'opened',
    })

    const analyticsResponse = await jsonRequest(
      app.baseUrl,
      '/api/progress/analytics?days=30',
    )
    const analytics = ProgressAnalyticsResponseSchema.parse(
      await analyticsResponse.json(),
    )
    expect(analytics.data.window).toEqual({
      days: 30,
      attempted: 1,
      solved: 1,
    })
    const activityResponse = await jsonRequest(app.baseUrl, '/api/activity')
    const activity = ProviderActivityResponseSchema.parse(
      await activityResponse.json(),
    )
    expect(activity.data.filter((event) => event.source === 'manual')).toEqual(
      [],
    )
    const historyResponse = await jsonRequest(
      app.baseUrl,
      '/api/progress/history',
    )
    const history = ProgressHistoryResponseSchema.parse(
      await historyResponse.json(),
    )
    expect(history.data).toEqual([])
    const oldFilterResponse = await jsonRequest(
      app.baseUrl,
      '/api/progress/history?eventType=opened',
    )
    expect(oldFilterResponse.status).toBe(400)
  })

  it('rejects a reflection status action owned by another learner', async () => {
    const app = startApp()
    const foreignAction = await app.actionRepository.appendByAuthUserId(
      secondUserId,
      {
        provider: 'codeforces',
        externalId: '1900A',
        actionType: 'status_changed',
        learnerStatus: 'solved',
        evidenceSource: 'manual',
      },
    )

    const response = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/reflections',
      {
        method: 'POST',
        body: {
          perceivedDifficulty: 'hard',
          note: 'This action belongs to another learner.',
          statusActionId: foreignAction.id,
        },
      },
    )
    const error = ApiErrorResponseSchema.parse(await response.json())

    expect(response.status).toBe(400)
    expect(error.error).toMatchObject({
      code: 'INVALID_PROBLEM_REFLECTION',
      message:
        'The reflection status action is not owned by this learner or problem.',
    })
    await expect(
      app.progressRepository.listReflections(userId),
    ).resolves.toEqual([])
  })

  it('keeps status transitions append-only while exposing the latest status', async () => {
    const app = startApp()
    const statuses = ['attempted', 'solved', 'unsolved'] as const

    for (const status of statuses) {
      const response = await jsonRequest(
        app.baseUrl,
        '/api/problems/codeforces/1900A/status',
        {
          method: 'PUT',
          body: { status, sourceContext: 'progress' },
        },
      )
      const progress = ProgressResponseSchema.parse(await response.json())

      expect(response.status).toBe(200)
      expect(progress.data.status).toBe(status)
      expect(progress.data.evidenceSource).toBe('manual')
      app.clock.advance(60)
    }

    const actions = await app.actionRepository.listByAuthUserId(userId)
    expect(actions).toHaveLength(3)
    expect(
      actions.map((action) => ({
        actionType: action.actionType,
        learnerStatus: action.learnerStatus,
        evidenceSource: action.evidenceSource,
      })),
    ).toEqual([
      {
        actionType: 'status_changed',
        learnerStatus: 'attempted',
        evidenceSource: 'manual',
      },
      {
        actionType: 'status_changed',
        learnerStatus: 'solved',
        evidenceSource: 'manual',
      },
      {
        actionType: 'status_changed',
        learnerStatus: 'unsolved',
        evidenceSource: 'manual',
      },
    ])

    const historyResponse = await jsonRequest(
      app.baseUrl,
      '/api/progress/history?eventType=status_changed',
    )
    const history = ProgressHistoryResponseSchema.parse(
      await historyResponse.json(),
    )

    expect(historyResponse.status).toBe(200)
    expect(history.data.map((event) => event.status)).toEqual([
      'unsolved',
      'solved',
      'attempted',
    ])
  })

  it('lets a manual correction control the current status while retaining provider evidence', async () => {
    const app = startApp()
    await app.actionRepository.appendByAuthUserId(userId, {
      provider: 'codeforces',
      externalId: '1900A',
      actionType: 'status_changed',
      learnerStatus: 'solved',
      evidenceSource: 'provider_verified',
      occurredAt: new Date('2026-09-14T12:00:00.000Z'),
    })
    await app.actionRepository.appendByAuthUserId(userId, {
      provider: 'codeforces',
      externalId: '1900A',
      actionType: 'status_changed',
      learnerStatus: 'attempted',
      evidenceSource: 'manual',
      occurredAt: new Date('2026-09-13T12:00:00.000Z'),
    })

    const progressResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/progress',
    )
    expect(progressResponse.status).toBe(200)
    expect(
      ProgressResponseSchema.parse(await progressResponse.json()).data,
    ).toMatchObject({
      status: 'attempted',
      evidenceSource: 'manual',
    })

    const historyResponse = await jsonRequest(
      app.baseUrl,
      '/api/progress/history?eventType=status_changed',
    )
    const history = ProgressHistoryResponseSchema.parse(
      await historyResponse.json(),
    )
    expect(history.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evidenceSource: 'provider_verified' }),
        expect.objectContaining({ evidenceSource: 'manual' }),
      ]),
    )
  })

  it('invalidates recommendations after repeated reflection evidence', async () => {
    const app = startApp()
    const first = await jsonRequest(app.baseUrl, '/api/recommendations')
    expect(first.status).toBe(200)
    await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/reflections',
      {
        method: 'POST',
        body: {
          perceivedDifficulty: 'hard',
          note: 'Graph traversal felt difficult.',
        },
      },
    )
    app.clock.advance(1)
    await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/reflections',
      {
        method: 'POST',
        body: {
          perceivedDifficulty: 'hard',
          note: 'Graph traversal still felt difficult.',
        },
      },
    )

    const second = await jsonRequest(app.baseUrl, '/api/recommendations')
    expect(second.status).toBe(200)
    const batches =
      await app.recommendationRepository.listBatchesByAuthUserId(userId)
    expect(batches.length).toBeGreaterThanOrEqual(2)
  })

  it('filters progress history to status events with the requested learner status', async () => {
    const app = startApp()

    await jsonRequest(app.baseUrl, '/api/problems/codeforces/1900A/status', {
      method: 'PUT',
      body: { status: 'attempted' },
    })
    app.clock.advance(60)
    await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/reflections',
      {
        method: 'POST',
        body: { perceivedDifficulty: 'medium', note: 'A non-status event.' },
      },
    )
    app.clock.advance(60)
    await jsonRequest(app.baseUrl, '/api/problems/codeforces/1900B/status', {
      method: 'PUT',
      body: { status: 'solved' },
    })

    const response = await jsonRequest(
      app.baseUrl,
      '/api/progress/history?status=solved',
    )
    const history = ProgressHistoryResponseSchema.parse(await response.json())

    expect(response.status).toBe(200)
    expect(history.data).toHaveLength(1)
    expect(history.data[0]).toMatchObject({
      eventType: 'status_changed',
      problem: { provider: 'codeforces', externalId: '1900B' },
      status: 'solved',
    })
  })

  it('preserves a bookmark and queues deletion evidence for one problem', async () => {
    const app = startApp()
    const reference = { provider: 'codeforces' as const, externalId: '1900A' }

    const bookmarkResponse = await jsonRequest(app.baseUrl, '/api/bookmarks', {
      method: 'POST',
      body: reference,
    })
    const bookmark = BookmarkResponseSchema.parse(await bookmarkResponse.json())
    expect(bookmarkResponse.status).toBe(200)

    await jsonRequest(
      app.baseUrl,
      `/api/problems/${reference.provider}/${reference.externalId}/status`,
      { method: 'PUT', body: { status: 'solved' } },
    )
    await jsonRequest(
      app.baseUrl,
      `/api/problems/${reference.provider}/${reference.externalId}/reflections`,
      {
        method: 'POST',
        body: {
          perceivedDifficulty: 'hard',
          note: 'Keep the bookmark while clearing learning evidence.',
        },
      },
    )

    const statusAction = (
      await app.actionRepository.listByAuthUserId(userId)
    ).find((action) => action.actionType === 'status_changed')
    const reflection = (
      await app.progressRepository.listReflections(userId, reference)
    )[0]
    expect(statusAction).toBeDefined()
    expect(reflection).toBeDefined()

    const deleteResponse = await jsonRequest(
      app.baseUrl,
      `/api/problems/${reference.provider}/${reference.externalId}/progress`,
      { method: 'DELETE' },
    )
    expect(deleteResponse.status).toBe(204)

    const progressResponse = await jsonRequest(
      app.baseUrl,
      `/api/problems/${reference.provider}/${reference.externalId}/progress`,
    )
    const progress = ProgressResponseSchema.parse(await progressResponse.json())
    expect(progress.data).toMatchObject({
      problem: reference,
      status: 'unsolved',
      bookmarked: true,
      focusedSeconds: 0,
    })
    expect(progress.data.latestReflection).toBeUndefined()
    expect(await app.actionRepository.listByAuthUserId(userId)).toEqual([])

    const bookmarksResponse = await jsonRequest(app.baseUrl, '/api/bookmarks')
    const bookmarks = BookmarksResponseSchema.parse(
      await bookmarksResponse.json(),
    )
    expect(bookmarks.data).toHaveLength(1)
    expect(bookmarks.data[0]).toMatchObject({
      id: bookmark.data.id,
      problem: {
        provider: reference.provider,
        externalId: reference.externalId,
      },
    })

    const deletionJob = await app.progressRepository.claimNextJob(
      app.clock.now(),
    )
    expect(deletionJob).toMatchObject({
      authUserId: userId,
      jobType: 'problem_data_deletion',
      evidenceType: 'problem_deleted',
      status: 'processing',
      attempts: 1,
      evidenceIds: expect.arrayContaining([statusAction?.id, reflection?.id]),
    })
  })

  it('preserves the latest status in bookmark responses and status filters', async () => {
    const app = startApp()
    const reference = { provider: 'codeforces' as const, externalId: '1900A' }

    await jsonRequest(
      app.baseUrl,
      `/api/problems/${reference.provider}/${reference.externalId}/status`,
      { method: 'PUT', body: { status: 'solved' } },
    )

    const bookmarkResponse = await jsonRequest(app.baseUrl, '/api/bookmarks', {
      method: 'POST',
      body: reference,
    })
    const bookmark = BookmarkResponseSchema.parse(await bookmarkResponse.json())
    expect(bookmarkResponse.status).toBe(200)
    expect(bookmark.data.problem).toMatchObject({
      externalId: reference.externalId,
      learnerStatus: 'solved',
      bookmarked: true,
    })

    const filteredResponse = await jsonRequest(
      app.baseUrl,
      '/api/bookmarks?status=solved',
    )
    const filtered = BookmarksResponseSchema.parse(
      await filteredResponse.json(),
    )

    expect(filteredResponse.status).toBe(200)
    expect(filtered.data).toHaveLength(1)
    expect(filtered.data[0]?.problem).toMatchObject({
      externalId: reference.externalId,
      learnerStatus: 'solved',
      bookmarked: true,
    })
  })

  it('removes recommendation feedback and its memory job during problem deletion', async () => {
    const app = startApp()
    const batch = await app.recommendationRepository.saveBatchByAuthUserId(
      userId,
      {
        requestCriteria: { provider: 'codeforces', pageSize: 1 },
        rankingMode: 'deterministic',
        rankingVersion: 'phase9-test',
        items: [
          {
            provider: 'codeforces',
            externalId: '1900A',
            position: 1,
            reason: 'A focused practice problem.',
          },
        ],
      },
    )
    const item = batch.items[0]
    if (item === undefined)
      throw new Error('The test batch should contain an item.')

    const feedbackResponse = await jsonRequest(
      app.baseUrl,
      `/api/recommendation-items/${item.id}/feedback`,
      {
        method: 'PATCH',
        body: {
          usefulness: 'useful',
          notes: 'The problem fit the practice goal.',
        },
      },
    )
    const feedback = RecommendationFeedbackResponseSchema.parse(
      await feedbackResponse.json(),
    )
    expect(feedbackResponse.status).toBe(200)

    const deleteResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/progress',
      { method: 'DELETE' },
    )
    expect(deleteResponse.status).toBe(204)
    await expect(
      app.recommendationRepository.listFeedbackByAuthUserId(userId),
    ).resolves.toEqual([])

    const deletionJob = await app.progressRepository.claimNextJob(
      app.clock.now(),
    )
    expect(deletionJob?.evidenceIds).toContain(feedback.data.id)
  })

  it('rejects a concurrent timer until an explicit switch pauses the active one', async () => {
    const app = startApp()

    const firstResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/timer',
      { method: 'POST', body: {} },
    )
    const first = ProblemTimerResponseSchema.parse(await firstResponse.json())
    expect(firstResponse.status).toBe(200)

    const conflictResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900B/timer',
      { method: 'POST', body: {} },
    )
    const conflict = ApiErrorResponseSchema.parse(await conflictResponse.json())
    expect(conflictResponse.status).toBe(409)
    expect(conflict.error).toMatchObject({
      code: 'TIMER_ALREADY_RUNNING',
      details: { activeTimer: { id: first.data.id, state: 'running' } },
    })

    app.clock.advance(30)
    const switchedResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900B/timer',
      { method: 'POST', body: { confirmSwitch: true } },
    )
    const switched = ProblemTimerResponseSchema.parse(
      await switchedResponse.json(),
    )
    expect(switchedResponse.status).toBe(200)
    expect(switched.data).toMatchObject({
      problem: { provider: 'codeforces', externalId: '1900B' },
      state: 'running',
      durationSeconds: 0,
    })

    const sessions = await app.progressRepository.listTimerSessions(userId)
    expect(sessions).toHaveLength(2)
    expect(
      sessions.find((session) => session.id === first.data.id),
    ).toMatchObject({
      problem: { provider: 'codeforces', externalId: '1900A' },
      state: 'paused',
      durationSeconds: 30,
    })
    expect(
      sessions.find((session) => session.id === switched.data.id),
    ).toMatchObject({
      problem: { provider: 'codeforces', externalId: '1900B' },
      state: 'running',
    })
  })

  it('caps a timer at four hours and keeps resolved sessions immutable', async () => {
    const app = startApp()

    const startResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/timer',
      { method: 'POST', body: {} },
    )
    const started = ProblemTimerResponseSchema.parse(await startResponse.json())
    app.clock.advance(4 * 60 * 60 + 1)

    const uncappedProgressResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/progress',
    )
    const uncappedProgress = ProgressResponseSchema.parse(
      await uncappedProgressResponse.json(),
    )
    expect(uncappedProgress.data.activeTimer).toMatchObject({
      id: started.data.id,
      state: 'capped',
      durationSeconds: 14_400,
      requiresResolution: true,
    })

    const directBlockedStartResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900B/timer',
      { method: 'POST', body: {} },
    )
    const directBlockedStart = ApiErrorResponseSchema.parse(
      await directBlockedStartResponse.json(),
    )
    expect(directBlockedStartResponse.status).toBe(409)
    expect(directBlockedStart.error).toMatchObject({
      code: 'TIMER_RESOLUTION_REQUIRED',
      details: { activeTimer: { id: started.data.id, state: 'capped' } },
    })

    const pauseResponse = await jsonRequest(
      app.baseUrl,
      `/api/timers/${started.data.id}/pause`,
      { method: 'POST' },
    )
    const capped = ProblemTimerResponseSchema.parse(await pauseResponse.json())
    expect(pauseResponse.status).toBe(200)
    expect(capped.data).toMatchObject({
      state: 'capped',
      durationSeconds: 14_400,
      requiresResolution: true,
    })

    const blockedStartResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900B/timer',
      { method: 'POST', body: {} },
    )
    const blockedStart = ApiErrorResponseSchema.parse(
      await blockedStartResponse.json(),
    )
    expect(blockedStartResponse.status).toBe(409)
    expect(blockedStart.error.code).toBe('TIMER_RESOLUTION_REQUIRED')

    app.clock.advance(60 * 60)
    const progressResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/progress',
    )
    const progress = ProgressResponseSchema.parse(await progressResponse.json())
    expect(progress.data.activeTimer).toEqual(capped.data)

    const completeResponse = await jsonRequest(
      app.baseUrl,
      `/api/timers/${started.data.id}/resolve`,
      { method: 'POST', body: { resolution: 'complete' } },
    )
    const completed = ProblemTimerResponseSchema.parse(
      await completeResponse.json(),
    )
    expect(completed.data).toMatchObject({
      state: 'completed',
      durationSeconds: 14_400,
      requiresResolution: false,
    })

    app.clock.advance(60)
    const repeatResponse = await jsonRequest(
      app.baseUrl,
      `/api/timers/${started.data.id}/resolve`,
      { method: 'POST', body: { resolution: 'discard' } },
    )
    const repeated = ProblemTimerResponseSchema.parse(
      await repeatResponse.json(),
    )
    expect(repeatResponse.status).toBe(200)
    expect(repeated.data).toEqual(completed.data)
  })

  it('retains reflection revisions and points each new revision to its predecessor', async () => {
    const app = startApp()
    const path = '/api/problems/codeforces/1900A/reflections'

    const firstResponse = await jsonRequest(app.baseUrl, path, {
      method: 'POST',
      body: { perceivedDifficulty: 'hard', note: 'The first pass was slow.' },
    })
    const first = ProblemReflectionResponseSchema.parse(
      await firstResponse.json(),
    )
    expect(firstResponse.status).toBe(200)
    expect(first.data).not.toHaveProperty('supersedesReflectionId')

    app.clock.advance(60)
    const secondResponse = await jsonRequest(app.baseUrl, path, {
      method: 'POST',
      body: {
        perceivedDifficulty: 'medium',
        note: 'The second pass was more comfortable.',
      },
    })
    const second = ProblemReflectionResponseSchema.parse(
      await secondResponse.json(),
    )
    expect(secondResponse.status).toBe(200)
    expect(second.data.supersedesReflectionId).toBe(first.data.id)

    const progressResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/progress',
    )
    const progress = ProgressResponseSchema.parse(await progressResponse.json())
    expect(progress.data.latestReflection).toEqual(second.data)

    const historyResponse = await jsonRequest(
      app.baseUrl,
      '/api/progress/history?eventType=reflection_created',
    )
    const history = ProgressHistoryResponseSchema.parse(
      await historyResponse.json(),
    )
    expect(history.data).toHaveLength(2)
    expect(history.data.map((event) => event.reflection?.id)).toEqual([
      second.data.id,
      first.data.id,
    ])
  })

  it('deduplicates recommendation impressions and never records provider opens', async () => {
    const app = startApp()
    const batch = await app.recommendationRepository.saveBatchByAuthUserId(
      userId,
      {
        requestCriteria: {},
        rankingMode: 'deterministic',
        rankingVersion: 'phase9-test',
        items: [
          {
            provider: 'codeforces',
            externalId: '1900A',
            position: 1,
            reason: 'A bounded impression test candidate.',
          },
        ],
      },
    )
    const item = batch.items[0]
    if (item === undefined) {
      throw new Error('The test recommendation item was not created.')
    }

    const impressionPath = `/api/recommendation-items/${item.id}/impression`
    const firstImpressionResponse = await jsonRequest(
      app.baseUrl,
      impressionPath,
      { method: 'POST' },
    )
    const firstImpression = actionResponseSchema.parse(
      await firstImpressionResponse.json(),
    )
    expect(firstImpressionResponse.status).toBe(201)

    const duplicateImpressionResponse = await jsonRequest(
      app.baseUrl,
      impressionPath,
      { method: 'POST' },
    )
    const duplicateImpression = actionResponseSchema.parse(
      await duplicateImpressionResponse.json(),
    )
    expect(duplicateImpressionResponse.status).toBe(201)
    expect(duplicateImpression.data.actionId).toBe(
      firstImpression.data.actionId,
    )

    const openResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/open',
      { method: 'POST' },
    )
    expect(openResponse.status).toBe(404)

    const actions = await app.actionRepository.listByAuthUserId(userId)
    expect(actions.map((action) => action.actionType)).toEqual(['impression'])
    expect(actions[0]?.id).toBe(firstImpression.data.actionId)

    const progressResponse = await jsonRequest(
      app.baseUrl,
      '/api/problems/codeforces/1900A/progress',
    )
    const progress = ProgressResponseSchema.parse(await progressResponse.json())
    expect(progress.data.status).toBe('unsolved')

    const analyticsResponse = await jsonRequest(
      app.baseUrl,
      '/api/progress/analytics',
    )
    const analytics = ProgressAnalyticsResponseSchema.parse(
      await analyticsResponse.json(),
    )
    expect(analytics.data.recommendationConversions).toMatchObject({
      impressions: 1,
      attempted: 0,
      solved: 0,
    })
  })

  it('requires literal DELETE confirmation and returns a typed pending deletion job', async () => {
    const app = startApp()

    const invalidResponse = await jsonRequest(app.baseUrl, '/api/me/data', {
      method: 'DELETE',
      body: { confirmation: 'delete' },
    })
    const invalid = ApiErrorResponseSchema.parse(await invalidResponse.json())
    expect(invalidResponse.status).toBe(400)
    expect(invalid.error.code).toBe('DELETE_CONFIRMATION_REQUIRED')

    const firstResponse = await jsonRequest(app.baseUrl, '/api/me/data', {
      method: 'DELETE',
      body: { confirmation: 'DELETE' },
    })
    const first = DeleteAllDataResponseSchema.parse(await firstResponse.json())
    expect(firstResponse.status).toBe(202)
    expect(first.data.status).toBe('pending')

    const pendingStatusResponse = await jsonRequest(
      app.baseUrl,
      '/api/me/data/status',
    )
    const pendingStatus = DeleteAllDataStatusResponseSchema.parse(
      await pendingStatusResponse.json(),
    )
    expect(pendingStatusResponse.status).toBe(200)
    expect(pendingStatus.data.status).toBe('pending')

    const repeatedResponse = await jsonRequest(app.baseUrl, '/api/me/data', {
      method: 'DELETE',
      body: { confirmation: 'DELETE' },
    })
    const repeated = DeleteAllDataResponseSchema.parse(
      await repeatedResponse.json(),
    )
    expect(repeatedResponse.status).toBe(202)
    expect(repeated.data).toEqual(first.data)
  })

  it('fails closed when deletion fails and requeues the same job on retry', async () => {
    const app = startApp()

    const firstResponse = await jsonRequest(app.baseUrl, '/api/me/data', {
      method: 'DELETE',
      body: { confirmation: 'DELETE' },
    })
    const first = DeleteAllDataResponseSchema.parse(await firstResponse.json())
    const claimed = await app.progressRepository.claimNextJob()
    expect(claimed?.id).toBe(first.data.jobId)
    await app.progressRepository.failJob(first.data.jobId, 'AI_MEMORY_FAILED')

    const statusResponse = await jsonRequest(app.baseUrl, '/api/me/data/status')
    const status = DeleteAllDataStatusResponseSchema.parse(
      await statusResponse.json(),
    )
    expect(status.data.status).toBe('failed')

    const hiddenResponse = await jsonRequest(
      app.baseUrl,
      '/api/learner-profile',
    )
    const hidden = ApiErrorResponseSchema.parse(await hiddenResponse.json())
    expect(hiddenResponse.status).toBe(409)
    expect(hidden.error.code).toBe('LEARNER_DATA_DELETION_PENDING')

    const retryResponse = await jsonRequest(app.baseUrl, '/api/me/data', {
      method: 'DELETE',
      body: { confirmation: 'DELETE' },
    })
    const retry = DeleteAllDataResponseSchema.parse(await retryResponse.json())
    expect(retryResponse.status).toBe(202)
    expect(retry.data).toEqual(first.data)
    const retriedStatus = await jsonRequest(app.baseUrl, '/api/me/data/status')
    expect(
      DeleteAllDataStatusResponseSchema.parse(await retriedStatus.json()).data
        .status,
    ).toBe('pending')
  })
})
