import {
  ContestAnalysisResponseSchema,
  ProviderKeySchema,
} from '@algomemtor/shared-contracts'

import {
  contestIdSchema,
  invalidMentorInput,
  mentor,
  refreshBody,
} from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

export const POST = route<{ provider: string; contestId: string }>(
  { auth: 'user', aiUsage: 'mentor' },
  async ({ app, subject, params, body }) => {
    const provider = ProviderKeySchema.safeParse(params.provider)
    const contestId = contestIdSchema.safeParse(params.contestId)
    const input = refreshBody.safeParse(body ?? {})
    if (!provider.success || !contestId.success || !input.success) {
      throw invalidMentorInput('The contest reference is invalid.')
    }
    return json(
      ContestAnalysisResponseSchema.parse({
        data: await mentor(() =>
          app.mentorService.contestNarrative(
            subject,
            provider.data,
            contestId.data,
            input.data.refresh === true,
          ),
        ),
      }),
    )
  },
)
