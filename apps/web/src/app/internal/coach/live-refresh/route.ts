import { LinkableProviderSchema } from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { deletionPending, httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

// Called by the AI service's coach when stored data is not enough to answer.
export const POST = route({ auth: 'internal' }, async ({ app, body }) => {
  const input = z
    .object({ learnerId: z.uuid(), provider: LinkableProviderSchema })
    .strict()
    .safeParse(body ?? {})
  if (!input.success) {
    throw httpError(
      400,
      'INVALID_COACH_LIVE_REFRESH',
      'The coach live refresh request is invalid.',
    )
  }
  if (await app.progressRepository.hasPendingDeletion(input.data.learnerId)) {
    throw deletionPending()
  }
  return json({
    data: await app.coachLiveRefresh.refresh(
      input.data.learnerId,
      input.data.provider,
    ),
  })
})
