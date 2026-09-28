import {
  ProviderKeySchema,
  UpdateUpsolveItemRequestSchema,
} from '@algomemtor/shared-contracts'
import { z } from 'zod'

import { invalidMentorInput, mentor } from '@/server/http/mentor'
import { noContent, route } from '@/server/http/route'

export const PUT = route<{ provider: string; externalId: string }>(
  { auth: 'user' },
  async ({ app, subject, params, body }) => {
    const provider = ProviderKeySchema.safeParse(params.provider)
    const externalId = z
      .string()
      .trim()
      .min(1)
      .max(128)
      .safeParse(params.externalId)
    const input = UpdateUpsolveItemRequestSchema.safeParse(body)
    if (!provider.success || !externalId.success || !input.success) {
      throw invalidMentorInput('The upsolve update is invalid.')
    }
    await mentor(() =>
      app.mentorService.setUpsolveState(
        subject,
        provider.data,
        externalId.data,
        input.data.state,
      ),
    )
    return noContent()
  },
)
