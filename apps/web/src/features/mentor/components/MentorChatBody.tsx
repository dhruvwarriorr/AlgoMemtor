import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { Send } from '@/components/icons/algo-icons'
import { Button } from '@/components/ui/button'
import { CoachMessageContent } from '@/features/coach/components/CoachMessageContent'
import { inputClass } from '@/features/mentor/format'
import { cn } from '@/lib/utils'

// The conversation inside a page assistant: mode tabs, the thread, the
// thinking state and the composer. The docked panel and the coach pet both
// render it, so a page's assistant behaves the same in either.

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

export type MentorChatProps = {
  title: string
  subtitle?: string
  launcherLabel: string
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
  // Drafts to start with, by mode (for example a question prepared by the
  // Test Case Visualizer). The learner reviews and sends them.
  initialDrafts?: Readonly<Record<string, string>>
  // Keeps unsent drafts when the panel closes and reopens.
  draftKey?: string
  // Resolves true when the message was accepted and the draft can be
  // cleared; a failed send keeps the draft.
  onSubmit: (text: string, mode: string) => boolean | Promise<boolean>
}

// Unsent drafts per assistant, kept for this tab while it is open.
const savedDrafts = new Map<string, Record<string, string>>()

function ThinkingBubble({ label }: { label: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="inline-flex w-fit items-center gap-2.5 rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground"
      exit={{ opacity: 0, y: -4 }}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      role="status"
      transition={{ duration: 0.25 }}
    >
      <span aria-hidden="true" className="flex items-center gap-1">
        {[0, 1, 2].map((dot) => (
          <motion.span
            animate={reduceMotion ? undefined : { y: [0, -4, 0] }}
            className="size-1.5 rounded-full bg-primary"
            key={dot}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: dot * 0.15,
              ease: 'easeInOut',
            }}
          />
        ))}
      </span>
      {label}
    </motion.div>
  )
}

export function MentorChatBody({
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
  initialDrafts,
  draftKey,
  onSubmit,
  autoFocus = true,
}: MentorChatProps & { autoFocus?: boolean }) {
  const reduceMotion = useReducedMotion()
  const [drafts, setDraftsState] = useState<Record<string, string>>(() => ({
    ...initialDrafts,
    ...(draftKey === undefined ? {} : savedDrafts.get(draftKey)),
  }))
  const setDrafts = (
    update: (current: Record<string, string>) => Record<string, string>,
  ) =>
    setDraftsState((current) => {
      const next = update(current)
      if (draftKey !== undefined) savedDrafts.set(draftKey, next)
      return next
    })
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const active = modes.find((item) => item.id === mode) ?? modes[0]
  const draft = active === undefined ? '' : (drafts[active.id] ?? '')

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus({ preventScroll: true })
  }, [autoFocus, mode])

  useEffect(() => {
    // Scroll only the thread, never the page behind it.
    const thread = threadRef.current
    if (thread) thread.scrollTop = thread.scrollHeight
  }, [messages.length, pending])

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

  return (
    <>
      {modes.length > 1 ? (
        <div
          aria-label="What do you want to do?"
          className="relative flex gap-1 border-b border-border bg-card px-3 py-2"
          role="tablist"
        >
          {modes.map((item) => (
            <button
              aria-selected={item.id === active.id}
              className={cn(
                'relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                item.id === active.id
                  ? 'text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
              key={item.id}
              onClick={() => onModeChange?.(item.id)}
              role="tab"
              type="button"
            >
              {item.id === active.id ? (
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-md bg-primary/10"
                  layoutId={`chat-mode-${modes.map((m) => m.id).join('-')}`}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 420, damping: 34 }
                  }
                />
              ) : null}
              <span className="relative inline-flex items-center gap-1.5">
                {item.icon}
                {item.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div
        aria-live="polite"
        className="flex min-h-40 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        data-mello-ignore
        ref={threadRef}
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
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="ml-8 self-end rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 text-sm text-secondary-foreground"
              initial={reduceMotion ? false : { opacity: 0, x: 10 }}
              key={message.id}
              transition={{ duration: 0.3 }}
            >
              {message.label ? (
                <p className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  {message.label}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap leading-6">{message.content}</p>
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="min-w-0 text-sm [&>div]:mt-0"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              key={message.id}
              transition={{ duration: 0.35 }}
            >
              {message.label ? (
                <p className="mb-1 text-[0.7rem] font-semibold tracking-wide text-primary uppercase">
                  {message.label}
                </p>
              ) : null}
              <CoachMessageContent content={message.content} role="assistant" />
            </motion.div>
          ),
        )}
        <AnimatePresence>
          {pending ? (
            <ThinkingBubble key="thinking" label={pendingLabel} />
          ) : null}
        </AnimatePresence>
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
    </>
  )
}
