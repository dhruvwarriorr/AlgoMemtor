import {
  ApiErrorResponseSchema,
  ContestAnalysisOverviewResponseSchema,
  ContestAnalysisResponseSchema,
  ContestPatternsReportResponseSchema,
  ExploreSolutionsRequestSchema,
  ProblemHelpSessionResponseSchema,
  ProblemHelpSessionsResponseSchema,
  ProblemHelpTurnRequestSchema,
  ProgressNarrativeResponseSchema,
  ProgressReportResponseSchema,
  ProviderKeySchema,
  SolutionAccessResponseSchema,
  SolutionChatRequestSchema,
  SolutionChatResponseSchema,
  SolutionExplorationResponseSchema,
  SolutionExplorationsResponseSchema,
  StartProblemHelpRequestSchema,
  UpdateUpsolveItemRequestSchema,
  UpsolveResponseSchema,
  VisualizerDebugRequestSchema,
  VisualizerDebugResponseSchema,
} from '@algomemtor/shared-contracts'
import type {
  Express,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express'
import { z } from 'zod'

import { MentorError, type MentorService } from './services/mentor-service.js'

// Mentor tools live outside the Coach chat: Doubt Helper sessions, the
// Solution Explorer, the Test Case Visualizer's AI Debugger, the Upsolve
// Tracker, Contest Analysis and the Progress Report. Every route is
// owner-scoped by the verified subject.

type MentorRouteDependencies = {
  requireAuthenticated: RequestHandler
  subject: (response: Response) => string
  service: MentorService
}

const apiError = (code: string, message: string, retryable?: boolean) =>
  ApiErrorResponseSchema.parse({
    error: {
      code,
      message,
      ...(retryable === undefined ? {} : { retryable }),
    },
  })

// `?refresh=true` pulls the learner's newest platform data first.
const wantsRefresh = (request: Request) => request.query.refresh === 'true'

const invalidInput = (response: Response, message: string, issues?: unknown) =>
  response.status(400).json(
    ApiErrorResponseSchema.parse({
      error: {
        code: 'INVALID_MENTOR_INPUT',
        message,
        ...(issues === undefined ? {} : { details: issues }),
      },
    }),
  )

const handle =
  (
    route: (request: Request, response: Response) => Promise<void>,
  ): RequestHandler =>
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      await route(request, response)
    } catch (error) {
      if (error instanceof MentorError) {
        response
          .status(error.status)
          .json(
            apiError(
              error.code,
              error.message,
              error.status === 429 || error.status === 503 ? true : undefined,
            ),
          )
        return
      }
      next(error)
    }
  }

const param = (request: Request, name: string) => {
  const value = request.params[name]
  return typeof value === 'string' ? value : ''
}

const httpsUrlQuery = z.string().trim().url().max(2_048)
const languageQuery = z.string().trim().min(1).max(64)
const contestIdSchema = z.string().trim().min(1).max(128)
const refreshBody = z
  .object({ refresh: z.boolean().optional() })
  .strict()
  .default({})

