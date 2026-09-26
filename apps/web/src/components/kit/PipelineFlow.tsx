import type { CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import type { IconComponent } from '@/components/icons/algo-icons'
import { cn } from '@/lib/utils'

export type PipelineStep = {
  label: string
  detail?: string
  icon?: IconComponent
}

// Stages joined by connectors that carry a travelling beam of light, the way
// an agent pipeline shows work moving through it. `active` lights the stage
// in progress; stages before it read as done.
export function PipelineFlow({
  steps,
  active,
  className,
  label,
  compact = false,
}: {
  steps: readonly PipelineStep[]
  active?: number
  className?: string
  label: string
  compact?: boolean
}) {
  const reduceMotion = useReducedMotion()
  return (
    <ol
      aria-label={label}
      className={cn(
        'flex min-w-0 flex-col gap-0 sm:flex-row sm:items-stretch',
        className,
      )}
    >
      {steps.map((step, index) => {
        const Icon = step.icon
        const done = active !== undefined && index < active
        const current = active === index
        return (
          <li
            aria-current={current ? 'step' : undefined}
            className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center"
            key={step.label}
          >
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'relative flex min-w-0 items-center gap-2.5 rounded-xl border bg-card/80 backdrop-blur transition-colors sm:flex-1',
                compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
                current
                  ? 'border-acc shadow-[0_0_0_4px_color-mix(in_oklab,var(--acc)_16%,transparent)]'
                  : done
                    ? 'border-[color-mix(in_oklab,var(--acc)_40%,var(--border))]'
                    : 'border-border',
              )}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              transition={{
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.08 * index,
              }}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'grid shrink-0 place-items-center rounded-lg',
                  compact ? 'size-7' : 'size-8',
                  current || done
                    ? 'bg-acc text-white [--icon-node:#fff] dark:text-[#0b0c0e] dark:[--icon-node:#0b0c0e]'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {Icon ? (
                  <Icon className="size-4" />
                ) : (
                  <span className="font-mono text-xs font-bold">
                    {index + 1}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {step.label}
                </span>
                {step.detail && !compact ? (
                  <span className="block truncate text-[0.72rem] text-muted-foreground">
                    {step.detail}
                  </span>
                ) : null}
              </span>
              {current ? (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 size-2.5 rounded-full bg-acc shadow-[0_0_0_3px_var(--card)]"
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-acc motion-reduce:hidden" />
                </span>
              ) : null}
            </motion.div>
            {index < steps.length - 1 ? (
              <>
                <span
                  aria-hidden="true"
                  className="mx-auto h-4 w-px bg-border sm:hidden"
                />
                <svg
                  aria-hidden="true"
                  className="hidden h-2 w-8 shrink-0 sm:block lg:w-10"
                  preserveAspectRatio="none"
                  viewBox="0 0 40 8"
                >
                  <line
                    stroke="var(--border)"
                    strokeWidth={1.5}
                    x1="0"
                    x2="40"
                    y1="4"
                    y2="4"
                  />
                  <line
                    className="beam-dash"
                    stroke="var(--acc)"
                    strokeDasharray="14 106"
                    strokeLinecap="round"
                    strokeWidth={2.5}
                    style={
                      { '--beam-delay': `${index * 0.35}s` } as CSSProperties
                    }
                    x1="0"
                    x2="40"
                    y1="4"
                    y2="4"
                  />
                </svg>
              </>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
