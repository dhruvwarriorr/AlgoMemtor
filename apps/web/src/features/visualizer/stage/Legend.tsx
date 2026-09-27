import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { Chevron } from '@/components/ui/select'
import { cn } from '@/lib/utils'
const legend: { className: string; label: string }[] = [
  { className: 'border-primary/70 bg-primary/10', label: 'read on this step' },
  {
    className: 'border-amber-500 bg-amber-100 dark:bg-amber-400/20',
    label: 'written on this step',
  },
  { className: 'border-go/60 bg-go-soft', label: 'changed or added' },
  {
    className: 'border-dashed border-primary/45 bg-primary/[0.07]',
    label: 'window between two pointers (l…r)',
  },
  {
    className: 'border-fuchsia-500 bg-fuchsia-500/10',
    label: 'line or step the AI Debugger flagged',
  },
]

export function Legend() {
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative text-xs" ref={rootRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open && 'bg-secondary text-foreground',
        )}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        Colours
        <Chevron
          className={cn(
            'size-3.5 transition-transform duration-300 motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute right-0 z-40 mt-2 w-72 origin-top-right rounded-xl border border-border bg-popover p-3"
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            id={panelId}
            initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 480, damping: 32 }}
          >
            <ul className="grid gap-2">
              {legend.map((item) => (
                <li
                  className="flex items-center gap-2 text-foreground"
                  key={item.label}
                >
                  <span
                    aria-hidden="true"
                    className={`size-4 shrink-0 rounded border ${item.className}`}
                  />
                  {item.label}
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-border pt-2 leading-5 text-muted-foreground">
              Space plays and pauses, ← and → step, Home and End jump. Click a
              variable to pause whenever it changes; click a line number to set
              a breakpoint.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
