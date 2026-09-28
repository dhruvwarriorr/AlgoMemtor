import { CoachConversationEnvelopeSchema } from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { httpError, mapErrors, rethrowCoachError } from '@/server/http/errors'
import { json, noContent, route } from '@/server/http/route'

type Params = { conversationId: string }

const conversationIdOrThrow = (conversationId: string) => {
  if (!z.uuid().safeParse(conversationId).success) {
    throw httpError(
      400,
      'INVALID_COACH_CONVERSATION',
      'The coaching conversation ID is invalid.',
    )
  }
  return conversationId
}

export const GET = route<Params>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const conversationId = conversationIdOrThrow(params.conversationId)
    return json(
      await mapErrors(
        () => app.coachService.getConversation(subject, conversationId),
        rethrowCoachError,
      ),
    )
  },
)

export const PATCH = route<Params>(
  { auth: 'user' },
  async ({ app, subject, params, body }) => {
    const conversationId = params.conversationId
    const input = z
      .object({ title: z.string().trim().min(1).max(120) })
      .strict()
      .safeParse(body ?? {})
    if (!z.uuid().safeParse(conversationId).success || !input.success) {
      throw httpError(
        400,
        'INVALID_COACH_CONVERSATION',
        'The coaching conversation update is invalid.',
      )
    }
    return json(
      CoachConversationEnvelopeSchema.parse({
        data: await mapErrors(
          () =>
            app.coachService.renameConversation(
              subject,
              conversationId,
              input.data.title,
            ),
          rethrowCoachError,
        ),
      }),
    )
  },
)

export const DELETE = route<Params>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const conversationId = conversationIdOrThrow(params.conversationId)
    await mapErrors(
      () => app.coachService.deleteConversation(subject, conversationId),
      rethrowCoachError,
    )
    // Removes the conversation's AI audit copy right away.
    app.wakeJobs(subject)
    return noContent()
  },
)
