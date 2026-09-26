import { useEffect, useState } from 'react'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'

import { SpotlightCard } from '@/components/kit/surfaces'
import {
  dashEase as ease,
  titleCase,
} from '@/features/dashboard/dashboard-format'
import { cn } from '@/lib/utils'

type TopicActivity = { topic: string; solved: number; attempted?: number }

const C = 150
const INNER = 30
const OUTER = 104
const petalColors = [
  '#38bdf8',
  '#4ade80',
  '#a78bfa',
  '#fbbf24',
  '#f472b6',
  '#2dd4bf',
  '#60a5fa',
  '#fb923c',
]

function polar(radius: number, degrees: number) {
  const angle = (degrees * Math.PI) / 180
  return { x: C + Math.cos(angle) * radius, y: C + Math.sin(angle) * radius }
}

function wedge(inner: number, outer: number, from: number, to: number) {
  const large = to - from > 180 ? 1 : 0
  const a = polar(inner, from)
  const b = polar(outer, from)
  const c = polar(outer, to)
  const d = polar(inner, to)
  return `M ${a.x} ${a.y} L ${b.x} ${b.y} A ${outer} ${outer} 0 ${large} 1 ${c.x} ${c.y} L ${d.x} ${d.y} A ${inner} ${inner} 0 ${large} 0 ${a.x} ${a.y} Z`
}

// A petal that grows out from the centre to its radius, and eases to a new
// radius when hovered.
function Petal({
  radius,
  from,
  to,
  color,
  delay,
  dimmed,
  onEnter,
}: {
  radius: number
  from: number
  to: number
  color: string
  delay: number
  dimmed: boolean
  onEnter: () => void
}) {
  const reduceMotion = useReducedMotion()
  const grown = useMotionValue(reduceMotion ? radius : INNER + 0.5)
  const d = useTransform(grown, (value) => wedge(INNER, value, from, to))
  useEffect(() => {
    // Still at the centre: this is the first bloom, staggered and bouncy.
    const fresh = grown.get() < INNER + 1
    const controls = animate(
      grown,
      radius,
      fresh
        ? { type: 'spring', stiffness: 90, damping: 12, delay }
        : { type: 'spring', stiffness: 260, damping: 20 },
    )
    return () => controls.stop()
  }, [delay, grown, radius])
  return (
    <motion.path
      animate={{ opacity: dimmed ? 0.3 : 1 }}
      d={d}
      fill={color}
      fillOpacity="0.9"
      onMouseEnter={onEnter}
      stroke="var(--card)"
      strokeWidth="1.5"
      transition={{ duration: 0.2 }}
    />
  )
}

