import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'motion/react'

// A step counter for looping demos: it advances every `ms` while the demo is
// on screen, and rests on `restStep` when motion is reduced.
export function useLoopStep<T extends Element>(
  count: number,
  ms: number,
  restStep = count - 1,
) {
  const ref = useRef<T>(null)
  const inView = useInView(ref, { margin: '-40px' })
  const reduceMotion = useReducedMotion() ?? false
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (reduceMotion || !inView) return
    const timer = window.setInterval(
      () => setStep((value) => (value + 1) % count),
      ms,
    )
    return () => window.clearInterval(timer)
  }, [count, inView, ms, reduceMotion])
  return { ref, step: reduceMotion ? restStep : step, inView, reduceMotion }
}
