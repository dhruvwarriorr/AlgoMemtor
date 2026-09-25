import type {
  ContestParticipationMode,
  ProviderKey,
} from '@algomemtor/shared-contracts'

// Chart styling shared by the mentor tools; it matches the Progress and
// Insights pages so every analytics surface reads as one system.

export const tooltipStyle = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  color: 'var(--popover-foreground)',
  fontSize: 12,
}

export const axisTick = { fill: 'var(--muted-foreground)', fontSize: 11 }

export const chartColors = {
  solved: '#22c55e',
  upsolved: '#0ea5e9',
  // A tint of the muted text colour: visible on light and dark cards alike
  // (the border colour nearly vanished on dark ones).
  open: 'color-mix(in oklab, var(--muted-foreground) 35%, transparent)',
  wrong: '#e0484f',
  accent: '#0ea5e9',
} as const

export const providerColors: Record<ProviderKey, string> = {
  codeforces: '#2d6cdf',
  codechef: '#8a7446',
  leetcode: '#f2b84b',
  cses: '#14a3a3',
}

export const providerShort: Record<ProviderKey, string> = {
  codeforces: 'CF',
  codechef: 'CC',
  leetcode: 'LC',
  cses: 'CSES',
}

export const participationLabels: Record<ContestParticipationMode, string> = {
  rated: 'Rated',
  unrated: 'Live, unrated',
  practice: 'Practised after',
}

// Compact day for chart ticks (e.g. 9/21), short enough for phone widths.
export function shortDay(value: string | undefined) {
  if (value === undefined) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value))
}
