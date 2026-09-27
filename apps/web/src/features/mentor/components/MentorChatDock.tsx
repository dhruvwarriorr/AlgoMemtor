import { useEffect, useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { MessageCircle, X } from '@/components/icons/algo-icons'
import { cuePetQuestion } from '@/features/pet/mello-events'
import { useHostInPet } from '@/features/pet/pet-assistant'
import { usePetEnabled } from '@/features/pet/pet-preference'

import { MentorChatBody, type MentorChatProps } from './MentorChatBody'

export type { DockMessage, DockMode } from './MentorChatBody'

// A page's AI assistant. With the coach pet on, the pet hosts it: the pet's
// chat panel opens instead of this dock and the pet thinks and answers
// there. With the pet off, it is a floating bottom-right panel.

type MentorChatDockProps = MentorChatProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MentorChatDock(props: MentorChatDockProps) {
  const petEnabled = usePetEnabled()
  const [key] = useState(() => Symbol('mentor-assistant'))
  useHostInPet(key, petEnabled ? props : null)
  // The pet thinks while its hosted chat waits for an answer.
  const { pending } = props
  useEffect(() => {
    if (petEnabled) cuePetQuestion(pending)
  }, [pending, petEnabled])
  if (petEnabled) return null
  return <DockedPanel {...props} />
}

function DockedPanel({
  open,
  onOpenChange,
  title,
  subtitle,
  launcherLabel,
  ...chat
}: MentorChatDockProps) {
  const panelId = useId()
  const reduceMotion = useReducedMotion()

  return (
    <AnimatePresence initial={false} mode="wait">
      {open ? (
        <motion.section
          animate={{ opacity: 1, y: 0, scale: 1 }}
          aria-label={title}
          className="fixed inset-x-2 bottom-2 z-40 flex max-h-[calc(100dvh-5rem)] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-border bg-background sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[min(40rem,calc(100dvh-7rem))] sm:w-[27rem]"
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          id={panelId}
          initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.96 }}
          key="panel"
          onKeyDown={(event) => {
            if (event.key === 'Escape') onOpenChange(false)
          }}
          role="dialog"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <header className="flex items-start justify-between gap-3 border-b border-border bg-card px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {title}
              </h2>
              {subtitle ? (
                <p className="truncate text-xs text-muted-foreground">
                  {subtitle}
                </p>
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
          <MentorChatBody
            {...chat}
            launcherLabel={launcherLabel}
            title={title}
          />
        </motion.section>
      ) : (
        <motion.button
          animate={{ opacity: 1, scale: 1 }}
          aria-controls={panelId}
          aria-expanded={false}
          className="fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 motion-reduce:transition-none sm:right-6 sm:bottom-6"
          exit={{ opacity: 0, scale: 0.9 }}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
          key="launcher"
          onClick={() => onOpenChange(true)}
          type="button"
        >
          <MessageCircle aria-hidden="true" className="size-4" />
          {launcherLabel}
          {chat.messages.length > 0 ? (
            <span className="rounded-full bg-primary-foreground/20 px-1.5 text-xs tabular-nums">
              {chat.messages.length}
            </span>
          ) : null}
        </motion.button>
      )}
    </AnimatePresence>
  )
}
