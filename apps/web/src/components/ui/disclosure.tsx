import { useId, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

import { Chevron } from './select'

// AlgoMemtor's expandable section. It replaces the browser's native
// details/summary: a full-width button with a turning chevron and content
// that grows open and fades in.
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  icon,
  meta,
  variant = 'card',
  className,
  summaryClassName,
  contentClassName,
}: {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  // Shown before the summary text.
  icon?: ReactNode
  // Shown at the far end of the summary row (a count or a hint).
  meta?: ReactNode
  // card: bordered panel; plain: a quiet inline toggle.
  variant?: 'card' | 'plain'
  className?: string
  summaryClassName?: string
  contentClassName?: string
}) {
  const reduceMotion = useReducedMotion()
  const contentId = useId()
  const [ownOpen, setOwnOpen] = useState(defaultOpen)
  const open = controlledOpen ?? ownOpen
  const toggle = () => {
    const next = !open
    if (controlledOpen === undefined) setOwnOpen(next)
    onOpenChange?.(next)
  }

  return (
    <div
      className={cn(
        variant === 'card' &&
          'rounded-xl border border-border transition-colors duration-300',
        variant === 'card' && open && 'bg-secondary/30',
        className,
      )}
      data-state={open ? 'open' : 'closed'}
    >
      <button
        aria-controls={contentId}
        aria-expanded={open}
        className={cn(
          'group flex w-full items-center gap-2 text-left text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
          variant === 'card'
            ? 'rounded-xl px-4 py-3 hover:bg-secondary/40'
            : 'rounded-md py-1 text-muted-foreground hover:text-foreground',
          summaryClassName,
        )}
        onClick={toggle}
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-full transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
            variant === 'card'
              ? 'bg-secondary text-muted-foreground group-hover:text-foreground'
              : 'text-current',
            open ? 'rotate-0' : '-rotate-90',
          )}
        >
          <Chevron className="size-3.5" />
        </span>
        {icon}
        <span className="min-w-0 flex-1">{summary}</span>
        {meta}
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            id={contentId}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            key="content"
            role="region"
            transition={{
              height: { type: 'spring', stiffness: 320, damping: 36 },
              opacity: { duration: 0.2 },
            }}
          >
            <div
              className={cn(
                variant === 'card' ? 'px-4 pb-4' : 'pt-2',
                contentClassName,
              )}
            >
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
