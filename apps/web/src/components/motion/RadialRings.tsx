import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'

export type RadialRingDatum = {
  key: string
  label: string
  value: number
  color: string
}

const SIZE = 220
const CENTER = SIZE / 2
const BAR = 17
const GAP = 5

// Concentric radial bars, one ring per series, each on its own faint track
// with its label at the start of the bar, after the "radial chart" reference.
export function RadialRings({
  data,
  total,
  totalLabel,
  label,
  className,
}: {
  data: readonly RadialRingDatum[]
  total: number
  totalLabel: string
  label: string
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const idBase = `rings-${useId().replace(/[^\w-]/g, '')}`
  const max = Math.max(1, ...data.map((item) => item.value))
  const outer = CENTER - BAR / 2 - 2

  return (
    <svg
      aria-label={label}
      className={className}
      role="img"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
    >
      {data.map((item, index) => {
        const radius = outer - index * (BAR + GAP)
        if (radius < BAR * 2) return null
        const share = item.value / max
        return (
          <g key={item.key}>
            <circle
              cx={CENTER}
              cy={CENTER}
              fill="none"
              r={radius}
              stroke="var(--muted)"
              strokeWidth={BAR}
            />
            <motion.circle
              cx={CENTER}
              cy={CENTER}
              fill="none"
              initial={{ pathLength: reduceMotion ? share * 0.999 : 0 }}
              r={radius}
              stroke={item.color}
              strokeLinecap="round"
              strokeWidth={BAR}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
              transition={{
                duration: 1.3,
                delay: 0.15 + index * 0.12,
                ease: [0.16, 1, 0.3, 1],
              }}
              viewport={{ once: true }}
              whileInView={{ pathLength: Math.max(0.02, share * 0.999) }}
            />
            {/* The label runs clockwise along its own ring from the top. */}
            <path
              d={`M ${CENTER} ${CENTER - radius} A ${radius} ${radius} 0 1 1 ${CENTER - 0.01} ${CENTER - radius}`}
              fill="none"
              id={`${idBase}-${index}`}
            />
            <text
              dominantBaseline="central"
              // Light text on a long bar; dark text when the bar is too
              // short to hold the label and it sits on the track.
              fill={share >= 0.3 ? '#ffffff' : 'var(--card-foreground)'}
              fontSize="10"
              fontWeight="600"
            >
              <textPath href={`#${idBase}-${index}`} startOffset="6">
                {item.label}
              </textPath>
            </text>
          </g>
        )
      })}
      <text
        dominantBaseline="middle"
        fill="var(--foreground)"
        fontSize="26"
        fontWeight="700"
        textAnchor="middle"
        x={CENTER}
        y={CENTER - 4}
      >
        {total}
      </text>
      <text
        dominantBaseline="middle"
        fill="var(--muted-foreground)"
        fontSize="9"
        textAnchor="middle"
        x={CENTER}
        y={CENTER + 16}
      >
        {totalLabel}
      </text>
    </svg>
  )
}
