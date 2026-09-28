import {
  LinkableProviderSchema,
  ProviderSyncStatusResponseSchema,
} from '@algomemtor/shared-contracts'

import { httpError } from '@/server/http/errors'
import { json, route } from '@/server/http/route'

export const GET = route<{ provider: string }>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    const providerResult = LinkableProviderSchema.safeParse(params.provider)
    if (!providerResult.success) {
      throw httpError(
        400,
        'UNSUPPORTED_LINK_PROVIDER',
        'That provider does not have a synchronization status.',
      )
    }
    return json(
      ProviderSyncStatusResponseSchema.parse(
        await app.providerSyncService.status(subject, providerResult.data),
      ),
    )
  },
)
