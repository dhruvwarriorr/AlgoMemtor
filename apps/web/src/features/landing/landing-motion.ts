export const landingEase = [0.16, 1, 0.3, 1] as const

// Position of `v` between `from` and `to`, clamped to 0–1.
export function progressBetween(v: number, from: number, to: number) {
  return Math.min(1, Math.max(0, (v - from) / (to - from)))
}
