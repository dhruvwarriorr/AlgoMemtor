import { melloStates, type PetClips } from './mello-states'

// Decoded sprite sheets, kept referenced so the browser keeps them ready.
const images = new Map<string, HTMLImageElement>()
const ready = new Set<string>()

export function preloadSprite(src: string) {
  if (images.has(src)) return
  const image = new Image()
  image.src = src
  images.set(src, image)
  image
    .decode()
    .then(() => ready.add(src))
    .catch(() => {
      // A failed load is retried the next time the pose is wanted.
      images.delete(src)
    })
}

export const isSpriteReady = (src: string) => ready.has(src)

// Idle, the hover poses and watching load at once; the rest once the page
// settles.
export function preloadPet(clips: PetClips) {
  for (const state of ['idle', 'greet', 'awe', 'watching'] as const) {
    preloadSprite(clips[state].src)
  }
  const later = () => {
    for (const state of melloStates) preloadSprite(clips[state].src)
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(later)
  } else {
    window.setTimeout(later, 1500)
  }
}
