import { useState } from 'react'

import { cn } from '@/lib/utils'

import { changeKey, changesAt, formatValue, shorten } from '../analysis'
import type { ExecutionTrace, TraceFrame } from '../trace'

// The call stack with each frame's variables. Values that changed at this
// step are highlighted with their previous value.
export function VariablesPanel({
  trace,
  current,
  watched,
  onWatch,
}: {
  trace: ExecutionTrace
  current: number
  watched: string | null
  onWatch: (key: string | null) => void
}) {
  const step = trace.steps[current]
  const [openFrames, setOpenFrames] = useState<ReadonlySet<number>>(new Set())
  if (step === undefined) return null
  const changes = new Map(
    changesAt(trace, current).map((change) => [
      changeKey(change.frame, change.name),
      change,
    ]),
  )
  const frames = [...step.frames].reverse()
  const top = step.frames.at(-1)

  return (
    <section
      aria-labelledby="variables-heading"
      className="min-w-0 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2
          className="text-sm font-semibold text-foreground"
          id="variables-heading"
        >
          Variables
        </h2>
        <p className="text-xs text-muted-foreground">
          Innermost call first · click a name to watch it
        </p>
      </div>
      <ol className="mt-3 grid gap-2">
        {frames.map((frame) => {
          const isTop = frame === top
          const open = isTop || frame.id === 0 || openFrames.has(frame.id)
          return (
            <li
              className={cn(
                'min-w-0 rounded-lg border',
                isTop ? 'border-primary/40 bg-primary/5' : 'border-border',
              )}
              key={`${frame.id}-${frame.name}`}
            >
              <FrameHeader
                frame={frame}
                isTop={isTop}
                onToggle={
                  isTop || frame.id === 0 || frame.elided === true
                    ? undefined
                    : () =>
                        setOpenFrames((currentOpen) => {
                          const next = new Set(currentOpen)
                          if (next.has(frame.id)) next.delete(frame.id)
                          else next.add(frame.id)
                          return next
                        })
                }
                open={open}
                trace={trace}
              />
              {open && frame.vars.length > 0 ? (
                <table className="w-full table-fixed border-t border-border/70 text-left text-[0.8rem]">
                  <caption className="sr-only">
                    Variables of {frame.name}
                  </caption>
                  <tbody>
                    {frame.vars.map(([name, id]) => {
                      const key = changeKey(frame.id, name)
                      const change = changes.get(key)
                      const isWatched = watched === key
                      return (
                        <tr
                          className={cn(
                            'border-b border-border/50 last:border-b-0',
                            change !== undefined &&
                              'bg-amber-100/80 dark:bg-amber-400/10',
                          )}
                          key={name}
                        >
                          <th
                            className="w-[38%] px-3 py-1.5 align-top font-mono font-medium"
                            scope="row"
                          >
                            <button
                              aria-pressed={isWatched}
                              className={cn(
                                'max-w-full truncate rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                isWatched
                                  ? 'text-primary underline underline-offset-4'
                                  : 'text-foreground hover:underline',
                              )}
                              onClick={() => onWatch(isWatched ? null : key)}
                              title={
                                isWatched ? 'Stop watching' : `Watch ${name}`
                              }
                              type="button"
                            >
                              {name}
                            </button>
                          </th>
                          <td className="px-3 py-1.5 align-top font-mono break-words text-foreground">
                            <span title={formatValue(trace, id)}>
                              {shorten(formatValue(trace, id), 140)}
                            </span>
                            {change !== undefined &&
                            change.before !== undefined ? (
                              <span className="ml-2 text-[0.7rem] text-amber-900 dark:text-amber-200">
                                was{' '}
                                {shorten(formatValue(trace, change.before), 40)}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : null}
              {open && frame.vars.length === 0 && frame.elided !== true ? (
                <p className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
                  No variables yet.
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function FrameHeader({
  trace,
  frame,
  isTop,
  open,
  onToggle,
}: {
  trace: ExecutionTrace
  frame: TraceFrame
  isTop: boolean
  open: boolean
  onToggle: (() => void) | undefined
}) {
  const args = frame.vars
    .filter(([name]) => name !== 'this' && name !== 'self')
    .slice(0, 3)
    .map(([name, id]) => `${name}=${shorten(formatValue(trace, id), 14)}`)
    .join(', ')
  const label =
    frame.id === 0
      ? 'Global'
      : frame.elided === true && frame.id < 0
        ? frame.name
        : `${frame.name}(${frame.elided === true ? '…' : args})`
  const content = (
    <>
      <span className="min-w-0 truncate font-mono text-[0.8rem] font-semibold text-foreground">
        {label}
      </span>
      {frame.line > 0 ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          line {frame.line}
        </span>
      ) : null}
      {isTop ? (
        <span className="shrink-0 rounded bg-primary/15 px-1.5 text-[0.65rem] font-semibold tracking-wide text-primary uppercase">
          running
        </span>
      ) : null}
    </>
  )
  if (onToggle === undefined) {
    return (
      <div className="flex min-w-0 items-center gap-2 px-3 py-2">{content}</div>
    )
  }
  return (
    <button
      aria-expanded={open}
      className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      onClick={onToggle}
      type="button"
    >
      {content}
    </button>
  )
}
