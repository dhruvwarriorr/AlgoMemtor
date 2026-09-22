type TrendPoint = {
  date: string
  solved: number
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function parseLocalDate(date: string): Date {
  return new Date(`${date}T00:00:00`)
}

function intensityClass(solved: number): string {
  if (solved <= 0) return 'bg-muted'
  if (solved === 1) return 'bg-sky-soft'
  if (solved === 2) return 'bg-sky'
  if (solved === 3) return 'bg-sky-deep'
  return 'bg-primary'
}

function buildWeeks(trend: readonly TrendPoint[]): (TrendPoint | null)[][] {
  if (trend.length === 0) return []

  const firstWeekday = parseLocalDate(trend[0].date).getDay()
  const cells: (TrendPoint | null)[] = [
    ...Array<TrendPoint | null>(firstWeekday).fill(null),
    ...trend,
  ]

  const weeks: (TrendPoint | null)[][] = []
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7))
  }
  return weeks
}

export function SolvedHeatmap({ trend }: { trend: readonly TrendPoint[] }) {
  const weeks = buildWeeks(trend)

  if (weeks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No solve history yet for this window.
      </p>
    )
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5">
      <p className="text-sm font-medium text-foreground">Solve calendar</p>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 overflow-x-auto py-3">
        <div
          aria-hidden="true"
          className="grid flex-shrink-0 grid-rows-7 gap-1 pt-0.5 text-[10px] leading-none text-muted-foreground"
        >
          {WEEKDAY_LABELS.map((label, index) => (
            <span className="flex h-5 w-3.5 items-center" key={index}>
              {index % 2 === 1 ? label : ''}
            </span>
          ))}
        </div>
        <div className="grid auto-cols-max grid-flow-col grid-rows-7 gap-1">
          {weeks.flatMap((week, weekIndex) =>
            week.map((day, dayIndex) => {
              const key = `${weekIndex}-${dayIndex}`
              if (day === null) {
                return <span className="h-5 w-5" key={key} />
              }
              const label = parseLocalDate(day.date).toLocaleDateString(
                undefined,
                { month: 'short', day: 'numeric', year: 'numeric' },
              )
              return (
                <span
                  className={`h-5 w-5 rounded-[6px] ${intensityClass(day.solved)}`}
                  key={key}
                  title={`${day.solved} solved · ${label}`}
                />
              )
            }),
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1 text-[10px] text-muted-foreground">
        <span>Less</span>
        <span className="h-3 w-3 rounded-[4px] bg-muted" />
        <span className="h-3 w-3 rounded-[4px] bg-sky-soft" />
        <span className="h-3 w-3 rounded-[4px] bg-sky" />
        <span className="h-3 w-3 rounded-[4px] bg-sky-deep" />
        <span className="h-3 w-3 rounded-[4px] bg-primary" />
        <span>More</span>
      </div>
    </div>
  )
}
