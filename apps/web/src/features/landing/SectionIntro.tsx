import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

import { landingEase as ease } from './landing-motion'

// A section's numbered eyebrow, heading and lede, rising in as it scrolls
// into view.
export function SectionIntro({
  index,
  eyebrow,
  title,
  children,
  align = 'left',
  className,
}: {
  index: string
  eyebrow: string
  title: ReactNode
  children?: ReactNode
  align?: 'left' | 'center'
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const rise = (delay: number) => ({
    initial: reduceMotion ? false : ({ opacity: 0, y: 24 } as const),
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-80px' },
    transition: { duration: 0.8, ease, delay },
  })
  return (
    <div
      className={cn(
        'flex max-w-3xl flex-col gap-4',
        align === 'center' && 'mx-auto items-center text-center',
        className,
      )}
    >
      <motion.p
        {...rise(0)}
        className="flex items-center gap-3 font-mono text-xs tracking-[0.28em] text-[#7dd3fc] uppercase"
      >
        <span className="text-white/35">{index}</span>
        <span aria-hidden="true" className="h-px w-8 bg-[#7dd3fc]/50" />
        {eyebrow}
      </motion.p>
      <motion.h2
        {...rise(0.08)}
        className="font-heading text-[2.3rem] leading-[1.02] font-bold tracking-[-0.025em] text-[#f4f1ea] sm:text-5xl lg:text-[3.6rem]"
      >
        {title}
      </motion.h2>
      {children ? (
        <motion.p
          {...rise(0.16)}
          className="max-w-2xl text-base leading-7 text-white/55 sm:text-lg"
        >
          {children}
        </motion.p>
      ) : null}
    </div>
  )
}
