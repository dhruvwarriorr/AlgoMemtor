import type { CellState } from '../scene/types'

// Colours shared by every view: read (sky), written now (amber), changed
// since the last step (green) and newly added (green, stronger).
export const cellStateClass: Record<CellState, string> = {
  none: 'border-border bg-card text-foreground',
  read: 'border-primary/70 bg-primary/10 text-foreground ring-2 ring-primary/25',
  write:
    'border-amber-500 bg-amber-100 text-amber-950 ring-2 ring-amber-400/35 dark:bg-amber-400/20 dark:text-amber-50',
  changed: 'border-go/60 bg-go-soft text-go-foreground',
  new: 'border-go bg-go-soft text-go-foreground ring-2 ring-go/25',
}

// Background for a number in a heat map: stronger for larger values.
export function heat(
  value: number | null,
  min: number,
  max: number,
): string | undefined {
  if (value === null || !Number.isFinite(value)) return undefined
  const span = max - min
  const ratio = span <= 0 ? 0.35 : (value - min) / span
  const strength = Math.round(6 + ratio * 46)
  return `color-mix(in oklab, var(--primary) ${strength}%, var(--card))`
}
