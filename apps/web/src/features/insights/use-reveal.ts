import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'

const canObserve = typeof IntersectionObserver !== 'undefined'

// Starts a chart's entry animation once it scrolls into view. With reduced
// motion the chart is shown at once.
//
// The ref is a callback so a chart that first renders its empty state and
// mounts the animated element later (for example after a provider filter
// change) still gets observed; a ref object read once on mount would miss it
// and leave the chart stuck at its initial, zero-size frame.
export function useReveal<T extends Element>() {
  const [element, setElement] = useState<T | null>(null)
  const [inView, setInView] = useState(false)
  const reduceMotion = useReducedMotion() ?? false

  useEffect(() => {
    if (element === null || inView || !canObserve) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '-60px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, inView])

  return {
    ref: setElement,
    shown: inView || reduceMotion || !canObserve,
    reduceMotion,
  }
}
