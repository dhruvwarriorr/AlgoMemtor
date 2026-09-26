import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

const ease = [0.16, 1, 0.3, 1] as const

// Fades and lifts its content in once it scrolls into view.
export function Reveal({
  children,
  className,
  delay = 0,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  delay?: number
  as?: 'div' | 'section' | 'li'
}) {
  const reduceMotion = useReducedMotion()
  const Component =
    as === 'section' ? motion.section : as === 'li' ? motion.li : motion.div
  return (
    <Component
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      transition={{ duration: 0.6, ease, delay }}
      viewport={{ once: true, margin: '-40px' }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      {children}
    </Component>
  )
}
