import { UnifiedProfileResponseSchema } from '@algomemtor/shared-contracts'

import { json, route } from '@/server/http/route'
import { serializeProviderAccount } from '@/server/services/provider-account-service'

export const GET = route({ auth: 'user' }, async ({ app, subject }) => {
  const profile = await app.providerStatsForProfile(subject)
  return json(
    UnifiedProfileResponseSchema.parse({
      data: {
        ...profile,
        accounts: profile.accounts.map(serializeProviderAccount),
        ...(profile.archivedAccounts === undefined
          ? {}
          : {
              archivedAccounts: profile.archivedAccounts.map(
                serializeProviderAccount,
              ),
            }),
        generatedAt: new Date().toISOString(),
      },
    }),
  )
})
