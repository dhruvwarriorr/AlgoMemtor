import { memo } from 'react'
import { Link } from 'react-router-dom'

import { ArrowUpRight, X } from '@/components/icons/algo-icons'
import { MentorChatBody } from '@/features/mentor/components/MentorChatBody'

import { MelloSprite } from './MelloSprite'
import type { PetAssistant } from './pet-assistant'
import type { Pet } from './pets'

// The pet's chat panel while it hosts a page's own assistant: the Doubt
// Helper mentor or the Solution Explorer follow-up chat. The page supplies
// the thread, modes and handlers; the pet thinks and answers here.
export const PetAssistantPanel = memo(function PetAssistantPanel({
  pet,
  assistant,
  onClose,
  onHide,
}: {
  pet: Pet
  assistant: PetAssistant
  onClose: () => void
  onHide: () => void
}) {
  const { title, subtitle } = assistant
  return (
    <section
      aria-label={`${pet.name}: ${title}`}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-background"
      data-mello-ignore
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-2">
        <div className="relative size-9 shrink-0 overflow-hidden rounded-full border border-border bg-[#141a2e]">
          <MelloSprite
            className="absolute -top-2.5 -left-12"
            clips={pet.clips}
            state={assistant.pending ? 'thinking' : 'idle'}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {pet.name}
            <span className="font-normal text-muted-foreground">
              {' '}
              · {title}
            </span>
          </h2>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <Link
          aria-label={`Open Coach to chat with ${pet.name} about anything`}
          className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
          title="Open Coach"
          to="/coach"
        >
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
        <button
          aria-label={`Close ${pet.name}`}
          className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      <MentorChatBody
        {...assistant}
        pendingLabel={`${pet.name} is thinking…`}
      />
      <div className="flex justify-end border-t border-border bg-card px-3 pb-2">
        <button
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={onHide}
          type="button"
        >
          Hide {pet.name}
        </button>
      </div>
    </section>
  )
})