// This month's topics as a rose: each petal's fill is solves and its dashed
// outline is every problem tried in that topic.
export function TopicMixCard({
  topics,
  className,
}: {
  topics: readonly TopicActivity[]
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const [active, setActive] = useState<string | null>(null)
  const top = [...topics]
    .filter((topic) => topic.solved > 0 || (topic.attempted ?? 0) > 0)
    .sort(
      (left, right) =>
        right.solved - left.solved ||
        (right.attempted ?? 0) - (left.attempted ?? 0),
    )
    .slice(0, 8)
  const scale = Math.max(
    1,
    ...top.map((topic) => Math.max(topic.solved, topic.attempted ?? 0)),
  )
  const radiusFor = (value: number) =>
    INNER + (OUTER - INNER) * Math.sqrt(Math.max(0, value) / scale)
  const span = 360 / Math.max(1, top.length)
  const gap = top.length > 1 ? 3 : 0
  const totalSolved = top.reduce((sum, topic) => sum + topic.solved, 0)
  const focus = top.find((topic) => topic.topic === active)
  const summary = top
    .map((topic) => `${topic.topic}: ${topic.solved}`)
    .join(', ')

  return (
    <SpotlightCard
      aria-labelledby="topic-mix-heading"
      as="section"
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-soft',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="font-sans text-sm font-medium text-muted-foreground"
          id="topic-mix-heading"
        >
          Topic bloom
        </h2>
        <span className="text-xs text-muted-foreground">Last 30 days</span>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center py-2">
        <svg
          aria-label={
            top.length === 0
              ? 'No topic-tagged solves in the last 30 days'
              : `Solves by topic in the last 30 days. ${summary}`
          }
          className="w-full max-w-[26rem] overflow-visible"
          onMouseLeave={() => setActive(null)}
          role="img"
          viewBox="-48 -4 396 308"
        >
          <g
            className={reduceMotion ? undefined : 'memory-orbit'}
            style={{
              transformOrigin: `${C}px ${C}px`,
              animationDuration: '60s',
            }}
          >
            <circle
              cx={C}
              cy={C}
              fill="none"
              r={OUTER + 8}
              stroke="var(--muted-foreground)"
              strokeDasharray="1 6"
              strokeOpacity="0.45"
            />
          </g>
          {[0.5, 1].map((level) => (
            <circle
              cx={C}
              cy={C}
              fill="none"
              key={level}
              r={INNER + (OUTER - INNER) * level}
              stroke="var(--border)"
            />
          ))}
          {top.length === 0
            ? Array.from({ length: 8 }, (_, index) => (
                <path
                  d={wedge(
                    INNER,
                    INNER + 30 + (index % 3) * 18,
                    -90 + index * 45 + 2,
                    -90 + (index + 1) * 45 - 2,
                  )}
                  fill="var(--muted-foreground)"
                  fillOpacity="0.1"
                  key={index}
                />
              ))
            : null}
          {top.map((topic, index) => {
            const from = -90 + index * span + gap / 2
            const to = -90 + (index + 1) * span - gap / 2
            const color = petalColors[index % petalColors.length] ?? '#38bdf8'
            const tried = topic.attempted ?? topic.solved
            const middle = (from + to) / 2
            const label = polar(OUTER + 24, middle)
            const cos = Math.cos((middle * Math.PI) / 180)
            return (
              <g key={topic.topic}>
                {tried > topic.solved ? (
                  <motion.path
                    animate={{
                      opacity:
                        active === null || active === topic.topic ? 0.8 : 0.2,
                    }}
                    d={wedge(INNER, radiusFor(tried), from, to)}
                    fill="none"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    stroke={color}
                    strokeDasharray="3 3"
                    strokeWidth="1.3"
                    transition={{
                      duration: 0.4,
                      delay: active === null ? 0.9 + index * 0.08 : 0,
                    }}
                  />
                ) : null}
                <Petal
                  color={color}
                  delay={0.2 + index * 0.09}
                  dimmed={active !== null && active !== topic.topic}
                  from={from}
                  onEnter={() => setActive(topic.topic)}
                  radius={
                    radiusFor(topic.solved) *
                    (active === topic.topic ? 1.06 : 1)
                  }
                  to={to}
                />
                <motion.text
                  animate={{
                    opacity:
                      active === null || active === topic.topic ? 1 : 0.35,
                  }}
                  fill="var(--muted-foreground)"
                  fontSize="10.5"
                  initial={reduceMotion ? false : { opacity: 0 }}
                  textAnchor={
                    cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'
                  }
                  transition={{
                    duration: 0.3,
                    delay: active === null ? 0.8 + index * 0.08 : 0,
                  }}
                  x={label.x}
                  y={label.y + 3}
                >
                  {titleCase(topic.topic).length > 12
                    ? `${titleCase(topic.topic).slice(0, 11)}…`
                    : titleCase(topic.topic)}{' '}
                  <tspan fill="var(--foreground)" fontWeight="700">
                    {topic.solved}
                  </tspan>
                </motion.text>
              </g>
            )
          })}
          <circle cx={C} cy={C} fill="var(--card)" r={INNER - 2} />
          <text
            fill="var(--foreground)"
            fontSize={focus === undefined ? 20 : 17}
            fontWeight="800"
            textAnchor="middle"
            x={C}
            y={C + 2}
          >
            {focus === undefined ? totalSolved : focus.solved}
          </text>
          <text
            fill="var(--muted-foreground)"
            fontSize="7.5"
            textAnchor="middle"
            x={C}
            y={C + 13}
          >
            {focus === undefined
              ? 'solves'
              : `of ${focus.attempted ?? focus.solved} tried`}
          </text>
        </svg>
        {top.length === 0 ? (
          <p className="absolute inset-x-0 bottom-2 text-center text-sm text-muted-foreground">
            No topic-tagged solves in the last 30 days.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#38bdf8]" />
            Solved
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border border-dashed border-[#38bdf8]" />
            Tried
          </span>
        </span>
        <motion.span
          animate={{ opacity: 1 }}
          initial={reduceMotion ? false : { opacity: 0 }}
          key={focus?.topic ?? 'all'}
          transition={{ duration: 0.25, ease }}
        >
          {focus === undefined
            ? 'Hover a petal'
            : `${titleCase(focus.topic)} · ${Math.round((focus.solved / Math.max(1, focus.attempted ?? focus.solved)) * 100)}% solved`}
        </motion.span>
      </div>
    </SpotlightCard>
  )
}
