import {
  CoachConversationEnvelopeSchema,
  CoachConversationsResponseSchema,
  CreateCoachConversationRequestSchema,
} from '@algomemtor/shared-contracts'

import { httpError, mapErrors, rethrowCoachError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, async ({ app, subject }) =>
  json(
    CoachConversationsResponseSchema.parse({
      data: await mapErrors(
        () => app.coachService.listConversations(subject),
        rethrowCoachError,
      ),
    }),
  ),
)

export const POST = route({ auth: 'user' }, async ({ app, subject, body }) => {
  const input = CreateCoachConversationRequestSchema.safeParse(body ?? {})
  if (!input.success) {
    throw httpError(
      400,
      'INVALID_COACH_CONVERSATION',
      'The coaching conversation input is invalid.',
      { details: input.error.issues },
    )
  }
  return json(
    CoachConversationEnvelopeSchema.parse({
      data: await mapErrors(
        () => app.coachService.createConversation(subject, input.data),
        rethrowCoachError,
      ),
    }),
    201,
  )
})
