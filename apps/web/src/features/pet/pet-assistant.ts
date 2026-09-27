import { useLayoutEffect, useSyncExternalStore } from 'react'

import type { MentorChatProps } from '@/features/mentor/components/MentorChatBody'

// A page's own AI assistant (the Doubt Helper mentor, the Solution Explorer
// follow-up chat) hosted in the coach pet's chat panel. The page keeps its
// state and handlers; the pet only shows them. With the pet turned off, the
// page shows its docked panel instead.

export type PetAssistant = MentorChatProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Entry = { key: symbol; assistant: PetAssistant }

let current: Entry | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePetAssistant() {
  return useSyncExternalStore(
    subscribe,
    () => current?.assistant ?? null,
    () => null,
  )
}

// Shows `assistant` in the pet while the calling component is mounted. The
// latest props are published after every render so handlers stay current.
export function useHostInPet(key: symbol, assistant: PetAssistant | null) {
  useLayoutEffect(() => {
    if (assistant === null) {
      if (current?.key === key) {
        current = null
        emit()
      }
      return
    }
    current = { key, assistant }
    emit()
  })
  useLayoutEffect(
    () => () => {
      if (current?.key === key) {
        current = null
        emit()
      }
    },
    [key],
  )
}
