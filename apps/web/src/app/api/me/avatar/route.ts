import { httpError } from '@/server/http/errors'
import { json, noContent, route } from '@/server/http/route'
import {
  AVATAR_MAX_BYTES,
  avatarMimeTypes,
  detectAvatarMimeType,
} from '@/server/repositories/avatar-repository'

// Learner profile picture. The browser uploads a small, already-resized
// image; the server re-checks the size and the real file signature.
export const GET = route({ auth: 'user' }, async ({ app, subject }) => {
  const avatar = await app.avatarRepository.findByAuthUserId(subject)
  if (avatar === null) {
    throw httpError(404, 'AVATAR_NOT_FOUND', 'No profile picture is set.')
  }
  return new Response(new Uint8Array(avatar.data), {
    headers: {
      'content-type': avatar.mimeType,
      'cache-control': 'private, no-cache',
      'x-content-type-options': 'nosniff',
      'last-modified': avatar.updatedAt.toUTCString(),
    },
  })
})

export const PUT = route(
  {
    auth: 'user',
    body: 'raw',
    rawTypes: avatarMimeTypes,
    bodyLimit: AVATAR_MAX_BYTES,
  },
  async ({ app, subject, rawBody, request }) => {
    const detected = rawBody === null ? null : detectAvatarMimeType(rawBody)
    if (
      rawBody === null ||
      rawBody.length === 0 ||
      detected === null ||
      detected !== request.headers.get('content-type')?.split(';')[0]?.trim()
    ) {
      throw httpError(
        415,
        'AVATAR_INVALID_IMAGE',
        'Upload a WebP, JPEG or PNG image.',
      )
    }
    const saved = await app.avatarRepository.saveByAuthUserId(subject, {
      mimeType: detected,
      data: rawBody,
    })
    return json({
      data: {
        mimeType: saved.mimeType,
        byteSize: saved.data.length,
        updatedAt: saved.updatedAt.toISOString(),
      },
    })
  },
)

export const DELETE = route({ auth: 'user' }, async ({ app, subject }) => {
  await app.avatarRepository.deleteByAuthUserId(subject)
  return noContent()
})
