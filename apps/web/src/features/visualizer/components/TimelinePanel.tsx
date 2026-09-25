import { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { buildTimeline, stepLabel } from '../analysis'
import type { ExecutionTrace } from '../trace'

const ROW_HEIGHT = 30
const VIEWPORT = 320
const OVERSCAN = 8

// Every recorded step (or only important ones), with long loops collapsed to
// their first and last iterations. Rows are virtualised for long traces.
export function TimelinePanel({
  trace,
  current,
  important,
  sourceLines,
  onSelect,
}: {
  trace: ExecutionTrace
  current: number
  important: boolean[] | null
  sourceLines: readonly string[]
  onSelect: (index: number) => void
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rows = useMemo(
    () => buildTimeline(trace, important, expanded, current),
    [trace, important, expanded, current],
  )
  const currentRow = rows.findIndex(
    (row) => row.kind === 'step' && row.index === current,
  )

  useEffect(() => {
    const container = containerRef.current
    if (container === null || currentRow < 0) return
    const top = currentRow * ROW_HEIGHT
    if (
      top < container.scrollTop ||
      top + ROW_HEIGHT > container.scrollTop + container.clientHeight
    ) {
      container.scrollTop = Math.max(0, top - container.clientHeight / 2)
    }
  }, [currentRow])

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const last = Math.min(
    rows.length,
    Math.ceil((scrollTop + VIEWPORT) / ROW_HEIGHT) + OVERSCAN,
  )
  const visibleRows = rows.slice(first, last)

  return (
    <section
      aria-labelledby="timeline-heading"
      className="min-w-0 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2
          className="text-sm font-semibold text-foreground"
          id="timeline-heading"
        >
          Timeline
        </h2>
        <p className="text-xs text-muted-foreground">
          {rows.length.toLocaleString()} rows
        </p>
      </div>
      <div
        className="relative mt-3 overflow-y-auto rounded-lg border border-border bg-background"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        ref={containerRef}
        style={{ height: VIEWPORT }}
      >
        <ol
          aria-label="Execution steps"
          style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}
        >
          {visibleRows.map((row, offset) => {
            const position = (first + offset) * ROW_HEIGHT
            if (row.kind === 'collapsed') {
              return (
                <li
                  className="absolute inset-x-0 px-1"
                  key={row.id}
                  style={{ top: position, height: ROW_HEIGHT }}
                >
                  <div className="flex h-full items-center gap-2 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">
                      Iterations {row.from}–{row.to} of the loop at line{' '}
                      {row.line} ({(row.end - row.start).toLocaleString()}{' '}
                      steps)
                    </span>
                    <button
                      className="shrink-0 rounded px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() =>
                        setExpanded((currentSet) =>
                          new Set(currentSet).add(row.id),
                        )
                      }
                      type="button"
                    >
                      Expand
                    </button>
                    <button
                      className="shrink-0 rounded px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onSelect(row.end)}
                      type="button"
                    >
                      Skip to iteration {row.to + 1}
                    </button>
                  </div>
                </li>
              )
            }
            const step = trace.steps[row.index]
            const selected = row.index === current
            return (
              <li
                className="absolute inset-x-0 px-1"
                key={row.index}
                style={{ top: position, height: ROW_HEIGHT }}
              >
                <button
                  aria-current={selected ? 'step' : undefined}
                  className={cn(
                    'flex h-[26px] w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-secondary',
                    !selected &&
                      step?.event === 'error' &&
                      'bg-danger-soft text-danger-foreground',
                  )}
                  onClick={() => onSelect(row.index)}
                  type="button"
                >
                  <span
                    className={cn(
                      'w-12 shrink-0 tabular-nums',
                      selected ? 'opacity-90' : 'text-muted-foreground',
                    )}
                  >
                    {row.index + 1}
                  </span>
                  <span
                    className={cn(
                      'w-10 shrink-0 tabular-nums',
                      selected ? 'opacity-90' : 'text-muted-foreground',
                    )}
                  >
                    L{step?.line}
                  </span>
                  <EventMark event={step?.event} selected={selected} />
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {stepLabel(trace, row.index, sourceLines)}
                  </span>
                  {step?.notes !== undefined ? (
                    <span
                      aria-label="warning"
                      className={cn(
                        'shrink-0',
                        selected ? '' : 'text-amber-600 dark:text-amber-300',
                      )}
                    >
                      ⚠
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function EventMark({
  event,
  selected,
}: {
  event: string | undefined
  selected: boolean
}) {
  if (event === 'call' || event === 'return') {
    return (
      <span
        className={cn(
          'shrink-0 rounded px-1 text-[0.62rem] font-semibold uppercase',
          selected
            ? 'bg-primary-foreground/20'
            : 'bg-secondary text-secondary-foreground',
        )}
      >
        {event === 'call' ? 'call' : 'ret'}
      </span>
    )
  }
  return null
}
