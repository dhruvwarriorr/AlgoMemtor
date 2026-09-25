import {
  ApiErrorResponseSchema,
  ContestAnalysisOverviewResponseSchema,
  ProblemHelpSessionResponseSchema,
  ProblemHelpSessionsResponseSchema,
  ProgressReportResponseSchema,
  SolutionAccessResponseSchema,
  SolutionExplorationsResponseSchema,
  StartProblemHelpRequestSchema,
  ProblemHelpTurnRequestSchema,
  UPSOLVE_CHART_WINDOW_DAYS,
  UpsolveResponseSchema,
  type ProblemHelpSession,
  type ProblemHelpTurn,
} from '@algomemtor/shared-contracts'
import { http, HttpResponse, type RequestHandler } from 'msw'

// Mock-mode mentor tools: the same /api/* contract as live mode, with empty
// learner data and deterministic Doubt Helper text. AI-written reports are
// reported as unavailable instead of being faked.

const now = () => new Date().toISOString()
const sessions = new Map<
  string,
  { session: ProblemHelpSession; turns: ProblemHelpTurn[] }
>()

const levelNames = ['Nudge', 'Concept', 'Structure', 'Key code']

const mentorTurn = (
  kind: ProblemHelpTurn['kind'],
  hintLevel: number,
  content: string,
): ProblemHelpTurn => ({
  id: crypto.randomUUID(),
  role: 'mentor',
  kind,
  hintLevel,
  content,
  createdAt: now(),
})

const unavailable = () =>
  HttpResponse.json(
    ApiErrorResponseSchema.parse({
      error: {
        code: 'MENTOR_AI_UNAVAILABLE',
        message: 'AI-written reports are not available in mock mode.',
        retryable: false,
      },
    }),
    { status: 503 },
  )

const detail = (id: string) => {
  const entry = sessions.get(id)
  return entry === undefined
    ? HttpResponse.json(
        ApiErrorResponseSchema.parse({
          error: {
            code: 'PROBLEM_HELP_SESSION_NOT_FOUND',
            message: 'This help session was not found.',
          },
        }),
        { status: 404 },
      )
    : HttpResponse.json(
        ProblemHelpSessionResponseSchema.parse({
          data: entry.session,
          turns: entry.turns,
        }),
      )
}

