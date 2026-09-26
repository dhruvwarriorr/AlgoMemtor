import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

import type { IconComponent } from '@/components/icons/algo-icons'
import { cn } from '@/lib/utils'

/*
 * Stat cards, one family per page so no two pages repeat the same tile:
 * capsules (Doubt Helper) and the streak hero tile (Progress Report).
 */

export type Stat = {
  label: string
  value: ReactNode
  hint?: string
  icon?: IconComponent
  // Any CSS colour; defaults to the page accent.
  color?: string
  trend?: readonly number[]
}

const ease = [0.16, 1, 0.3, 1] as const

function useEnter(index: number) {
  const reduceMotion = useReducedMotion()
  return {
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease, delay: 0.06 * index },
  } as const
}

// ---------------------------------------------------------------------------
// Capsules: a row of rounded pills, a gradient icon disc, value then label.

export function CapsuleStats({
  items,
  className,
}: {
  items: readonly Stat[]
  className?: string
}) {
  return (
    <dl className={cn('flex min-w-0 flex-wrap gap-2.5', className)}>
      {items.map((item, index) => (
        <CapsuleStat index={index} item={item} key={item.label} />
      ))}
    </dl>
  )
}

function CapsuleStat({ item, index }: { item: Stat; index: number }) {
  const enter = useEnter(index)
  const color = item.color ?? 'var(--acc)'
  const Icon = item.icon
  return (
    <motion.div
      {...enter}
      className="group flex min-w-0 items-center gap-3 rounded-full border border-border bg-card py-1.5 pr-5 pl-1.5 shadow-soft transition-transform duration-300 hover:-translate-y-0.5"
      title={item.hint}
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full text-white transition-transform duration-500 group-hover:rotate-12 [--icon-node:#fff]"
        style={{
          background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 55%, #000))`,
        }}
      >
        {Icon ? <Icon className="size-4.5" /> : null}
      </span>
      <dd className="font-heading text-xl leading-none font-bold text-foreground tabular-nums">
        {item.value}
      </dd>
      <dt className="text-xs leading-4 text-muted-foreground">
        {item.label}
        {item.hint ? <span className="sr-only">: {item.hint}</span> : null}
      </dt>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Hero stat: one tall dark tile washed in the stat's colour (Progress Report
// streak).

export function HeroStat({
  item,
  className,
}: {
  item: Stat
  className?: string
}) {
  const enter = useEnter(0)
  const color = item.color ?? 'var(--acc)'
  const Icon = item.icon
  return (
    <motion.dl
      {...enter}
      className={cn(
        'relative isolate flex min-h-44 flex-col overflow-hidden rounded-3xl p-5 text-white',
        className,
      )}
      style={{
        background: `radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, ${color} 80%, transparent), transparent 60%), linear-gradient(160deg, color-mix(in oklab, ${color} 45%, #0b0c0e), #0b0c0e)`,
      }}
    >
      <dt className="flex items-center gap-2 text-sm font-medium text-white/80">
        {Icon ? (
          <Icon aria-hidden="true" className="size-4 [--icon-node:#fff]" />
        ) : null}
        {item.label}
      </dt>
      <dd className="mt-auto font-heading text-6xl leading-none font-bold tracking-[-0.03em] tabular-nums">
        {item.value}
      </dd>
      {item.hint ? (
        <dd className="mt-2 text-xs text-white/70">{item.hint}</dd>
      ) : null}
    </motion.dl>
  )
}
