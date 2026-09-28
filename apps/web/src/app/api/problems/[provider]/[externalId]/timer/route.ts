import {
  ProblemTimerResponseSchema,
  StartTimerRequestSchema,
} from '@algomemtor/shared-contracts'

import { featureNotEnabled, httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'
import { problemReference } from '@/server/http/schemas'
import {
  ActiveTimerError,
  TimerResolutionRequiredError,
} from '@/server/repositories/progress-repository'

export const POST = route<{ provider: string; externalId: string }>(
  { auth: 'user' },
  async ({ app, subject, params, body }) => {
    if (!app.progressEnabled) throw featureNotEnabled()
    const reference = problemReference(params)
    const input = StartTimerRequestSchema.safeParse(body ?? {})
    if (!input.success) {
      throw httpError(
        400,
        'INVALID_TIMER_REQUEST',
        'The timer request is invalid.',
        { details: input.error.issues },
      )
    }
    try {
      const result = await app.progressService.startTimer(
        subject,
        reference,
        input.data.confirmSwitch,
      )
      return json(ProblemTimerResponseSchema.parse({ data: result.session }))
    } catch (error) {
      if (error instanceof TimerResolutionRequiredError) {
        throw httpError(
          409,
          'TIMER_RESOLUTION_REQUIRED',
          'Save or discard the capped timer before starting another one.',
          { details: { activeTimer: error.activeTimer } },
        )
      }
      if (error instanceof ActiveTimerError) {
        throw httpError(
          409,
          'TIMER_ALREADY_RUNNING',
          'Another timer is already running. Confirm to pause it and start this timer.',
          { details: { activeTimer: error.activeTimer } },
        )
      }
      throw error
    }
  },
)
