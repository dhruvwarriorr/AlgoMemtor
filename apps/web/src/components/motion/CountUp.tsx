import { useEffect, useRef } from 'react'
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'

const numberFormat = new Intl.NumberFormat()

// A number that counts up from its previous value once it scrolls into view.
export function CountUp({
  value,
  className,
  duration = 1.4,
}: {
  value: number
  className?: string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduceMotion = useReducedMotion()
  const current = useMotionValue(reduceMotion ? value : 0)
  const display = useTransform(current, (latest) =>
    numberFormat.format(Math.round(latest)),
  )

  useEffect(() => {
    if (reduceMotion) {
      current.set(value)
      return
    }
    if (!inView) return
    const controls = animate(current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    })
    return () => controls.stop()
  }, [current, duration, inView, reduceMotion, value])

  return (
    <>
      <motion.span aria-hidden="true" className={className} ref={ref}>
        {display}
      </motion.span>
      <span className="sr-only">{numberFormat.format(value)}</span>
    </>
  )
}
