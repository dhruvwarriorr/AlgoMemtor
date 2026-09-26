import type { ProviderKey } from '@algomemtor/shared-contracts'

export const dashEase = [0.16, 1, 0.3, 1] as const

export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export type RatingTier = { name: string; min: number; color: string }

// Published rank thresholds. LeetCode's badges are percentile based, so it
// gets no fixed bands.
const codeforcesTiers: readonly RatingTier[] = [
  { name: 'Newbie', min: 0, color: '#8b95a5' },
  { name: 'Pupil', min: 1200, color: '#22c55e' },
  { name: 'Specialist', min: 1400, color: '#14b8a6' },
  { name: 'Expert', min: 1600, color: '#3b82f6' },
  { name: 'Candidate Master', min: 1900, color: '#a855f7' },
  { name: 'Master', min: 2100, color: '#f59e0b' },
  { name: 'International Master', min: 2300, color: '#f97316' },
  { name: 'Grandmaster', min: 2400, color: '#ef4444' },
  { name: 'International Grandmaster', min: 2600, color: '#dc2626' },
  { name: 'Legendary Grandmaster', min: 3000, color: '#b91c1c' },
]

const codechefTiers: readonly RatingTier[] = [
  { name: '1★', min: 0, color: '#8b95a5' },
  { name: '2★', min: 1400, color: '#22c55e' },
  { name: '3★', min: 1600, color: '#3b82f6' },
  { name: '4★', min: 1800, color: '#a855f7' },
  { name: '5★', min: 2000, color: '#eab308' },
  { name: '6★', min: 2200, color: '#f97316' },
  { name: '7★', min: 2500, color: '#ef4444' },
]

export function ratingTiers(provider: ProviderKey | undefined) {
  if (provider === 'codeforces') return codeforcesTiers
  if (provider === 'codechef') return codechefTiers
  return undefined
}

// The tier a rating sits in and the one after it, when the platform has
// fixed thresholds.
export function tierFor(tiers: readonly RatingTier[], rating: number) {
  const index = tiers.reduce(
    (found, tier, position) => (rating >= tier.min ? position : found),
    0,
  )
  return { tier: tiers[index], next: tiers[index + 1] }
}

export function dayLabel(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00.000Z`))
}

// Blend two hex colours; `amount` 0 gives `from`, 1 gives `to`.
export function mixHex(from: string, to: string, amount: number) {
  const parse = (hex: string) =>
    [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16))
  const [a, b] = [parse(from), parse(to)]
  const channel = (index: number) =>
    Math.round((a[index] ?? 0) + ((b[index] ?? 0) - (a[index] ?? 0)) * amount)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(0)}${channel(1)}${channel(2)}`
}
