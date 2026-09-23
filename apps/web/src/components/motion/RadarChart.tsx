import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

export type RadarAxis = { label: string; value: number; detail?: string }

const SIZE = 240
const CENTER = SIZE / 2
const RADIUS = 78

function point(index: number, count: number, scale: number) {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2
  return [
    CENTER + Math.cos(angle) * RADIUS * scale,
    CENTER + Math.sin(angle) * RADIUS * scale,
  ] as const
}

// Strength across a handful of axes (values 0–1). The shape unfolds from
// the centre the first time it is seen.
export function RadarChart({
  axes,
  className,
  label,
}: {
  axes: readonly RadarAxis[]
  className?: string
  label: string
}) {
  // SVG url() references need a plain id.
  const gradientId = `g${useId().replace(/[^\w-]/g, '')}`
  const reduceMotion = useReducedMotion()
  const count = axes.length
  const shape = axes
    .map((axis, index) =>
      point(index, count, Math.max(0.06, Math.min(1, axis.value))).join(','),
    )
    .join(' ')

  return (
    <svg
      aria-label={label}
      className={cn('overflow-visible', className)}
      role="img"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-a)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--brand-b)" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          fill="none"
          key={ring}
          points={axes
            .map((_, index) => point(index, count, ring).join(','))
            .join(' ')}
          stroke="currentColor"
          strokeOpacity={ring === 1 ? 0.22 : 0.1}
        />
      ))}
      {axes.map((axis, index) => {
        const [x, y] = point(index, count, 1)
        return (
          <line
            key={axis.label}
            stroke="currentColor"
            strokeOpacity="0.1"
            x1={CENTER}
            x2={x}
            y1={CENTER}
            y2={y}
          />
        )
      })}
      <motion.g
        initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
        style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
        transition={{ duration: 1.2, ease: [0.34, 1.3, 0.64, 1] }}
        viewport={{ once: true }}
        whileInView={{ scale: 1, opacity: 1 }}
      >
        <polygon
          fill={`url(#${gradientId})`}
          points={shape}
          stroke="var(--brand-a)"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        {axes.map((axis, index) => {
          const [x, y] = point(
            index,
            count,
            Math.max(0.06, Math.min(1, axis.value)),
          )
          return (
            <circle
              cx={x}
              cy={y}
              fill="var(--card)"
              key={axis.label}
              r="3.5"
              stroke="var(--brand-b)"
              strokeWidth="2"
            />
          )
        })}
      </motion.g>
      {axes.map((axis, index) => {
        const [x, y] = point(index, count, 1.24)
        const anchor =
          Math.abs(x - CENTER) < 8 ? 'middle' : x > CENTER ? 'start' : 'end'
        return (
          <text
            dominantBaseline="middle"
            fill="currentColor"
            fontSize="11"
            key={axis.label}
            textAnchor={anchor}
            x={x}
            y={y}
          >
            <tspan fillOpacity="0.75">{axis.label}</tspan>
            {axis.detail ? (
              <tspan dx="4" fontWeight="600">
                {axis.detail}
              </tspan>
            ) : null}
          </text>
        )
      })}
    </svg>
  )
}
