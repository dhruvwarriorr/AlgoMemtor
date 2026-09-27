import type { ProviderKey } from './problem-catalog.js'

// A learner's current standing on a platform, shown next to their rating:
// CodeChef stars, a LeetCode contest badge, or a Codeforces rank title.

export type PlatformTier =
  | { kind: 'stars'; stars: number; label: string; color: string }
  | {
      kind: 'badge'
      badge: 'knight' | 'guardian' | 'none'
      label: string
      color: string
    }
  | { kind: 'title'; label: string; color: string }

// CodeChef's published star bands: 1★ below 1400 up to 7★ at 2500 and
// above. Colours keep each band's hue, brightened to read on both themes.
export const CODECHEF_STAR_BANDS: readonly {
  stars: number
  min: number
  color: string
}[] = [
  { stars: 1, min: 0, color: '#8b95a5' },
  { stars: 2, min: 1400, color: '#22c55e' },
  { stars: 3, min: 1600, color: '#3b82f6' },
  { stars: 4, min: 1800, color: '#a855f7' },
  { stars: 5, min: 2000, color: '#eab308' },
  { stars: 6, min: 2200, color: '#f97316' },
  { stars: 7, min: 2500, color: '#ef4444' },
]

export function codechefStars(rating: number): number {
  let stars = 1
  for (const band of CODECHEF_STAR_BANDS) {
    if (rating >= band.min) stars = band.stars
  }
  return stars
}

const CODEFORCES_TITLES: readonly {
  name: string
  min: number
  color: string
}[] = [
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

const titleCase = (value: string) =>
  value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())

/**
 * The standing to show beside a rating. CodeChef stars follow from the
 * rating; a LeetCode badge is what LeetCode reports (Knight or Guardian are
 * percentile based and cannot be derived from the rating); a Codeforces title
 * is the reported rank or, failing that, the rating band.
 */
export function platformTier(input: {
  provider: ProviderKey
  rating?: number | undefined
  rank?: string | undefined
}): PlatformTier | undefined {
  const rank = input.rank?.trim()
  if (input.provider === 'codechef') {
    if (input.rating === undefined) return undefined
    const stars = codechefStars(input.rating)
    const band = CODECHEF_STAR_BANDS[stars - 1] ?? CODECHEF_STAR_BANDS[0]
    return {
      kind: 'stars',
      stars,
      label: `${stars}★`,
      color: band?.color ?? '#666666',
    }
  }
  if (input.provider === 'leetcode') {
    const name = rank?.toLowerCase()
    if (name === 'guardian') {
      return {
        kind: 'badge',
        badge: 'guardian',
        label: 'Guardian',
        color: '#e5a50a',
      }
    }
    if (name === 'knight') {
      return {
        kind: 'badge',
        badge: 'knight',
        label: 'Knight',
        color: '#4c8bf5',
      }
    }
    // A rated learner without a contest badge.
    return input.rating === undefined
      ? undefined
      : {
          kind: 'badge',
          badge: 'none',
          label: 'No badge yet',
          color: '#8b95a5',
        }
  }
  if (input.provider === 'codeforces') {
    const byName =
      rank === undefined || rank === ''
        ? undefined
        : CODEFORCES_TITLES.find(
            (title) => title.name.toLowerCase() === rank.toLowerCase(),
          )
    if (byName !== undefined) {
      return { kind: 'title', label: byName.name, color: byName.color }
    }
    if (input.rating === undefined) return undefined
    const band = [...CODEFORCES_TITLES]
      .reverse()
      .find((title) => (input.rating ?? 0) >= title.min)
    return band === undefined
      ? undefined
      : { kind: 'title', label: titleCase(band.name), color: band.color }
  }
  return undefined
}
