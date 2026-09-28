import { json, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, ({ subject }) =>
  json({ user: { id: subject } }),
)
