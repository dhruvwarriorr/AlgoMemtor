import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { describeStep } from '../analysis'
import type { ExecutionTrace } from '../trace'

export function StepCard({
  trace,
  current,
  sourceLines,
  action,
}: {
  trace: ExecutionTrace
  current: number
  sourceLines: readonly string[]
  action?: ReactNode
}) {
  const step = trace.steps[current]
  if (step === undefined) return null
  const description = describeStep(trace, current, sourceLines)
  const code = (sourceLines[step.line - 1] ?? '').trim()
  const isError = step.event === 'error'
  return (
    <section
      aria-live="polite"
      aria-label="What happened at this step"
      className={cn(
        'min-w-0 rounded-xl border p-4',
        isError
          ? 'border-destructive/40 bg-danger-soft'
          : 'border-border bg-card',
      )}
    >
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Step {current + 1}
      </p>
      <h2
        className={cn(
          'mt-1 text-base font-semibold',
          isError ? 'text-danger-foreground' : 'text-foreground',
        )}
      >
        {description.title}
      </h2>
      {code !== '' ? (
        <pre className="mt-2 overflow-x-auto rounded-md bg-background/70 px-2.5 py-1.5 font-mono text-[0.78rem] text-foreground">
          {code}
        </pre>
      ) : null}
      {description.detail.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-sm leading-6 text-foreground/90">
          {description.detail.map((item, index) => (
            <li
              className="min-w-0 break-words font-mono text-[0.8rem]"
              key={index}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {isError && trace.error?.details !== undefined ? (
        <ul className="mt-3 grid gap-1 rounded-lg bg-background/60 p-3 text-sm leading-6 text-danger-foreground">
          {trace.error.details.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {step.notes !== undefined ? (
        <ul className="mt-3 grid gap-1.5">
          {step.notes.map((note) => (
            <li
              className="rounded-lg border border-amber-500/40 bg-amber-100 px-3 py-2 text-sm leading-6 text-amber-950 dark:bg-amber-400/15 dark:text-amber-100"
              key={note}
            >
              {note}
            </li>
          ))}
        </ul>
      ) : null}
      {action !== undefined ? (
        <div className="mt-3 flex flex-wrap gap-2">{action}</div>
      ) : null}
    </section>
  )
}
