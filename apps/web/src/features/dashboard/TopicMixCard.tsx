import { motion, useReducedMotion } from 'motion/react'

import { RadarChart } from '@/components/motion/RadarChart'
import { cn } from '@/lib/utils'

type TopicActivity = { topic: string; solved: number }

function shortLabel(topic: string) {
  return topic.length > 12 ? `${topic.slice(0, 11)}…` : topic
}

// The topics behind this month's solves: a radar once there are enough
// topics to give it a shape, labelled bars otherwise.
export function TopicMixCard({
  topics,
  className,
}: {
  topics: readonly TopicActivity[]
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const top = [...topics]
    .filter((topic) => topic.solved > 0)
    .sort((a, b) => b.solved - a.solved)
    .slice(0, 6)
  const max = top[0]?.solved ?? 0
  const summary = top
    .map((topic) => `${topic.topic}: ${topic.solved}`)
    .join(', ')

  return (
    <section
      aria-labelledby="topic-mix-heading"
      className={cn(
        'flex min-h-72 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-5 transition-[box-shadow,border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[color-mix(in_oklab,var(--primary)_28%,var(--border))] hover:shadow-lift',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="font-sans text-sm font-medium text-muted-foreground"
          id="topic-mix-heading"
        >
          Topic mix
        </h2>
        <span className="text-xs text-muted-foreground">Last 30 days</span>
      </div>
      {top.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No topic-tagged solves in the last 30 days.
        </p>
      ) : top.length >= 3 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-2 text-foreground">
          <RadarChart
            axes={top.map((topic) => ({
              label: shortLabel(topic.topic),
              value: topic.solved / max,
              detail: String(topic.solved),
            }))}
            className="max-h-full w-full max-w-[15rem]"
            label={`Solves by topic in the last 30 days. ${summary}`}
          />
        </div>
      ) : (
        <ul className="mt-4 flex min-h-0 flex-1 flex-col justify-around gap-2">
          {top.map((topic, index) => (
            <li
              className="grid min-w-0 grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3"
              key={topic.topic}
            >
              <span className="truncate text-[0.95rem] font-medium text-foreground">
                {topic.topic}
              </span>
              <span className="h-2.5 overflow-hidden rounded-[3px] bg-muted">
                <motion.span
                  className={cn(
                    'block h-full origin-left rounded-[3px]',
                    index === 0
                      ? 'bg-linear-to-r from-brand-a to-brand-b'
                      : 'bg-primary/55',
                  )}
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  style={{ width: `${(topic.solved / max) * 100}%` }}
                  transition={{
                    duration: 1.1,
                    delay: 0.2 + index * 0.1,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                />
              </span>
              <span className="w-7 text-right font-heading text-lg font-semibold text-foreground">
                {topic.solved}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
