import { useRef } from 'react'
import { useInView, useReducedMotion } from 'motion/react'

// Starts a chart's entry animation once it scrolls into view. With reduced
// motion the chart is shown at once.
export function useReveal<T extends Element>() {
  const ref = useRef<T>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const reduceMotion = useReducedMotion() ?? false
  return { ref, shown: inView || reduceMotion, reduceMotion }
}
