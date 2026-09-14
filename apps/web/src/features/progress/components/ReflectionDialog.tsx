import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'

type ReflectionDialogProps = {
  open: boolean
  problemLabel: string
  isSaving: boolean
  onClose: () => void
  onSave: (input: {
    perceivedDifficulty: 'easy' | 'medium' | 'hard'
    note?: string
  }) => Promise<void>
}

export function ReflectionDialog({
  isSaving,
  onClose,
  onSave,
  open,
  problemLabel,
}: ReflectionDialogProps) {
  const dialogId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>(
    'medium',
  )
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isSaving, onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <div
        aria-describedby={`${dialogId}-description`}
        aria-labelledby={`${dialogId}-title`}
        aria-modal="true"
        className="max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-background p-5 shadow-xl sm:rounded-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              className="break-words text-xl font-semibold text-foreground"
              id={`${dialogId}-title`}
            >
              Reflect on {problemLabel}
            </h2>
            <p
              className="mt-2 text-sm leading-6 text-muted-foreground"
              id={`${dialogId}-description`}
            >
              Optional: record how this problem felt. This stays separate from
              the provider’s problem content.
            </p>
          </div>
          <Button
            aria-label="Close reflection dialog"
            disabled={isSaving}
            onClick={onClose}
            ref={closeButtonRef}
            size="icon-lg"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmedNote = note.trim()
            void onSave({
              perceivedDifficulty: difficulty,
              ...(trimmedNote ? { note: trimmedNote } : {}),
            })
          }}
        >
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Perceived difficulty
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              disabled={isSaving}
              onChange={(event) =>
                setDifficulty(event.target.value as typeof difficulty)
              }
              value={difficulty}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            Reflection note
            <textarea
              className="min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              disabled={isSaving}
              maxLength={1_000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What helped, surprised you, or should you revisit?"
              value={note}
            />
            <span className="block text-xs font-normal text-muted-foreground">
              {note.length}/1000 characters
            </span>
          </label>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button
              disabled={isSaving}
              onClick={onClose}
              type="button"
              variant="ghost"
            >
              Skip for now
            </Button>
            <Button disabled={isSaving} type="submit">
              {isSaving ? 'Saving…' : 'Save reflection'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
