import { featureNotEnabled } from '@/server/http/errors'
import { json, noContent, route } from '@/server/http/route'
import { problemReference } from '@/server/http/schemas'

type Params = { provider: string; externalId: string }

export const GET = route<Params>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    if (!app.progressEnabled) throw featureNotEnabled()
    const reference = problemReference(params)
    return json(await app.progressService.getProgress(subject, reference))
  },
)

export const DELETE = route<Params>(
  { auth: 'user' },
  async ({ app, subject, params }) => {
    if (!app.progressEnabled) throw featureNotEnabled()
    const reference = problemReference(params)
    await app.progressService.deleteProblem(subject, reference)
    return noContent()
  },
)
