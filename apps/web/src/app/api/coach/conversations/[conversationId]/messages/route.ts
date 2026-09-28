import { SendCoachMessageRequestSchema } from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { httpError, mapErrors, rethrowCoachError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const POST = route<{ conversationId: string }>(
  { auth: 'user', aiUsage: 'coach', bodyLimit: 128 * 1024 },
  async ({ app, subject, params, body }) => {
    const conversationId = params.conversationId
    const input = SendCoachMessageRequestSchema.safeParse(body ?? {})
    if (!z.uuid().safeParse(conversationId).success || !input.success) {
      throw httpError(
        400,
        'INVALID_COACH_MESSAGE',
        'The coaching message is invalid.',
        { details: input.success ? undefined : input.error.issues },
      )
    }
    return json(
      await mapErrors(
        () => app.coachService.sendMessage(subject, conversationId, input.data),
        rethrowCoachError,
      ),
    )
  },
)