export function registerMentorRoutes(
  app: Express,
  { requireAuthenticated, subject, service }: MentorRouteDependencies,
) {
  // --- Doubt Helper -------------------------------------------------------

  app.get(
    '/api/problem-help/sessions',
    requireAuthenticated,
    handle(async (_request, response) => {
      response.json(
        ProblemHelpSessionsResponseSchema.parse({
          data: await service.listHelpSessions(subject(response)),
        }),
      )
    }),
  )

  app.post(
    '/api/problem-help/sessions',
    requireAuthenticated,
    handle(async (request, response) => {
      const input = StartProblemHelpRequestSchema.safeParse(request.body)
      if (!input.success) {
        invalidInput(
          response,
          input.error.issues[0]?.message ?? 'The help request is invalid.',
          input.error.issues,
        )
        return
      }
      response
        .status(201)
        .json(
          ProblemHelpSessionResponseSchema.parse(
            await service.startHelpSession(subject(response), input.data),
          ),
        )
    }),
  )

  app.get(
    '/api/problem-help/sessions/:sessionId',
    requireAuthenticated,
    handle(async (request, response) => {
      response.json(
        ProblemHelpSessionResponseSchema.parse(
          await service.getHelpSession(
            subject(response),
            param(request, 'sessionId'),
          ),
        ),
      )
    }),
  )

  app.post(
    '/api/problem-help/sessions/:sessionId/turns',
    requireAuthenticated,
    handle(async (request, response) => {
      const input = ProblemHelpTurnRequestSchema.safeParse(request.body)
      if (!input.success) {
        invalidInput(
          response,
          input.error.issues[0]?.message ?? 'The help action is invalid.',
          input.error.issues,
        )
        return
      }
      response.json(
        ProblemHelpSessionResponseSchema.parse(
          await service.helpTurn(
            subject(response),
            param(request, 'sessionId'),
            input.data,
          ),
        ),
      )
    }),
  )

  // --- Solution Explorer --------------------------------------------------

  app.get(
    '/api/solutions',
    requireAuthenticated,
    handle(async (_request, response) => {
      response.json(
        SolutionExplorationsResponseSchema.parse({
          data: await service.listExplorations(subject(response)),
        }),
      )
    }),
  )

  app.get(
    '/api/solutions/access',
    requireAuthenticated,
    handle(async (request, response) => {
      const url = httpsUrlQuery.safeParse(request.query.problemUrl)
      const language = languageQuery.safeParse(request.query.language ?? 'C++')
      if (!url.success || !language.success) {
        invalidInput(response, 'Provide a problem link.')
        return
      }
      response.json(
        SolutionAccessResponseSchema.parse({
          data: await service.solutionAccess(
            subject(response),
            url.data,
            language.data,
          ),
        }),
      )
    }),
  )

  app.post(
    '/api/solutions/explore',
    requireAuthenticated,
    handle(async (request, response) => {
      const input = ExploreSolutionsRequestSchema.safeParse(request.body)
      if (!input.success) {
        invalidInput(
          response,
          input.error.issues[0]?.message ?? 'The request is invalid.',
          input.error.issues,
        )
        return
      }
      response.json(
        SolutionExplorationResponseSchema.parse(
          await service.exploreSolutions(subject(response), input.data),
        ),
      )
    }),
  )

  app.post(
    '/api/solutions/chat',
    requireAuthenticated,
    handle(async (request, response) => {
      const input = SolutionChatRequestSchema.safeParse(request.body)
      if (!input.success) {
        invalidInput(
          response,
          input.error.issues[0]?.message ?? 'The request is invalid.',
          input.error.issues,
        )
        return
      }
      response.json(
        SolutionChatResponseSchema.parse({
          data: await service.solutionChat(subject(response), input.data),
        }),
      )
    }),
  )

  // --- Test Case Visualizer AI Debugger ---------------------------------

  app.post(
    '/api/visualizer/debug',
    requireAuthenticated,
    handle(async (request, response) => {
      const input = VisualizerDebugRequestSchema.safeParse(request.body)
      if (!input.success) {
        // Issues name the invalid fields, never the submitted code or input.
        invalidInput(
          response,
          input.error.issues[0]?.message ?? 'The debug request is invalid.',
          input.error.issues.map(({ code, path, message }) => ({
            code,
            path,
            message,
          })),
        )
        return
      }
      response.json(
        VisualizerDebugResponseSchema.parse({
          data: await service.visualizerDebug(subject(response), input.data),
        }),
      )
    }),
  )

  // --- Upsolve Tracker ---------------------------------------------------

  app.get(
    '/api/upsolve',
    requireAuthenticated,
    handle(async (request, response) => {
      response.json(
        UpsolveResponseSchema.parse({
          data: await service.upsolve(subject(response), {
            refresh: wantsRefresh(request),
          }),
        }),
      )
    }),
  )

  app.put(
    '/api/upsolve/items/:provider/:externalId',
    requireAuthenticated,
    handle(async (request, response) => {
      const provider = ProviderKeySchema.safeParse(param(request, 'provider'))
      const externalId = z
        .string()
        .trim()
        .min(1)
        .max(128)
        .safeParse(param(request, 'externalId'))
      const input = UpdateUpsolveItemRequestSchema.safeParse(request.body)
      if (!provider.success || !externalId.success || !input.success) {
        invalidInput(response, 'The upsolve update is invalid.')
        return
      }
      await service.setUpsolveState(
        subject(response),
        provider.data,
        externalId.data,
        input.data.state,
      )
      response.status(204).end()
    }),
  )

  app.get(
    '/api/contest-analysis',
    requireAuthenticated,
    handle(async (request, response) => {
      response.json(
        ContestAnalysisOverviewResponseSchema.parse({
          data: await service.contestOverview(subject(response), {
            refresh: wantsRefresh(request),
          }),
        }),
      )
    }),
  )

  app.post(
    '/api/contest-analysis/patterns/report',
    requireAuthenticated,
    handle(async (request, response) => {
      const input = refreshBody.safeParse(request.body ?? {})
      if (!input.success) {
        invalidInput(response, 'The request is invalid.')
        return
      }
      response.json(
        ContestPatternsReportResponseSchema.parse({
          data: await service.contestPatternsReport(
            subject(response),
            input.data.refresh === true,
          ),
        }),
      )
    }),
  )

  app.get(
    '/api/contest-analysis/:provider/:contestId',
    requireAuthenticated,
    handle(async (request, response) => {
      const provider = ProviderKeySchema.safeParse(param(request, 'provider'))
      const contestId = contestIdSchema.safeParse(param(request, 'contestId'))
      if (!provider.success || !contestId.success) {
        invalidInput(response, 'The contest reference is invalid.')
        return
      }
      response.json(
        ContestAnalysisResponseSchema.parse({
          data: await service.contestDetail(
            subject(response),
            provider.data,
            contestId.data,
          ),
        }),
      )
    }),
  )

  app.post(
    '/api/contest-analysis/:provider/:contestId/narrative',
    requireAuthenticated,
    handle(async (request, response) => {
      const provider = ProviderKeySchema.safeParse(param(request, 'provider'))
      const contestId = contestIdSchema.safeParse(param(request, 'contestId'))
      const input = refreshBody.safeParse(request.body ?? {})
      if (!provider.success || !contestId.success || !input.success) {
        invalidInput(response, 'The contest reference is invalid.')
        return
      }
      response.json(
        ContestAnalysisResponseSchema.parse({
          data: await service.contestNarrative(
            subject(response),
            provider.data,
            contestId.data,
            input.data.refresh === true,
          ),
        }),
      )
    }),
  )

  // --- Progress Report ----------------------------------------------------

  app.get(
    '/api/progress-report',
    requireAuthenticated,
    handle(async (_request, response) => {
      response.json(
        ProgressReportResponseSchema.parse(
          await service.progressReport(subject(response)),
        ),
      )
    }),
  )

  app.post(
    '/api/progress-report/narrative',
    requireAuthenticated,
    handle(async (request, response) => {
      const input = refreshBody.safeParse(request.body ?? {})
      if (!input.success) {
        invalidInput(response, 'The request is invalid.')
        return
      }
      response.json(
        ProgressNarrativeResponseSchema.parse({
          data: await service.progressNarrative(
            subject(response),
            input.data.refresh === true,
          ),
        }),
      )
    }),
  )
}
