import type { ReactNode } from 'react'
import type { ContestParticipationMode } from '@algomemtor/shared-contracts'

import type { IconComponent } from '@/components/icons/algo-icons'
import { Panel } from '@/components/kit/Panel'
import {
  GradientCard,
  type GradientTone,
} from '@/components/motion/GradientCard'
import { participationLabels } from '@/features/mentor/chart-theme'
import { cn } from '@/lib/utils'

// Building blocks for the mentor tools, in the visual language of the
// Progress, Dashboard and Insights pages.

export function KpiTile({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'plain',
  className,
}: {
  label: string
  value: ReactNode
  detail?: string
  icon?: IconComponent
  tone?: 'plain' | 'accent' | GradientTone
  className?: string
}) {
  const body = (
    <>
      <dt
        className={cn(
          'flex items-center gap-2 text-sm font-medium',
          tone === 'accent'
            ? 'text-white/85'
            : tone === 'plain'
              ? 'text-muted-foreground'
              : 'opacity-75',
        )}
      >
        {Icon !== undefined && (tone === 'plain' || tone === 'accent') ? (
          <span
            aria-hidden="true"
            className={cn(
              'grid size-8 place-items-center rounded-lg',
              tone === 'accent'
                ? 'bg-white/20'
                : 'bg-accent text-accent-foreground',
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
        {label}
      </dt>
      <dd className="mt-3 truncate font-heading text-[1.9rem] leading-none font-bold tracking-[-0.01em] tabular-nums">
        {value}
      </dd>
      {detail ? (
        <p
          className={cn(
            'mt-1.5 truncate text-xs',
            tone === 'accent'
              ? 'text-white/80'
              : tone === 'plain'
                ? 'text-muted-foreground'
                : 'opacity-70',
          )}
        >
          {detail}
        </p>
      ) : null}
    </>
  )
  if (tone !== 'plain' && tone !== 'accent') {
    return (
      <GradientCard
        className={cn('animate-rise min-w-0 p-4', className)}
        {...(Icon === undefined ? {} : { icon: Icon })}
        tone={tone}
      >
        {body}
      </GradientCard>
    )
  }
  return (
    <div
      className={cn(
        'animate-rise min-w-0 rounded-xl p-4',
        tone === 'accent'
          ? 'mesh-card text-white'
          : 'border border-border bg-card',
        className,
      )}
    >
      {body}
    </div>
  )
}

export function ChartCard({
  title,
  description,
  className,
  action,
  children,
}: {
  title: string
  description?: string
  className?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Panel
      action={action}
      className={className}
      description={description}
      title={title}
    >
      {children}
    </Panel>
  )
}

export function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="grid flex-1 place-items-center rounded-xl border border-dashed border-border bg-[repeating-linear-gradient(135deg,transparent_0_10px,color-mix(in_oklab,var(--foreground)_3%,transparent)_10px_11px)] p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

export function ParticipationBadge({
  mode,
}: {
  mode: ContestParticipationMode | undefined
}) {
  if (mode === undefined) return null
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.7rem] font-medium',
        mode === 'rated'
          ? 'bg-go-soft text-go-foreground'
          : mode === 'unrated'
            ? 'bg-primary/10 text-primary'
            : 'bg-sun-soft text-sun-foreground',
      )}
    >
      {participationLabels[mode]}
    </span>
  )
}

export function SignedDelta({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  const rounded = Math.round(value)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        rounded >= 0
          ? 'bg-go-soft text-go-foreground'
          : 'bg-danger-soft text-danger-foreground',
      )}
    >
      {rounded > 0 ? '+' : ''}
      {rounded}
    </span>
  )
}
