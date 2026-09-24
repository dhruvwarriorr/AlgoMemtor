import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

export type AiLoaderStep = {
  label: string
  indicator: 'dots' | 'bar' | 'grid'
}

const STEP_INTERVAL_MS = 1_800

function Indicator({ kind }: { kind: AiLoaderStep['indicator'] }) {
  if (kind === 'dots') {
    return (
      <span aria-hidden="true" className="flex items-center gap-1">
        {[0, 1, 2].map((index) => (
          <span
            className="ai-dot size-1.5 rounded-full bg-current"
            key={index}
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </span>
    )
  }
  if (kind === 'bar') {
    return (
      <span
        aria-hidden="true"
        className="relative block h-1 w-20 overflow-hidden rounded-full bg-current/15"
      >
        <span className="ai-bar absolute inset-y-0 w-1/3 rounded-full bg-linear-to-r from-brand-a to-brand-b" />
      </span>
    )
  }
  return (
    <span aria-hidden="true" className="grid grid-cols-3 gap-0.5">
      {Array.from({ length: 9 }, (_, index) => (
        <span
          className="ai-grid size-1.5 rounded-[2px] bg-current"
          key={index}
          style={{ animationDelay: `${((index * 5) % 9) * 110}ms` }}
        />
      ))}
    </span>
  )
}

// Working steps that appear one by one, each with its own indicator and a
// running timer, after the "AI loader" reference.
export function AiLoader({
  steps,
  title = 'Working',
  className,
}: {
  steps: readonly AiLoaderStep[]
  title?: string
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const started = performance.now()
    const id = window.setInterval(
      () => setElapsed(performance.now() - started),
      100,
    )
    return () => window.clearInterval(id)
  }, [])

  const visible = reduceMotion
    ? steps
    : steps.slice(
        0,
        Math.min(steps.length, 1 + Math.floor(elapsed / STEP_INTERVAL_MS)),
      )

  return (
    <div
      className={cn(
        'w-full max-w-sm rounded-xl border border-border bg-[color-mix(in_oklab,var(--card)_80%,transparent)] p-4 shadow-soft backdrop-blur-md',
        className,
      )}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="mt-3 space-y-3">
        {visible.map((step, index) => {
          const since = Math.max(0, elapsed - index * STEP_INTERVAL_MS)
          const active = index === visible.length - 1
          return (
            <li
              className={cn(
                'animate-rise flex items-center gap-2.5 text-sm',
                active ? 'text-foreground/80' : 'text-muted-foreground',
              )}
              key={step.label}
            >
              <span>{step.label}</span>
              <span className={active ? 'text-primary' : 'opacity-60'}>
                <Indicator kind={step.indicator} />
              </span>
              <span className="text-xs tabular-nums opacity-60">
                {(since / 1000).toFixed(1)}s
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
