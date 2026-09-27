export const insightPalette = [
  '#0ea5e9',
  '#22c55e',
  '#2d6cdf',
  '#f2b84b',
  '#8b5cf6',
  '#e0484f',
  '#14a3a3',
  '#6c7a90',
  '#d9467a',
  '#3f8f8b',
  '#b8860b',
  '#5b6ee1',
]

export const insightEase = [0.16, 1, 0.3, 1] as const

export function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${month}-15T12:00:00.000Z`))
}

// Codeforces-style rank colours, so a rating reads the same everywhere.
export function ratingColor(rating: number) {
  if (rating < 1200) return '#8b95a5'
  if (rating < 1400) return '#22c55e'
  if (rating < 1600) return '#14b8a6'
  if (rating < 1900) return '#3b82f6'
  if (rating < 2100) return '#a855f7'
  if (rating < 2400) return '#f59e0b'
  return '#ef4444'
}

// Circles packed along an elliptical spiral, largest first: a deterministic
// bubble layout for a handful of values. Radii are relative to the largest.
export function packBubbles(values: readonly number[]) {
  const largest = Math.max(1, ...values)
  const placed: Array<{ x: number; y: number; r: number }> = []
  for (const value of values) {
    const r = Math.max(0.2, Math.sqrt(value / largest))
    let t = 0
    for (;;) {
      const x = 0.06 * t * Math.cos(t) * 1.5
      const y = 0.06 * t * Math.sin(t)
      const clear = placed.every(
        (other) => Math.hypot(other.x - x, other.y - y) >= other.r + r + 0.06,
      )
      if (clear || t > 400) {
        placed.push({ x, y, r })
        break
      }
      t += 0.08
    }
  }
  const minX = Math.min(...placed.map((item) => item.x - item.r), 0)
  const maxX = Math.max(...placed.map((item) => item.x + item.r), 0)
  const minY = Math.min(...placed.map((item) => item.y - item.r), 0)
  const maxY = Math.max(...placed.map((item) => item.y + item.r), 0)
  return {
    bubbles: placed,
    viewBox: `${minX - 0.08} ${minY - 0.08} ${maxX - minX + 0.16} ${maxY - minY + 0.16}`,
  }
}

// Newest first: every year from the first activity to this one.
export function calendarYears(
  currentYear: number,
  firstActivityAt: string | undefined,
  solvedOverTime: Record<string, number>,
) {
  const fromActivity =
    firstActivityAt === undefined
      ? Number.NaN
      : new Date(firstActivityAt).getFullYear()
  const fromDays = Object.keys(solvedOverTime)
    .filter((day) => (solvedOverTime[day] ?? 0) > 0)
    .map((day) => Number(day.slice(0, 4)))
  const candidates = [fromActivity, ...fromDays].filter((year) =>
    Number.isFinite(year),
  )
  const firstYear = Math.min(currentYear, ...candidates)
  return Array.from(
    { length: currentYear - firstYear + 1 },
    (_, index) => currentYear - index,
  )
}
