import { useId, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { ProviderKey } from '@algomemtor/shared-contracts'

import { ArrowUpRight } from '@/components/icons/algo-icons'
import { Panel } from '@/components/kit/Panel'
import { languageChoices, providerLabels } from '@/features/mentor/format'
import { cn } from '@/lib/utils'

// A provider-attributed outbound link. Opening it is navigation only.
export function ProviderProblemLink({
  href,
  title,
  provider,
  className,
}: {
  href: string
  title: string
  provider: ProviderKey | 'other'
  className?: string
}) {
  return (
    <a
      className={cn(
        'inline-flex max-w-full items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="truncate">{title}</span>
      <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="sr-only">(opens on {providerLabels[provider]})</span>
    </a>
  )
}

export function ProviderBadge({
  provider,
}: {
  provider: ProviderKey | 'other'
}) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 text-[0.7rem] font-medium text-secondary-foreground">
      {providerLabels[provider]}
    </span>
  )
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'neutral' | 'positive' | 'warning'
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-1.5 text-2xl font-semibold tracking-tight tabular-nums',
          tone === 'positive'
            ? 'text-go-foreground'
            : tone === 'warning'
              ? 'text-sun-foreground'
              : 'text-foreground',
        )}
      >
        {value}
      </dd>
      {hint ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <Panel
      action={action}
      className={className}
      description={description}
      title={title}
      {...(id === undefined ? {} : { headingId: id })}
    >
      {children}
    </Panel>
  )
}

export function LanguagePicker({
  value,
  onChange,
  idPrefix,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  idPrefix: string
  disabled?: boolean
}) {
  const isPreset = (languageChoices as readonly string[]).includes(value)
  const [custom, setCustom] = useState(!isPreset)
  const layoutId = useId()
  const reduceMotion = useReducedMotion()
  const options = [
    ...languageChoices.map((choice) => ({
      key: choice,
      label: choice,
      selected: !custom && value === choice,
      onSelect: () => {
        setCustom(false)
        onChange(choice)
      },
    })),
    {
      key: 'other',
      label: 'Other',
      selected: custom,
      onSelect: () => {
        setCustom(true)
        if (isPreset) onChange('')
      },
    },
  ]
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="text-sm font-medium text-foreground">Language</legend>
      <div className="mt-2 inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-muted/60 p-1">
        {options.map((option) => (
          <button
            aria-pressed={option.selected}
            className={cn(
              'relative h-8 rounded-lg px-3.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              option.selected
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            key={option.key}
            onClick={option.onSelect}
            type="button"
          >
            {option.selected ? (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-lg border border-border bg-card shadow-soft"
                layoutId={reduceMotion ? undefined : layoutId}
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        ))}
      </div>
      {custom ? (
        <div className="mt-2">
          <label className="sr-only" htmlFor={`${idPrefix}-language-other`}>
            Other language
          </label>
          <input
            className="h-10 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
            id={`${idPrefix}-language-other`}
            maxLength={64}
            onChange={(event) => onChange(event.target.value)}
            placeholder="e.g. Rust, Go, Kotlin"
            value={value}
          />
        </div>
      ) : null}
    </fieldset>
  )
}
