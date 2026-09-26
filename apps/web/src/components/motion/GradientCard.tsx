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

// Line art and its lit node, the glow behind it, and the dot grid, per tone.
const decorationTone: Record<GradientTone, string> = {
  sky: 'text-[#0284c7] [--icon-node:#22c55e] dark:text-[#38bdf8]',
  green: 'text-[#16a34a] [--icon-node:#0ea5e9] dark:text-[#4ade80]',
  sand: 'text-[#8a7446] [--icon-node:#f97316] dark:text-[#e3cf9f]',
  ink: 'text-[#38bdf8] [--icon-node:#4ade80]',
}

const glowTone: Record<GradientTone, string> = {
  sky: '[--card-glow:rgb(14_165_233/0.28)] dark:[--card-glow:rgb(56_189_248/0.22)]',
  green:
    '[--card-glow:rgb(34_197_94/0.26)] dark:[--card-glow:rgb(74_222_128/0.2)]',
  sand: '[--card-glow:rgb(217_164_65/0.3)] dark:[--card-glow:rgb(227_207_159/0.16)]',
  ink: '[--card-glow:rgb(56_189_248/0.22)]',
}

const card = { rest: { scale: 1, y: 0 }, hover: { scale: 1.03, y: -4 } }
const decoration = {
  rest: { scale: 1, rotate: 0 },
  hover: { scale: 1.1, rotate: 3 },
}

// A soft gradient panel with a glow and dot grid in its corner. Its line-art
// icon traces itself in on arrival; on hover the card lifts, the icon springs
// outward and replays its motion (see `.mi-host` in index.css).
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
        'mi-host relative isolate overflow-hidden rounded-xl shadow-soft transition-shadow duration-300 hover:shadow-lift',
        gradients[tone],
        glowTone[tone],
        className,
      )}
      initial="rest"
      style={style}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      variants={reduceMotion ? undefined : card}
      whileHover={reduceMotion ? undefined : 'hover'}
    >
      {/* A soft glow pooled in the corner, and a dot grid fading out of it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_88%_92%,var(--card-glow),transparent_62%)]"
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(currentColor_1px,transparent_1.3px)] bg-size-[13px_13px] opacity-[0.16] [mask-image:radial-gradient(circle_at_100%_100%,black,transparent_58%)] dark:opacity-[0.14]',
          decorationTone[tone],
        )}
      />
      {Icon ? (
        <motion.span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute -right-1 -bottom-5 -z-10 opacity-40 dark:opacity-45',
            decorationTone[tone],
          )}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          variants={reduceMotion ? undefined : decoration}
        >
          <Icon className="mi-intro size-28" strokeWidth={1.2} />
        </motion.span>
      ) : null}
      {children}
    </motion.div>
  )
}
