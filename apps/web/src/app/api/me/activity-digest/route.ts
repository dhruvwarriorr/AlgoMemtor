import { LearnerActivityDigestResponseSchema } from '@algomemtor/shared-contracts'

import { json, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, async ({ app, subject }) => {
  const accounts =
    await app.providerAccountRepository.findAllByAuthUserId(subject)
  return json(
    LearnerActivityDigestResponseSchema.parse({
      data:
        accounts.length === 0
          ? null
          : await app.learnerActivityService.get(subject),
    }),
  )
})
