// Codeforces rank bands across the rating scale, used to colour ratings and
// to pick a rating range.
export const RATING_FLOOR = 800
export const RATING_CEILING = 3500

export const ratingBands = [
  { label: 'Newbie', min: 800, max: 1199, color: '#9ca3af' },
  { label: 'Pupil', min: 1200, max: 1399, color: '#22c55e' },
  { label: 'Specialist', min: 1400, max: 1599, color: '#06b6d4' },
  { label: 'Expert', min: 1600, max: 1899, color: '#3b82f6' },
  { label: 'Candidate master', min: 1900, max: 2099, color: '#a855f7' },
  { label: 'Master', min: 2100, max: 2399, color: '#f59e0b' },
  { label: 'Grandmaster', min: 2400, max: 3500, color: '#ef4444' },
] as const

const span = RATING_CEILING - RATING_FLOOR

export const ratingPosition = (rating: number) =>
  (Math.min(RATING_CEILING, Math.max(RATING_FLOOR, rating)) - RATING_FLOOR) /
  span

export function bandColor(rating: number) {
  return (
    ratingBands.find((band) => rating >= band.min && rating <= band.max)
      ?.color ?? (rating > RATING_CEILING ? '#ef4444' : '#9ca3af')
  )
}
