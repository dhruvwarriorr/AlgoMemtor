import { ProblemTimerResponseSchema } from '@algomemtor/shared-contracts'
import { z } from 'zod'

import type { ServerContext } from '../context'
import {
  ActiveTimerError,
  TimerNotFoundError,
} from '../repositories/progress-repository'
import { featureNotEnabled, httpError } from './errors'
import { json } from './route'

// Pause, resume, complete or discard one of the learner's timer sessions.
export async function timerAction(
  app: ServerContext,
  subject: string,
  sessionId: string | undefined,
  action: 'pause' | 'resume' | 'complete' | 'discard',
) {
  if (!app.progressEnabled) throw featureNotEnabled()
  if (sessionId === undefined || !z.uuid().safeParse(sessionId).success) {
    throw httpError(
      400,
      'INVALID_TIMER_SESSION',
      'The timer session ID is invalid.',
    )
  }
  try {
    const session = await app.progressService.timerAction(
      subject,
      sessionId,
      action,
    )
    return json(ProblemTimerResponseSchema.parse({ data: session }))
  } catch (error) {
    if (error instanceof ActiveTimerError) {
      throw httpError(
        409,
        'TIMER_ALREADY_RUNNING',
        'Another timer is already running. Pause it before resuming this timer.',
        { details: { activeTimer: error.activeTimer } },
      )
    }
    if (error instanceof TimerNotFoundError) {
      throw httpError(
        404,
        'TIMER_NOT_FOUND',
        'The timer session could not be found.',
      )
    }
    throw error
  }
}
