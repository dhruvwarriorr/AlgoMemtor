import { json, route } from '@/server/http/route'

export const GET = route({ auth: 'public' }, ({ app }) =>
  json({
    status: 'ok',
    service: 'core-api',
    providers: app.providers.map((item) => item.getHealth()),
  }),
)
