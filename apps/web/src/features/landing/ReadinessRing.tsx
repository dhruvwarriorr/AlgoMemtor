import { useEffect, useId, useRef } from 'react'
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react'

// Spring-driven score ring that fills when it scrolls into view.
export function ReadinessRing({
  value,
  label,
  size = 'lg',
}: {
  value: number
  label: string
  size?: 'md' | 'lg'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const reduceMotion = useReducedMotion()
  const gradientId = useId()
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const progress = useMotionValue(reduceMotion ? value : 0)
  const spring = useSpring(progress, { stiffness: 60, damping: 20 })
  const offset = useTransform(
    spring,
    (v) => circumference - (v / 100) * circumference,
  )
  const shown = useTransform(spring, (v) => `${Math.round(v)}%`)

  useEffect(() => {
    if (inView) progress.set(value)
  }, [inView, progress, value])

  return (
    <div
      className={size === 'lg' ? 'relative size-44' : 'relative size-36'}
      ref={ref}
    >
      <svg className="size-full -rotate-90" viewBox="0 0 160 160">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffb27d" />
            <stop offset="100%" stopColor="#ff4d12" />
          </linearGradient>
        </defs>
        <circle
          className="stroke-white/10"
          cx="80"
          cy="80"
          fill="none"
          r={radius}
          strokeWidth="12"
        />
        <motion.circle
          cx="80"
          cy="80"
          fill="none"
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeLinecap="round"
          strokeWidth="12"
          style={{ strokeDashoffset: offset }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <motion.span className="block font-heading text-4xl font-bold tracking-[-0.04em] text-brand-gradient">
            {shown}
          </motion.span>
          <span className="mt-1 block text-xs text-white/55">{label}</span>
        </div>
      </div>
    </div>
  )
}
