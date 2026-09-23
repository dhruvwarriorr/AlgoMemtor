import { authenticatedFetch } from '@/features/auth/authenticated-fetch'

export const AVATAR_UPLOAD_MAX_BYTES = 256 * 1024
const AVATAR_SIZE = 256

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The picture could not be read.'))
    reader.onerror = () => reject(new Error('The picture could not be read.'))
    reader.readAsDataURL(blob)
  })
}

// Profile pictures need the learner's token, so they cannot be a plain
// <img src>. The small (≤256 KB) image is cached as a data URL instead.
export async function fetchAvatarPhoto(signal?: AbortSignal) {
  const response = await authenticatedFetch('/api/me/avatar', { signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Your profile picture could not be loaded.')
  return blobToDataUrl(await response.blob())
}

export async function uploadAvatarPhoto(image: Blob) {
  const response = await authenticatedFetch('/api/me/avatar', {
    method: 'PUT',
    headers: { 'content-type': image.type },
    body: image,
  })
  if (!response.ok) {
    throw new Error(
      response.status === 413
        ? 'That image is too large. Try a smaller photo.'
        : 'Your profile picture could not be uploaded.',
    )
  }
}

export async function deleteAvatarPhoto() {
  const response = await authenticatedFetch('/api/me/avatar', {
    method: 'DELETE',
  })
  if (!response.ok && response.status !== 404) {
    throw new Error('Your profile picture could not be removed.')
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  )
}

// Center-crops the chosen file to a square and resizes it to 256px, so the
// upload is a few kilobytes no matter how large the original photo is.
export async function prepareAvatarImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file (JPEG, PNG, WebP, HEIC or GIF).')
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 20 MB.')
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('This image could not be read. Try a JPEG or PNG.')
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('Image processing is unavailable.')
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  )
  bitmap.close()
  for (const [type, quality] of [
    ['image/webp', 0.86],
    ['image/jpeg', 0.86],
    ['image/jpeg', 0.7],
  ] as const) {
    const blob = await canvasBlob(canvas, type, quality)
    // Some browsers silently fall back to PNG for unsupported types.
    if (
      blob !== null &&
      blob.type === type &&
      blob.size <= AVATAR_UPLOAD_MAX_BYTES
    ) {
      return blob
    }
  }
  throw new Error('This image could not be compressed enough to upload.')
}
