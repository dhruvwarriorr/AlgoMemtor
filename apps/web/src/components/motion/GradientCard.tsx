import type { CSSProperties, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import type { IconComponent } from '@/components/icons/algo-icons'
import { cn } from '@/lib/utils'

export type GradientTone = 'sky' | 'green' | 'sand' | 'ink'

const gradients: Record<GradientTone, string> = {
  sky: 'bg-linear-to-br from-[#e0f2fe] to-[#bae6fd]/55 text-[#0b0c0e] dark:from-[#0f2b3b] dark:to-[#0a1822] dark:text-[#f4f1ea]',
  green:
    'bg-linear-to-br from-[#dcfce7] to-[#bbf7d0]/55 text-[#0b0c0e] dark:from-[#0f2e1b] dark:to-[#0a1a11] dark:text-[#f4f1ea]',
  sand: 'bg-linear-to-br from-[#faf5ea] to-[#eadfc4]/70 text-[#0b0c0e] dark:from-[#262015] dark:to-[#15120c] dark:text-[#f4f1ea]',
  ink: 'bg-linear-to-br from-[#23262b] to-[#0b0c0e] text-[#f4f1ea]',
}

const decorationTone: Record<GradientTone, string> = {
  sky: 'text-[#0284c7] [--icon-node:#22c55e] dark:text-[#38bdf8]',
  green: 'text-[#16a34a] [--icon-node:#0ea5e9] dark:text-[#4ade80]',
  sand: 'text-[#8a7446] [--icon-node:#0ea5e9] dark:text-[#d6c49a]',
  ink: 'text-[#38bdf8] [--icon-node:#4ade80]',
}

const card = { rest: { scale: 1, y: 0 }, hover: { scale: 1.03, y: -4 } }
const decoration = {
  rest: { scale: 1, rotate: 0 },
  hover: { scale: 1.1, rotate: 3 },
}

// A soft gradient panel that lifts on hover while its oversized corner icon
// springs outward, after the "gradient card" reference.
export function GradientCard({
  tone,
  icon: Icon,
  className,
  style,
  children,
}: {
  tone: GradientTone
  icon?: IconComponent
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      animate="rest"
      className={cn(
        'relative isolate overflow-hidden rounded-xl shadow-soft transition-shadow duration-300 hover:shadow-lift',
        gradients[tone],
        className,
      )}
      initial="rest"
      style={style}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      variants={reduceMotion ? undefined : card}
      whileHover={reduceMotion ? undefined : 'hover'}
    >
      {Icon ? (
        <motion.span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute -right-5 -bottom-6 -z-10 opacity-20 dark:opacity-25',
            decorationTone[tone],
          )}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          variants={reduceMotion ? undefined : decoration}
        >
          <Icon className="size-28" />
        </motion.span>
      ) : null}
      {children}
    </motion.div>
  )
}
