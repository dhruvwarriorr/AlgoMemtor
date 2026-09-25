import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { useStickyHeight } from './sticky'

// A value that flips in when it changes. Keys count changes rather than
// reuse the text, so a value that comes back while its old copy is still
// leaving (5 → 8 → 5) animates in instead of staying hidden.
export function AnimatedText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const [shown, setShown] = useState({ text, version: 0 })
  if (shown.text !== text) setShown({ text, version: shown.version + 1 })
  return (
    <span className={cn('relative inline-grid overflow-hidden', className)}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          animate={{ y: 0, opacity: 1 }}
          className="col-start-1 row-start-1 block truncate"
          exit={{ y: 10, opacity: 0 }}
          initial={{ y: -10, opacity: 0 }}
          key={shown.version}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function PointerTag({
  name,
  tone = 'primary',
  className,
}: {
  name: string
  tone?: 'primary' | 'amber' | 'go'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none shadow-sm',
        tone === 'primary' && 'bg-primary text-primary-foreground',
        tone === 'amber' && 'bg-amber-500 text-white dark:text-amber-950',
        tone === 'go' && 'bg-go text-white dark:text-go-soft',
        className,
      )}
    >
      {name}
    </span>
  )
}

export function StructureCard({
  title,
  kind,
  type,
  owner,
  active,
  changed,
  wide,
  actions,
  children,
  footer,
}: {
  title: string
  kind: string
  type?: string
  owner?: string
  active: boolean
  changed: boolean
  wide: boolean
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const [attach, stickyStyle] = useStickyHeight<HTMLElement>()
  return (
    <motion.section
      animate={{ opacity: 1 }}
      aria-label={`${title}: ${kind}`}
      className={cn(
        'group/card relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-4 shadow-soft transition-colors',
        active
          ? 'border-primary/50'
          : changed
            ? 'border-go/40'
            : 'border-border',
        wide && 'xl:col-span-2',
      )}
      initial={{ opacity: 0 }}
      ref={attach}
      style={stickyStyle}
      transition={{ duration: 0.2 }}
    >
      <header className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            'size-2 shrink-0 rounded-full transition-colors',
            active ? 'bg-primary' : changed ? 'bg-go' : 'bg-border',
          )}
        />
        <h3 className="min-w-0 truncate font-mono text-sm font-semibold text-foreground">
          {title}
        </h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {kind}
        </span>
        {type !== undefined && type !== '' ? (
          <span className="hidden min-w-0 truncate font-mono text-[11px] text-muted-foreground sm:inline">
            {type}
          </span>
        ) : null}
        {owner !== undefined ? (
          <span className="text-[11px] text-muted-foreground">in {owner}</span>
        ) : null}
        {actions !== undefined ? (
          <span className="ml-auto flex items-center gap-1">{actions}</span>
        ) : null}
      </header>
      <div className="min-w-0">{children}</div>
      {footer !== undefined ? (
        <div className="text-xs text-muted-foreground">{footer}</div>
      ) : null}
    </motion.section>
  )
}

export function ToggleChip({
  pressed,
  onClick,
  children,
  label,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
  label: string
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        'h-7 rounded-md border px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        pressed
          ? 'border-primary/50 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function MoreNote({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null
  return (
    <span>
      Showing {shown.toLocaleString()} of {total.toLocaleString()} items.
    </span>
  )
}
