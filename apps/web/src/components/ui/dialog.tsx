import { useEffect, type ReactNode } from 'react'

import { X } from 'lucide-react'

import { Button } from './button'

export function Dialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      aria-labelledby="dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(8_18_40/0.45)] p-4 backdrop-blur-[3px] animate-in fade-in-0 duration-200 motion-reduce:animate-none"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <div className="w-full max-w-md rounded-3xl border border-border bg-popover p-6 text-popover-foreground shadow-lift animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
        <div className="flex items-start justify-between gap-3">
          <h2
            className="text-xl font-semibold text-foreground"
            id="dialog-title"
          >
            {title}
          </h2>
          <Button
            aria-label="Close dialog"
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
