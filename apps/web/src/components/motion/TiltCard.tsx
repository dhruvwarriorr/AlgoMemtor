import {
  useRef,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { motion, useReducedMotion, useSpring } from 'motion/react'

import { cn } from '@/lib/utils'

const spring = { stiffness: 220, damping: 22, mass: 0.6 }

// A card that leans toward the pointer in 3D and carries a soft spotlight
// under it. Touch and reduced-motion users get a still card.
export function TiltCard({
  children,
  className,
  max = 6,
  style,
}: {
  children: ReactNode
  className?: string
  max?: number
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const rotateX = useSpring(0, spring)
  const rotateY = useSpring(0, spring)
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const node = ref.current
    if (!node || event.pointerType !== 'mouse') return
    const rect = node.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    node.style.setProperty('--mx', `${x}px`)
    node.style.setProperty('--my', `${y}px`)
    node.style.setProperty('--spot', '1')
    if (reduceMotion) return
    rotateY.set((x / rect.width - 0.5) * max * 2)
    rotateX.set(-(y / rect.height - 0.5) * max * 2)
  }

  function onPointerLeave() {
    ref.current?.style.setProperty('--spot', '0')
    rotateX.set(0)
    rotateY.set(0)
  }

  return (
    <motion.div
      className={cn('spotlight', className)}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
      ref={ref}
      style={{ ...style, rotateX, rotateY, transformPerspective: 900 }}
    >
      {children}
    </motion.div>
  )
}
