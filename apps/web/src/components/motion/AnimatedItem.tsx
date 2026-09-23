import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

// A list row that springs in from above, staggered by its index, the way
// notifications land in a feed.
export function AnimatedItem({
  index,
  className,
  children,
}: {
  index: number
  className?: string
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.li
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: -14, scale: 0.97 }}
      layout={!reduceMotion}
      transition={{
        type: 'spring',
        stiffness: 320,
        damping: 28,
        delay: reduceMotion ? 0 : 0.15 + index * 0.08,
      }}
    >
      {children}
    </motion.li>
  )
}
