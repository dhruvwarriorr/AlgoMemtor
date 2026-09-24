import {
  Children,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

export type AnimatedListProps = ComponentPropsWithoutRef<'div'> & {
  children: ReactNode
  delay?: number
}

// The registry example stages a fixed demo list. Notifications arrive and
// disappear independently, so render every current item and animate by key.
export function AnimatedList({
  children,
  className,
  delay = 60,
  ...props
}: AnimatedListProps) {
  const reducedMotion = useReducedMotion()
  const items = Children.toArray(children)

  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }
            }
            initial={reducedMotion ? false : { opacity: 0, scale: 0.97, y: 12 }}
            key={isValidElement(item) ? item.key : index}
            layout={!reducedMotion}
            transition={
              reducedMotion
                ? { duration: 0 }
                : {
                    type: 'spring',
                    stiffness: 420,
                    damping: 32,
                    delay: (index * delay) / 1_000,
                  }
            }
          >
            {item}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
