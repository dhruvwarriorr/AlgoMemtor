import { useId, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

export type SegmentOption<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
}

// Pill buttons where the selection glides between options.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: {
  options: readonly SegmentOption<T>[]
  value: T | null
  onChange: (value: T) => void
  label: string
  className?: string
  size?: 'sm' | 'md'
}) {
  const layoutId = useId()
  const reduceMotion = useReducedMotion()
  return (
    <div
      aria-label={label}
      className={cn(
        'inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-muted/60 p-1',
        className,
      )}
      role="group"
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            aria-pressed={selected}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-sm',
              selected
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {selected ? (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-lg border border-border bg-card shadow-soft"
                layoutId={reduceMotion ? undefined : layoutId}
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              />
            ) : null}
            <span className="relative inline-flex items-center gap-1.5">
              {option.icon}
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
