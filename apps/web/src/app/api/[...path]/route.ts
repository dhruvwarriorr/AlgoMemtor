import { httpError } from '@/server/http/errors'
import { route } from '@/server/http/route'

// Unknown API paths answer with a JSON error instead of the site's 404 page.
const notFound = route({ auth: 'public' }, () => {
  throw httpError(404, 'NOT_FOUND', 'That API route does not exist.')
})

export const GET = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
