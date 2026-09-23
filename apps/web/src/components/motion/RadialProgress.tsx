import { useId, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

// A ring that sweeps to `value` (0–1) in the sky-to-green brand gradient.
export function RadialProgress({
  value,
  className,
  thickness = 9,
  children,
  track = 'var(--muted)',
}: {
  value: number
  className?: string
  thickness?: number
  children?: ReactNode
  track?: string
}) {
  // SVG url() references need a plain id.
  const gradientId = `g${useId().replace(/[^\w-]/g, '')}`
  const reduceMotion = useReducedMotion()
  const clamped = Math.min(1, Math.max(0, value))
  const radius = 50 - thickness / 2 - 1

  return (
    <div className={cn('relative grid place-items-center', className)}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full -rotate-90"
        viewBox="0 0 100 100"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-a)" />
            <stop offset="100%" stopColor="var(--brand-b)" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          fill="none"
          r={radius}
          stroke={track}
          strokeWidth={thickness}
        />
        <motion.circle
          cx="50"
          cy="50"
          fill="none"
          initial={{ pathLength: reduceMotion ? clamped : 0 }}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
          strokeWidth={thickness}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          viewport={{ once: true }}
          whileInView={{ pathLength: clamped }}
        />
      </svg>
      <div className="relative">{children}</div>
    </div>
  )
}
