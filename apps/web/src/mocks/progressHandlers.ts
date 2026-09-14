import {
  AiConsentResponseSchema,
  BookmarkQuerySchema,
  BookmarkResponseSchema,
  BookmarksResponseSchema,
  CorrectLearnerMemoryRequestSchema,
  DeleteAllDataRequestSchema,
  DeleteAllDataResponseSchema,
  LearnerMemoryActionSchema,
  ProgressAnalyticsResponseSchema,
  ProgressHistoryResponseSchema,
  ProgressResponseSchema,
  ProblemReflectionResponseSchema,
  ProblemTimerResponseSchema,
  SaveAiConsentRequestSchema,
  SaveReflectionRequestSchema,
  SetProblemStatusRequestSchema,
  StartTimerRequestSchema,
  ResolveTimerRequestSchema,
  type LearnerProblemStatus,
  type ProblemReference,
  type ProblemTimerSession,
} from '@algomemtor/shared-contracts'
import { http, HttpResponse, type RequestHandler } from 'msw'

import { problemFixtures } from './fixtures/problems'

type StoredTimer = ProblemTimerSession

const statuses = new Map<string, LearnerProblemStatus>()
const bookmarks = new Map<string, string>()
const timers = new Map<string, StoredTimer>()
const history: Array<Record<string, unknown>> = []
let aiConsent: {
  enabled: boolean
  policyVersion: string
  decidedAt?: string
} | null = null

function key(problem: ProblemReference) {
  return `${problem.provider}:${problem.externalId}`
}

function id() {
  return crypto.randomUUID()
}

function referenceFromParams(
  params: Record<string, string | readonly string[] | undefined>,
): ProblemReference | null {
  const provider =
    params.provider === 'codeforces' ? ('codeforces' as const) : null
  const externalId =
    typeof params.externalId === 'string' ? params.externalId : null
  return provider && externalId ? { provider, externalId } : null
}

function fixtureFor(problem: ProblemReference) {
  return problemFixtures.find((candidate) => key(candidate) === key(problem))
}