export const mentorHandlers: RequestHandler[] = [
  http.get('/api/problem-help/sessions', () =>
    HttpResponse.json(
      ProblemHelpSessionsResponseSchema.parse({
        data: [...sessions.values()].map((entry) => entry.session),
      }),
    ),
  ),
  http.post('/api/problem-help/sessions', async ({ request }) => {
    const input = StartProblemHelpRequestSchema.parse(await request.json())
    const id = crypto.randomUUID()
    const session: ProblemHelpSession = {
      id,
      problem: {
        platform: 'other',
        title: input.problemTitle ?? 'Mock problem',
        ...(input.problemUrl === undefined
          ? {}
          : { canonicalUrl: input.problemUrl }),
        topics: [],
      },
      language: input.language,
      doubtType: input.doubtType,
      attemptSummary: input.attemptSummary,
      source: input.source ?? 'manual',
      stage: 'hinting',
      hintLevel: 1,
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    }
    sessions.set(id, {
      session,
      turns: [
        {
          id: crypto.randomUUID(),
          role: 'learner',
          kind: 'intake',
          content: `**What I tried:** ${input.attemptSummary}`,
          createdAt: now(),
        },
        mentorTurn(
          'hint',
          1,
          '## Hint 1 · Nudge\n\nMock mode: think about what the constraints allow.\n\n## Your turn\n\nWhat is the largest input size?',
        ),
      ],
    })
    return detail(id)
  }),
  http.get('/api/problem-help/sessions/:sessionId', ({ params }) =>
    detail(String(params.sessionId)),
  ),
  http.post(
    '/api/problem-help/sessions/:sessionId/turns',
    async ({ params, request }) => {
      const id = String(params.sessionId)
      const entry = sessions.get(id)
      if (entry === undefined) return detail(id)
      const input = ProblemHelpTurnRequestSchema.parse(await request.json())
      const session = { ...entry.session }
      const turns = [...entry.turns]
      if (input.action === 'next_hint' && session.hintLevel < 4) {
        session.hintLevel += 1
        turns.push(
          mentorTurn(
            'hint',
            session.hintLevel,
            `## Hint ${session.hintLevel} · ${levelNames[session.hintLevel - 1]}\n\nMock hint.`,
          ),
        )
      } else if (input.action === 'request_solution') {
        session.stage = 'solution_confirmation'
      } else if (input.action === 'cancel_solution') {
        session.stage = 'hinting'
      } else if (input.action === 'confirm_solution') {
        session.stage = 'solution_revealed'
        session.hintLevel = 5
        session.solutionRevealedAt = now()
        turns.push(mentorTurn('solution', 5, '## Complete Code\n\nMock.'))
      } else if (input.action === 'complete' || input.action === 'abandon') {
        session.stage = input.action === 'complete' ? 'completed' : 'abandoned'
        session.completedAt = now()
      } else if (input.action === 'ask' || input.action === 'submit_attempt') {
        turns.push({
          id: crypto.randomUUID(),
          role: 'learner',
          kind: input.action === 'ask' ? 'question' : 'attempt',
          content: input.content,
          createdAt: now(),
        })
        turns.push(
          mentorTurn(
            input.action === 'ask' ? 'answer' : 'feedback',
            Math.max(1, session.hintLevel),
            'Mock feedback.',
          ),
        )
      }
      session.version += 1
      session.updatedAt = now()
      sessions.set(id, { session, turns })
      return detail(id)
    },
  ),
  http.get('/api/solutions', () =>
    HttpResponse.json(SolutionExplorationsResponseSchema.parse({ data: [] })),
  ),
  http.get('/api/solutions/access', ({ request }) => {
    const url = new URL(request.url).searchParams.get('problemUrl') ?? ''
    return HttpResponse.json(
      SolutionAccessResponseSchema.parse({
        data: {
          problem: {
            platform: 'other',
            title: 'Mock problem',
            ...(url.startsWith('https://') ? { canonicalUrl: url } : {}),
            topics: [],
          },
          learnerStatus: 'unsolved',
          cached: false,
        },
      }),
    )
  }),
  http.post('/api/solutions/explore', unavailable),
  http.post('/api/solutions/chat', unavailable),
  http.get('/api/upsolve', () =>
    HttpResponse.json(
      UpsolveResponseSchema.parse({
        data: {
          queue: [],
          contests: [],
          summary: {
            windowDays: UPSOLVE_CHART_WINDOW_DAYS,
            flagged: 0,
            upsolved: 0,
            skipped: 0,
            pending: 0,
            completionRate: null,
            trend: [],
          },
          linkedProviders: [],
          generatedAt: now(),
        },
      }),
    ),
  ),
  http.put(
    '/api/upsolve/items/:provider/:externalId',
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.get('/api/contest-analysis', () =>
    HttpResponse.json(
      ContestAnalysisOverviewResponseSchema.parse({
        data: {
          contests: [],
          patterns: {
            contestsAnalyzed: 0,
            averageSolved: null,
            averageFirstAcceptedMinute: null,
            averageWrongPerContest: null,
            ratingDeltaTotal: 0,
            ratingDrops: 0,
            slowStarts: 0,
            earlyStops: 0,
            rapidResubmitContests: 0,
            recurringUnsolvedTopics: [],
            stuckPositions: [],
          },
        },
      }),
    ),
  ),
  http.post('/api/contest-analysis/patterns/report', unavailable),
  http.post(
    '/api/contest-analysis/:provider/:contestId/narrative',
    unavailable,
  ),
  http.get('/api/progress-report', () =>
    HttpResponse.json(
      ProgressReportResponseSchema.parse({
        data: {
          generatedAt: now(),
          topicProgress: [],
          ratingTrend: [],
          accuracy: [],
          consistency: {
            activeDaysLast30: 0,
            currentStreak: 0,
            longestStreak: 0,
            weekly: [],
          },
          solvingSpeed: [],
          hintDependency: {
            sessions: sessions.size,
            averageHintLevel: null,
            solutionRevealRate: null,
            trend: 'insufficient_data',
            weekly: [],
          },
          insights: [],
        },
      }),
    ),
  ),
  http.post('/api/progress-report/narrative', unavailable),
]
