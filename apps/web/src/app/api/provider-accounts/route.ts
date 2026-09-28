import { ProviderAccountsResponseSchema } from '@algomemtor/shared-contracts'

import { json, route } from '@/server/http/route'
import { serializeProviderAccount } from '@/server/services/provider-account-service'

export const GET = route({ auth: 'user' }, async ({ app, subject }) => {
  const accounts =
    await app.providerAccountRepository.findAllByAuthUserId(subject)
  return json(
    ProviderAccountsResponseSchema.parse({
      data: accounts.map(serializeProviderAccount),
    }),
  )
})
