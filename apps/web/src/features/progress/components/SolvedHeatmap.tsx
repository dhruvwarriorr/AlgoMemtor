import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'

type TrendPoint = {
  date: string
  solved: number
}

// Weeks start on Monday, so rows read M, T, W, T, F, S, S.
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// Sky blue for light days, rising into green on the busiest ones.
const levels = [
  'bg-muted',
  'bg-sun/30',
  'bg-sun/60',
  'bg-sun',
  'bg-go',
] as const

function parseLocalDate(date: string): Date {
  return new Date(`${date}T00:00:00`)
}

function level(solved: number) {
  return levels[Math.min(Math.max(solved, 0), levels.length - 1)]
}

function mondayIndex(date: Date) {
  return (date.getDay() + 6) % 7
}

function buildWeeks(trend: readonly TrendPoint[]): (TrendPoint | null)[][] {
  if (trend.length === 0) return []

  const leading = mondayIndex(parseLocalDate(trend[0].date))
  const cells: (TrendPoint | null)[] = [
    ...Array<TrendPoint | null>(leading).fill(null),
    ...trend,
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (TrendPoint | null)[][] = []
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7))
  }
  return weeks
}

function solvedLabel(solved: number) {
  if (solved === 0) return 'No problems solved'
  return `${solved} ${solved === 1 ? 'problem' : 'problems'} solved`
}

export function SolvedHeatmap({ trend }: { trend: readonly TrendPoint[] }) {
  const weeks = buildWeeks(trend)
  const total = trend.reduce((sum, day) => sum + day.solved, 0)

  if (weeks.length === 0) {
    return (
      <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-medium text-foreground">Solve calendar</p>
        <p className="mt-3 text-sm text-muted-foreground">
          No solve history yet for this window.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card p-4 xl:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">Solve calendar</p>
        <p className="text-xs text-muted-foreground">
          {total} in {trend.length} days
        </p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-2">
        <div
          aria-label={`Problems solved per day over the last ${trend.length} days`}
          className="grid grid-flow-col grid-rows-7 gap-1 [--cell:clamp(1rem,2.1dvh,1.5rem)]"
          role="grid"
          style={{ gridTemplateColumns: `auto repeat(${weeks.length}, auto)` }}
        >
          {WEEKDAY_LABELS.map((label, index) => (
            <span
              aria-hidden="true"
              className="flex size-(--cell) items-center justify-start pr-1 text-[11px] leading-none font-medium text-muted-foreground"
              key={`label-${index}`}
              style={{ gridColumn: 1, gridRow: index + 1 }}
            >
              {label}
            </span>
          ))}

          {weeks.flatMap((week, weekIndex) =>
            week.map((day, dayIndex) => {
              const position = {
                gridColumn: weekIndex + 2,
                gridRow: dayIndex + 1,
              }
              if (day === null) {
                return (
                  <span
                    aria-hidden="true"
                    className="size-(--cell)"
                    key={`${weekIndex}-${dayIndex}`}
                    style={position}
                  />
                )
              }

              const date = parseLocalDate(day.date).toLocaleDateString(
                undefined,
                { weekday: 'short', month: 'short', day: 'numeric' },
              )
              const summary = `${solvedLabel(day.solved)} on ${date}`

              return (
                <span
                  aria-label={summary}
                  className="group/cell relative size-(--cell) outline-none hover:z-10 focus-visible:z-10"
                  key={day.date}
                  role="gridcell"
                  style={position}
                  tabIndex={0}
                >
                  <span
                    className={cn(
                      'animate-pop block size-full rounded-sm ring-offset-2 ring-offset-card transition-[box-shadow,transform] duration-200 group-hover/cell:scale-110 group-hover/cell:ring-2 group-hover/cell:ring-foreground/70 group-focus-visible/cell:ring-2 group-focus-visible/cell:ring-ring',
                      level(day.solved),
                    )}
                    style={{ '--i': weekIndex * 7 + dayIndex } as CSSProperties}
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 w-max -translate-x-1/2 translate-y-1 rounded-lg bg-ink px-2.5 py-1.5 text-center opacity-0 shadow-lift transition-[opacity,transform] duration-200 group-hover/cell:translate-y-0 group-hover/cell:opacity-100 group-focus-visible/cell:translate-y-0 group-focus-visible/cell:opacity-100"
                  >
                    <span className="block text-xs font-semibold text-ink-foreground">
                      {solvedLabel(day.solved)}
                    </span>
                    <span className="block text-[11px] text-ink-foreground/70">
                      {date}
                    </span>
                  </span>
                </span>
              )
            }),
          )}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground"
      >
        <span className="mr-1">Less</span>
        {levels.map((className) => (
          <span
            className={cn('size-3 rounded-xs', className)}
            key={className}
          />
        ))}
        <span className="ml-1">More</span>
      </div>
    </div>
  )
}
