import { ApiErrorResponseSchema } from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { HttpError, mapErrors, rethrowMentorError } from './errors'

// Mentor tools live outside the Coach chat: Doubt Helper sessions, the
// Solution Explorer, the Test Case Visualizer's AI Debugger, the Upsolve
// Tracker, Contest Analysis and the Progress Report. Every route is
// owner-scoped by the verified subject.

export const invalidMentorInput = (message: string, issues?: unknown) =>
  new HttpError(
    400,
    ApiErrorResponseSchema.parse({
      error: {
        code: 'INVALID_MENTOR_INPUT',
        message,
        ...(issues === undefined ? {} : { details: issues }),
      },
    }),
  )

// Runs a mentor service call, answering MentorErrors with their status.
export const mentor = <T>(work: () => Promise<T>) =>
  mapErrors(work, rethrowMentorError)

// `?refresh=true` pulls the learner's newest platform data first.
export const wantsRefresh = (query: URLSearchParams) =>
  query.get('refresh') === 'true'

export const refreshBody = z
  .object({ refresh: z.boolean().optional() })
  .strict()
  .default({})

export const contestIdSchema = z.string().trim().min(1).max(128)

// Doubt Helper actions that ask the model; reveals, cancels and session
// changes do not.
const modelTurnActions = new Set([
  'ask',
  'submit_attempt',
  'next_hint',
  'confirm_solution',
])

export const isModelTurn = (body: unknown) =>
  typeof body === 'object' &&
  body !== null &&
  'action' in body &&
  typeof body.action === 'string' &&
  modelTurnActions.has(body.action)
