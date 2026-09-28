import {
  BookmarkQuerySchema,
  BookmarkResponseSchema,
  BookmarksResponseSchema,
  SaveBookmarkRequestSchema,
} from '@algomemtor/shared-contracts'

import {
  featureNotEnabled,
  httpError,
  mapErrors,
  rethrowProviderError,
} from '@/server/http/errors'
import { json, queryRecord, route } from '@/server/http/route'

export const GET = route({ auth: 'user' }, async ({ app, subject, query }) => {
  if (!app.progressEnabled) throw featureNotEnabled()
  const input = BookmarkQuerySchema.safeParse(queryRecord(query))
  if (!input.success) {
    throw httpError(
      400,
      'INVALID_BOOKMARK_QUERY',
      'The bookmark query is invalid.',
      { details: input.error.issues },
    )
  }
  return json(
    BookmarksResponseSchema.parse(
      await mapErrors(
        () => app.progressService.listBookmarks(subject, input.data),
        rethrowProviderError,
      ),
    ),
  )
})

export const POST = route({ auth: 'user' }, async ({ app, subject, body }) => {
  if (!app.progressEnabled) throw featureNotEnabled()
  const input = SaveBookmarkRequestSchema.safeParse(body)
  if (!input.success) {
    throw httpError(
      400,
      'INVALID_BOOKMARK',
      'The bookmark reference is invalid.',
      { details: input.error.issues },
    )
  }
  return json(
    BookmarkResponseSchema.parse({
      data: await mapErrors(
        () => app.progressService.saveBookmark(subject, input.data),
        rethrowProviderError,
      ),
    }),
  )
})
