import { useSyncExternalStore } from 'react'

import { isPetId, petNames, type PetId } from './pet-ids'

// Whether Mello is shown is a per-device preference, like the theme.
export const petStorageKey = 'algomemtor-pet-mello'

const listeners = new Set<() => void>()
// Set by this tab so a change shows at once even without storage.
let memory: boolean | null = null

export function readPetEnabled(storage: Pick<Storage, 'getItem'> | null) {
  try {
    return storage?.getItem(petStorageKey) !== 'off'
  } catch {
    return true
  }
}

function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function setPetEnabled(enabled: boolean) {
  try {
    browserStorage()?.setItem(petStorageKey, enabled ? 'on' : 'off')
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts
    // until reload.
  }
  memory = enabled
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== petStorageKey) return
    memory = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function snapshot() {
  return memory ?? readPetEnabled(browserStorage())
}

export function usePetEnabled() {
  return useSyncExternalStore(subscribe, snapshot, () => true)
}

// Which pet is the coach's body, also per device.
export const petChoiceKey = 'algomemtor-pet-choice'
const choiceListeners = new Set<() => void>()
let choiceMemory: PetId | null = null

export function readPetChoice(storage: Pick<Storage, 'getItem'> | null): PetId {
  try {
    const value = storage?.getItem(petChoiceKey)
    return isPetId(value) ? value : 'mello'
  } catch {
    return 'mello'
  }
}

export function setPetChoice(pet: PetId) {
  try {
    browserStorage()?.setItem(petChoiceKey, pet)
  } catch {
    // Kept for this tab only when storage is unavailable.
  }
  choiceMemory = pet
  for (const listener of choiceListeners) listener()
}

function subscribeChoice(listener: () => void) {
  choiceListeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== petChoiceKey) return
    choiceMemory = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    choiceListeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function usePetChoice(): PetId {
  return useSyncExternalStore(
    subscribeChoice,
    () => choiceMemory ?? readPetChoice(browserStorage()),
    () => 'mello',
  )
}

// The AI coach's name: the chosen pet's name, used across the app whether or
// not the pet is shown.
export function useCoachName() {
  return petNames[usePetChoice()]
}
