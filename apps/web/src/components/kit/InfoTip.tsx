import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

// A small "i" button that keeps secondary explanations out of the layout
// until someone asks for them. Closes on Escape or an outside click.
export function InfoTip({
  label = 'More about this',
  children,
  className,
  align = 'start',
}: {
  label?: string
  children: ReactNode
  className?: string
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span className={cn('relative inline-flex', className)} ref={rootRef}>
      <button
        aria-controls={id}
        aria-expanded={open}
        aria-label={label}
        className={cn(
          'grid size-6 place-items-center rounded-full border border-border bg-card/70 font-mono text-[0.7rem] font-semibold text-muted-foreground transition-colors hover:border-acc hover:text-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open && 'border-acc text-acc',
        )}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        i
      </button>
      <AnimatePresence>
        {open ? (
          <motion.span
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={cn(
              'glass-card absolute top-8 z-40 block w-[min(20rem,80vw)] rounded-xl p-3.5 text-left text-sm leading-6 font-normal text-foreground',
              align === 'end' ? 'right-0' : 'left-0',
            )}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            id={id}
            initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.97 }}
            role="note"
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            {children}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  )
}
