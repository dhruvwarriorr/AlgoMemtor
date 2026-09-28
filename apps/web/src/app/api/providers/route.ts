import { json, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, ({ app }) =>
  json(app.catalogService.getProviders()),
)
