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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2
            className="text-lg font-semibold text-foreground"
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