function now() {
  return new Date().toISOString()
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function progressFor(problem: ProblemReference) {
  const activeTimer = [...timers.values()].find(
    (timer) => timer.state === 'running' && key(timer.problem) === key(problem),
  )
  return ProgressResponseSchema.parse({
    data: {
      problem,
      status: statuses.get(key(problem)) ?? 'unsolved',
      bookmarked: bookmarks.has(key(problem)),
      focusedSeconds: [...timers.values()]
        .filter(
          (timer) =>
            key(timer.problem) === key(problem) && timer.state !== 'discarded',
        )
        .reduce((total, timer) => total + timer.durationSeconds, 0),
      ...(activeTimer ? { activeTimer } : {}),
    },
  })
}

function problemReflection(
  problem: ProblemReference,
  input: Record<string, unknown>,
) {
  return {
    id: id(),
    problem,
    perceivedDifficulty: input.perceivedDifficulty,
    ...(typeof input.note === 'string' && input.note
      ? { note: input.note }
      : {}),
    createdAt: now(),
  }
}

function pushHistory(event: Record<string, unknown>) {
  history.unshift({ id: id(), occurredAt: now(), ...event })
}

function timerFor(problem: ProblemReference, durationSeconds = 0): StoredTimer {
  const timestamp = now()
  return {
    id: id(),
    problem,
    state: 'running',
    durationSeconds,
    startedAt: timestamp,
    requiresResolution: false,
    createdAt: timestamp,
  }
}

function updateTimer(timer: StoredTimer, state: StoredTimer['state']) {
  const timestamp = now()
  return {
    ...timer,
    state,
    ...(state === 'paused' || state === 'capped'
      ? { pausedAt: timestamp }
      : {}),
    ...(state === 'completed' ? { completedAt: timestamp } : {}),
    requiresResolution: state === 'capped',
  }
}

function actionReceipt() {
  return { data: { recorded: true, actionId: id() } }
}

const timerAction = (action: 'pause' | 'resume') =>
  http.post('/api/timers/:sessionId/' + action, ({ params }) => {
    const sessionId = String(params.sessionId)
    const timer = timers.get(sessionId)
    if (!timer)
      return HttpResponse.json(
        { error: { code: 'TIMER_NOT_FOUND', message: 'Timer not found' } },
        { status: 404 },
      )
    const next =
      action === 'pause'
        ? updateTimer(timer, 'paused')
        : {
            ...timer,
            state: 'running' as const,
            requiresResolution: false,
            startedAt: now(),
          }
    timers.set(sessionId, next)
    pushHistory({
      eventType: action === 'pause' ? 'timer_paused' : 'timer_started',
      problem: next.problem,
      durationSeconds: next.durationSeconds,
    })
    return HttpResponse.json(ProblemTimerResponseSchema.parse({ data: next }))
  })

export const progressHandlers: RequestHandler[] = [
  http.get('/api/problems/:provider/:externalId/progress', ({ params }) => {
    const problem = referenceFromParams(params)
    return problem
      ? HttpResponse.json(progressFor(problem))
      : HttpResponse.json(
          {
            error: {
              code: 'INVALID_PROBLEM_REFERENCE',
              message: 'Invalid problem reference',
            },
          },
          { status: 400 },
        )
  }),
  http.put(
    '/api/problems/:provider/:externalId/status',
    async ({ params, request }) => {
      const problem = referenceFromParams(params)
      const input = SetProblemStatusRequestSchema.safeParse(
        await request.json().catch(() => null),
      )
      if (!problem || !input.success)
        return HttpResponse.json(
          {
            error: {
              code: 'INVALID_PROBLEM_STATUS',
              message: 'Invalid status',
            },
          },
          { status: 400 },
        )
      statuses.set(key(problem), input.data.status)
      pushHistory({
        eventType: 'status_changed',
        problem,
        status: input.data.status,
      })
      return HttpResponse.json(progressFor(problem))
    },
  ),
  http.post(
    '/api/problems/:provider/:externalId/reflections',
    async ({ params, request }) => {
      const problem = referenceFromParams(params)
      const input = SaveReflectionRequestSchema.safeParse(
        await request.json().catch(() => null),
      )
      if (!problem || !input.success)
        return HttpResponse.json(
          {
            error: {
              code: 'INVALID_PROBLEM_REFLECTION',
              message: 'Invalid reflection',
            },
          },
          { status: 400 },
        )
      const reflection = problemReflection(problem, input.data)
      pushHistory({ eventType: 'reflection_created', problem, reflection })
      return HttpResponse.json(
        ProblemReflectionResponseSchema.parse({ data: reflection }),
      )
    },
  ),
  http.delete('/api/problems/:provider/:externalId/progress', ({ params }) => {
    const problem = referenceFromParams(params)
    if (!problem)
      return HttpResponse.json(
        {
          error: {
            code: 'INVALID_PROBLEM_REFERENCE',
            message: 'Invalid problem reference',
          },
        },
        { status: 400 },
      )
    statuses.delete(key(problem))
    for (const [timerId, timer] of timers)
      if (key(timer.problem) === key(problem)) timers.delete(timerId)
    return new HttpResponse(null, { status: 204 })
  }),
  http.post(
    '/api/problems/:provider/:externalId/timer',
    async ({ params, request }) => {
      const problem = referenceFromParams(params)
      const input = StartTimerRequestSchema.safeParse(
        await request.json().catch(() => ({})),
      )
      if (!problem || !input.success)
        return HttpResponse.json(
          {
            error: {
              code: 'INVALID_TIMER_REQUEST',
              message: 'Invalid timer request',
            },
          },
          { status: 400 },
        )
      const running = [...timers.values()].find(
        (timer) => timer.state === 'running',
      )
      if (running && !input.data.confirmSwitch)
        return HttpResponse.json(
          {
            error: {
              code: 'TIMER_ALREADY_RUNNING',
              message: 'Another timer is already running.',
            },
          },
          { status: 409 },
        )
      if (running) timers.set(running.id, updateTimer(running, 'paused'))
      const timer = timerFor(problem)
      timers.set(timer.id, timer)
      pushHistory({ eventType: 'timer_started', problem, durationSeconds: 0 })
      return HttpResponse.json(
        ProblemTimerResponseSchema.parse({ data: timer }),
      )
    },
  ),
  timerAction('pause'),
  timerAction('resume'),
  http.post('/api/timers/:sessionId/resolve', async ({ params, request }) => {
    const timer = timers.get(String(params.sessionId))
    const input = ResolveTimerRequestSchema.safeParse(
      await request.json().catch(() => null),
    )
    if (!timer || !input.success)
      return HttpResponse.json(
        { error: { code: 'TIMER_NOT_FOUND', message: 'Timer not found' } },
        { status: 404 },
      )
    const state =
      input.data.resolution === 'complete' ? 'completed' : 'discarded'
    const next = updateTimer(timer, state)
    timers.set(timer.id, next)
    pushHistory({
      eventType: state === 'completed' ? 'timer_completed' : 'timer_discarded',
      problem: next.problem,
      durationSeconds: next.durationSeconds,
    })
    return HttpResponse.json(ProblemTimerResponseSchema.parse({ data: next }))
  }),
  http.get('/api/progress/history', ({ request }) => {
    const url = new URL(request.url)
    const eventType = url.searchParams.get('eventType')
    const status = url.searchParams.get('status')
    const externalId = url.searchParams.get('externalId')
    const filtered = history.filter(
      (event) =>
        (!eventType || event.eventType === eventType) &&
        (!status || event.status === status) &&
        (!externalId ||
          (event.problem as ProblemReference)?.externalId === externalId),
    )
    return HttpResponse.json(
      ProgressHistoryResponseSchema.parse({
        data: filtered,
        meta: { hasMore: false },
      }),
    )
  }),
  http.get('/api/progress/analytics', () => {
    const trend = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(Date.now() - (29 - index) * 86_400_000)
        .toISOString()
        .slice(0, 10)
      return { date, attempted: 0, solved: 0 }
    })
    const inventory = [...statuses.values()].reduce(
      (counts, status) => ({ ...counts, [status]: counts[status] + 1 }),
      { unsolved: 0, attempted: 0, solved: 0 },
    )
    return HttpResponse.json(
      ProgressAnalyticsResponseSchema.parse({
        data: {
          generatedAt: now(),
          timezone: 'UTC',
          inventory,
          trend,
          focusedSeconds: 0,
          averageSolvedSeconds: null,
          currentStreak: 0,
          longestStreak: 0,
          completionRate:
            inventory.attempted + inventory.solved === 0
              ? 0
              : inventory.solved / (inventory.attempted + inventory.solved),
          recommendationConversions: {
            impressions: 0,
            opens: 0,
            attempted: 0,
            solved: 0,
            impressionToOpen: 0,
            impressionToAttempt: 0,
            impressionToSolve: 0,
          },
          topicScores: [],
        },
      }),
    )
  }),
  http.get('/api/bookmarks', ({ request }) => {
    const url = new URL(request.url)
    const queryResult = BookmarkQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    )
    if (!queryResult.success)
      return HttpResponse.json(
        {
          error: {
            code: 'INVALID_BOOKMARK_QUERY',
            message: 'Invalid bookmark query',
          },
        },
        { status: 400 },
      )
    const query = queryResult.data
    let saved = [...bookmarks.entries()]
      .map(([bookmarkKey, createdAt]) => {
        const problem = problemFixtures.find(
          (candidate) => key(candidate) === bookmarkKey,
        )
        return problem
          ? {
              id: bookmarkKey,
              problem: {
                ...problem,
                learnerStatus: statuses.get(bookmarkKey) ?? 'unsolved',
                bookmarked: true,
              },
              createdAt,
            }
          : null
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
    if (query.search) {
      const search = query.search.toLowerCase()
      saved = saved.filter(({ problem }) =>
        [problem.title, problem.externalId, ...problem.topics].some((value) =>
          value.toLowerCase().includes(search),
        ),
      )
    }
    if (query.topic) {
      const topic = query.topic
      saved = saved.filter(({ problem }) => problem.topics.includes(topic))
    }
    if (query.status)
      saved = saved.filter(
        ({ problem }) => problem.learnerStatus === query.status,
      )
    if (query.difficulty)
      saved = saved.filter(
        ({ problem }) => problem.normalizedDifficulty === query.difficulty,
      )
    if (query.sort === 'title')
      saved.sort((a, b) => a.problem.title.localeCompare(b.problem.title))
    if (query.sort === 'difficulty')
      saved.sort(
        (a, b) =>
          Number(a.problem.providerDifficulty ?? Infinity) -
          Number(b.problem.providerDifficulty ?? Infinity),
      )
    const total = saved.length
    const totalPages = Math.ceil(total / query.pageSize)
    const data = saved.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    )
    return HttpResponse.json(
      BookmarksResponseSchema.parse({
        data,
        meta: { page: query.page, pageSize: query.pageSize, total, totalPages },
      }),
    )
  }),
  http.post('/api/bookmarks', async ({ request }) => {
    const input = await readJson(request)
    const provider =
      typeof input === 'object' &&
      input !== null &&
      'provider' in input &&
      input.provider === 'codeforces'
        ? ('codeforces' as const)
        : null
    const externalId =
      typeof input === 'object' &&
      input !== null &&
      'externalId' in input &&
      typeof input.externalId === 'string'
        ? input.externalId
        : null
    const problem = provider && externalId ? { provider, externalId } : null
    const fixture = problem ? fixtureFor(problem) : undefined
    if (!problem || !fixture)
      return HttpResponse.json(
        { error: { code: 'INVALID_BOOKMARK', message: 'Invalid bookmark' } },
        { status: 400 },
      )
    const createdAt = now()
    bookmarks.set(key(problem), createdAt)
    pushHistory({ eventType: 'bookmark_added', problem })
    return HttpResponse.json(
      BookmarkResponseSchema.parse({
        data: {
          id: id(),
          problem: {
            ...fixture,
            learnerStatus: statuses.get(key(problem)) ?? 'unsolved',
            bookmarked: true,
          },
          createdAt,
        },
      }),
    )
  }),
  http.delete('/api/bookmarks/:provider/:externalId', ({ params }) => {
    const problem = referenceFromParams(params)
    if (problem) {
      bookmarks.delete(key(problem))
      pushHistory({ eventType: 'bookmark_removed', problem })
    }
    return new HttpResponse(null, { status: 204 })
  }),
  http.post('/api/recommendation-items/:itemId/impression', ({ params }) => {
    const fixture =
      problemFixtures[Number(String(params.itemId).slice(-3)) - 100]
    if (fixture)
      pushHistory({
        eventType: 'impression',
        problem: { provider: fixture.provider, externalId: fixture.externalId },
      })
    return HttpResponse.json(actionReceipt())
  }),
  http.post(
    '/api/problems/:provider/:externalId/open',
    async ({ params, request }) => {
      const problem = referenceFromParams(params)
      if (!problem)
        return HttpResponse.json(
          {
            error: {
              code: 'INVALID_OPEN_EVENT',
              message: 'Invalid open event',
            },
          },
          { status: 400 },
        )
      await request.json().catch(() => null)
      pushHistory({ eventType: 'opened', problem })
      return HttpResponse.json(actionReceipt())
    },
  ),
  http.get('/api/ai-consent', () =>
    HttpResponse.json(AiConsentResponseSchema.parse({ data: aiConsent })),
  ),
  http.put('/api/ai-consent', async ({ request }) => {
    const input = SaveAiConsentRequestSchema.safeParse(
      await request.json().catch(() => null),
    )
    if (!input.success)
      return HttpResponse.json(
        {
          error: { code: 'INVALID_AI_CONSENT', message: 'Invalid AI consent' },
        },
        { status: 400 },
      )
    aiConsent = { ...input.data, decidedAt: now() }
    return HttpResponse.json(AiConsentResponseSchema.parse({ data: aiConsent }))
  }),
  http.delete('/api/me/data', async ({ request }) => {
    const input = DeleteAllDataRequestSchema.safeParse(
      await request.json().catch(() => null),
    )
    if (!input.success)
      return HttpResponse.json(
        {
          error: {
            code: 'DELETE_CONFIRMATION_REQUIRED',
            message: 'Type DELETE to confirm removal of AlgoMemtor data.',
          },
        },
        { status: 400 },
      )
    statuses.clear()
    bookmarks.clear()
    timers.clear()
    history.splice(0, history.length)
    aiConsent = null
    return HttpResponse.json(
      DeleteAllDataResponseSchema.parse({
        data: { status: 'pending', jobId: id() },
      }),
      { status: 202 },
    )
  }),
  http.get('/api/me/data/status', () =>
    HttpResponse.json({ data: { status: 'completed' } }),
  ),
  http.get('/api/learner-memories', () =>
    HttpResponse.json({ data: [], meta: { pendingJobs: 0 } }),
  ),
  http.post(
    '/api/learner-memories/:memoryId/action',
    async ({ params, request }) => {
      const memoryId = String(params.memoryId)
      const body = await request.json().catch(() => null)
      const input =
        typeof body === 'object' && body !== null && 'action' in body
          ? LearnerMemoryActionSchema.safeParse(body.action)
          : { success: false as const }
      if (!memoryId || !input.success) {
        return HttpResponse.json(
          {
            error: {
              code: 'INVALID_LEARNER_MEMORY_ACTION',
              message: 'Invalid learner memory action.',
            },
          },
          { status: 400 },
        )
      }
      return HttpResponse.json({ data: null })
    },
  ),
  http.patch('/api/learner-memories/:memoryId', async ({ params, request }) => {
    const memoryId = String(params.memoryId)
    const input = CorrectLearnerMemoryRequestSchema.safeParse(
      await request.json().catch(() => null),
    )
    if (!memoryId || !input.success) {
      return HttpResponse.json(
        {
          error: {
            code: 'INVALID_LEARNER_MEMORY_CORRECTION',
            message: 'Invalid learner memory correction.',
          },
        },
        { status: 400 },
      )
    }
    return HttpResponse.json({ data: null })
  }),
]
