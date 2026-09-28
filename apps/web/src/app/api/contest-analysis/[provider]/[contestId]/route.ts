import {
  ContestAnalysisResponseSchema,
  ProviderKeySchema,
} from '@algomemtor/shared-contracts'

import {
  contestIdSchema,
  invalidMentorInput,
  mentor,
} from '@/server/http/mentor'
import { json, route } from '@/server/http/route'

export const GET = route<{ provider: string; contestId: string }>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const provider = ProviderKeySchema.safeParse(params.provider)
    const contestId = contestIdSchema.safeParse(params.contestId)
    if (!provider.success || !contestId.success) {
      throw invalidMentorInput('The contest reference is invalid.')
    }
    return json(
      ContestAnalysisResponseSchema.parse({
        data: await mentor(() =>
          app.mentorService.contestDetail(
            subject,
            provider.data,
            contestId.data,
          ),
        ),
      }),
    )
  },
)
