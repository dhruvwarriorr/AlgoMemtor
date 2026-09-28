import {
  CoachActionProposalResponseSchema,
  ConfirmCoachActionRequestSchema,
} from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { httpError, mapErrors, rethrowCoachError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const POST = route<{ proposalId: string }>(
  { auth: 'user' },
  async ({ app, subject, params, body }) => {
    const proposalId = params.proposalId
    const input = ConfirmCoachActionRequestSchema.safeParse(body ?? {})
    if (!z.uuid().safeParse(proposalId).success || !input.success) {
      throw httpError(
        400,
        'INVALID_COACH_PROPOSAL',
        'The coaching action confirmation is invalid.',
      )
    }
    return json(
      CoachActionProposalResponseSchema.parse({
        data: await mapErrors(
          () => app.coachService.confirmProposal(subject, proposalId),
          rethrowCoachError,
        ),
      }),
    )
  },
)
