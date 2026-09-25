import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { MessageCircle, Send, X } from '@/components/icons/algo-icons'
import { Button } from '@/components/ui/button'
import { CoachMessageContent } from '@/features/coach/components/CoachMessageContent'
import { inputClass } from '@/features/mentor/format'
import { cn } from '@/lib/utils'

// A floating bottom-right assistant for mentor pages. The page supplies the
// context server-side, so the learner only types the question.

export type DockMessage = {
  id: string
  role: 'learner' | 'mentor'
  content: string
  label?: string
}

export type DockMode = {
  id: string
  label: string
  icon?: ReactNode
  placeholder: string
  submitLabel: string
}

type MentorChatDockProps = {
  title: string
  subtitle?: string
  launcherLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  modes: readonly DockMode[]
  mode: string
  onModeChange?: (mode: string) => void
  messages: readonly DockMessage[]
  pending: boolean
  pendingLabel?: string
  emptyState?: ReactNode
  suggestions?: readonly string[]
  disabled?: boolean
  disabledReason?: string
  // Extra fields for the active mode, for example attached code.
  extra?: ReactNode
  // Resolves true when the message was accepted and the draft can be
  // cleared; a failed send keeps the draft.
  onSubmit: (text: string, mode: string) => boolean | Promise<boolean>
}

export function MentorChatDock({
  title,
  subtitle,
  launcherLabel,
  open,
  onOpenChange,
  modes,
  mode,
  onModeChange,
  messages,
  pending,
  pendingLabel = 'Thinking…',
  emptyState,
  suggestions = [],
  disabled = false,
  disabledReason,
  extra,
  onSubmit,
}: MentorChatDockProps) {
  const panelId = useId()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const active = modes.find((item) => item.id === mode) ?? modes[0]
  const draft = active === undefined ? '' : (drafts[active.id] ?? '')

  useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open, mode])

  useEffect(() => {
    if (!open) return
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [open, messages.length, pending])

  if (active === undefined) return null

  function send(text: string) {
    const content = text.trim()
    if (content === '' || pending || disabled || active === undefined) return
    const modeId = active.id
    const clear = (accepted: boolean) => {
      if (accepted) setDrafts((current) => ({ ...current, [modeId]: '' }))
    }
    const accepted = onSubmit(content, modeId)
    if (typeof accepted === 'boolean') clear(accepted)
    else void accepted.then(clear)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    send(draft)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      send(draft)
    }
  }

  if (!open) {
    return (
      <button
        aria-controls={panelId}
        aria-expanded={false}
        className="fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 motion-reduce:transition-none sm:right-6 sm:bottom-6"
        onClick={() => onOpenChange(true)}
        type="button"
      >
        <MessageCircle aria-hidden="true" className="size-4" />
        {launcherLabel}
        {messages.length > 0 ? (
          <span className="rounded-full bg-primary-foreground/20 px-1.5 text-xs tabular-nums">
            {messages.length}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <section
      aria-label={title}
      className="fixed inset-x-2 bottom-2 z-40 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[min(40rem,calc(100dvh-7rem))] sm:w-[27rem]"
      id={panelId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onOpenChange(false)
      }}
      role="dialog"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {title}
          </h2>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <button
          aria-label="Close"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onOpenChange(false)}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>

      {modes.length > 1 ? (
        <div
          aria-label="What do you want to do?"
          className="flex gap-1 border-b border-border bg-card px-3 py-2"
          role="tablist"
        >
          {modes.map((item) => (
            <button
              aria-selected={item.id === active.id}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                item.id === active.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
              key={item.id}
              onClick={() => onModeChange?.(item.id)}
              role="tab"
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        aria-live="polite"
        className="flex min-h-40 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !pending ? (
          <div className="text-sm leading-6 text-muted-foreground">
            {emptyState}
            {suggestions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    className="rounded-full border border-border px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                    disabled={disabled}
                    key={suggestion}
                    onClick={() => send(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {messages.map((message) =>
          message.role === 'learner' ? (
            <div
              className="ml-8 self-end rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-sm text-secondary-foreground"
              key={message.id}
            >
              {message.label ? (
                <p className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  {message.label}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap leading-6">{message.content}</p>
            </div>
          ) : (
            <div className="min-w-0 text-sm [&>div]:mt-0" key={message.id}>
              {message.label ? (
                <p className="mb-1 text-[0.7rem] font-semibold tracking-wide text-primary uppercase">
                  {message.label}
                </p>
              ) : null}
              <CoachMessageContent content={message.content} role="assistant" />
            </div>
          ),
        )}
        {pending ? (
          <p
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <span className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
            {pendingLabel}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="flex flex-col gap-2 border-t border-border bg-card p-3"
        onSubmit={submit}
      >
        {disabled && disabledReason ? (
          <p className="text-xs text-muted-foreground">{disabledReason}</p>
        ) : null}
        <textarea
          aria-label={active.label}
          className={cn(inputClass, 'max-h-40 min-h-16 resize-none py-2')}
          disabled={disabled}
          maxLength={2_000}
          onChange={(event) =>
            setDrafts((current) => ({
              ...current,
              [active.id]: event.target.value,
            }))
          }
          onKeyDown={onKeyDown}
          placeholder={active.placeholder}
          ref={textareaRef}
          rows={2}
          value={draft}
        />
        {extra}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.7rem] text-muted-foreground">
            Enter to send · Shift+Enter for a new line
          </span>
          <Button
            disabled={pending || disabled || draft.trim() === ''}
            size="sm"
            type="submit"
          >
            <Send aria-hidden="true" />
            {active.submitLabel}
          </Button>
        </div>
      </form>
    </section>
  )
}
