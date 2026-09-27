import type { CSSProperties } from 'react'

// Gestures for `.icon-motion` icons (see index.css): the icon draws in once,
// then plays its gesture whenever it or its button, link or card is hovered.
export type IconMotion =
  | 'bob'
  | 'pop'
  | 'wiggle'
  | 'spin'
  | 'tilt'
  | 'swing'
  | 'flicker'
  | 'nudge'
  | 'twinkle'
  | 'rise'

// Staggers an icon's entrance by its position in a list.
export const iconStagger = (index: number) =>
  ({ '--i': index }) as CSSProperties
