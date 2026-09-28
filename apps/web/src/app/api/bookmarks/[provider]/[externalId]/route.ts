import { featureNotEnabled } from '@/server/http/errors'
import { noContent, route } from '@/server/http/route'
import { problemReference } from '@/server/http/schemas'

export const DELETE = route<{ provider: string; externalId: string }>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    if (!app.progressEnabled) throw featureNotEnabled()
    await app.progressService.removeBookmark(subject, problemReference(params))
    return noContent()
  },
)
