import { cn } from '@/lib/utils'

type TopicActivity = { topic: string; solved: number }

// The topics behind this month's solves, as simple labelled bars.
export function TopicMixCard({
  topics,
  className,
}: {
  topics: readonly TopicActivity[]
  className?: string
}) {
  const top = [...topics]
    .filter((topic) => topic.solved > 0)
    .sort((a, b) => b.solved - a.solved)
    .slice(0, 5)
  const max = top[0]?.solved ?? 0

  return (
    <section
      aria-labelledby="topic-mix-heading"
      className={cn(
        'flex min-h-72 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-5',
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
              <span className="h-2.5 overflow-hidden rounded-md bg-muted">
                <span
                  className={cn(
                    'block h-full rounded-md',
                    index === 0 ? 'bg-primary' : 'bg-primary/55',
                  )}
                  style={{ width: `${(topic.solved / max) * 100}%` }}
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
