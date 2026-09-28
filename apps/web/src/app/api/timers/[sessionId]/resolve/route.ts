import { ResolveTimerRequestSchema } from '@algomemtor/shared-contracts'

import { httpError } from '@/server/http/errors'
import { route } from '@/server/http/route'
import { timerAction } from '@/server/http/timer-action'

export const POST = route<{ sessionId: string }>(
  { auth: 'user' },
  ({ app, subject, params, body }) => {
    const input = ResolveTimerRequestSchema.safeParse(body)
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_TIMER_RESOLUTION',
        'The timer resolution is invalid.',
        { details: input.error.issues },
      )
    }
    return timerAction(
      app,
      subject,
      params.sessionId,
      input.data.resolution === 'complete' ? 'complete' : 'discard',
    )
  },
)
