import { useState, type ReactNode } from 'react'
import type { ProviderKey } from '@algomemtor/shared-contracts'

import { ArrowUpRight } from '@/components/icons/algo-icons'
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
    <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-[0.7rem] font-medium text-secondary-foreground">
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
    <section
      aria-labelledby={id}
      className={cn(
        'min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="text-base font-semibold text-foreground sm:text-lg"
            id={id}
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
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
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="text-sm font-medium text-foreground">Language</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {languageChoices.map((choice) => (
          <button
            aria-pressed={!custom && value === choice}
            className={cn(
              'h-9 rounded-md border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              !custom && value === choice
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-foreground/75 hover:bg-secondary',
            )}
            key={choice}
            onClick={() => {
              setCustom(false)
              onChange(choice)
            }}
            type="button"
          >
            {choice}
          </button>
        ))}
        <button
          aria-pressed={custom}
          className={cn(
            'h-9 rounded-md border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            custom
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-foreground/75 hover:bg-secondary',
          )}
          onClick={() => {
            setCustom(true)
            if (isPreset) onChange('')
          }}
          type="button"
        >
          Other
        </button>
      </div>
      {custom ? (
        <div className="mt-2">
          <label className="sr-only" htmlFor={`${idPrefix}-language-other`}>
            Other language
          </label>
          <input
            className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
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
