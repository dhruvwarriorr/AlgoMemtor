import type { MelloState } from './mello-states'

// Lets the rest of the app tell the pet what is happening without knowing
// whether the pet is shown: a success, a short speech bubble, or an ongoing
// activity (a sync the pet "reads" while it runs).
type Listener = () => void

const listeners = new Set<Listener>()

export function cueMelloSuccess() {
  for (const listener of listeners) listener()
}

export function onMelloSuccess(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ---- A hosted page assistant answering -----------------------------------

// A page assistant hosted in the pet (Doubt Helper, Solution Explorer) is
// waiting for an answer; the pet reads, thinks and explains like it does
// for a coach question.
const questionListeners = new Set<(busy: boolean) => void>()

export function cuePetQuestion(busy: boolean) {
  for (const listener of questionListeners) listener(busy)
}

export function onPetQuestion(listener: (busy: boolean) => void) {
  questionListeners.add(listener)
  return () => {
    questionListeners.delete(listener)
  }
}

// ---- Speech bubbles -------------------------------------------------------

export type PetLine = {
  message: string
  // A pose to hold while the bubble shows.
  state?: MelloState
  // How long the bubble stays up.
  ms?: number
}

export type PetSaid = PetLine & { id: number; at: number }

const lineListeners = new Set<(line: PetSaid) => void>()
let lineId = 0

export function petSay(line: PetLine | string) {
  const said: PetSaid = {
    ...(typeof line === 'string' ? { message: line } : line),
    id: (lineId += 1),
    at: Date.now(),
  }
  for (const listener of lineListeners) listener(said)
}

export function onPetSay(listener: (line: PetSaid) => void) {
  lineListeners.add(listener)
  return () => {
    lineListeners.delete(listener)
  }
}

// ---- Ongoing activities ---------------------------------------------------

// Keyed so two activities (say, a sync and an exploration) can overlap; the
// most recent one sets the pose.
const activities = new Map<string, { state: MelloState; at: number }>()
const activityListeners = new Set<Listener>()

function emitActivities() {
  for (const listener of activityListeners) listener()
}

export function startPetActivity(
  key: string,
  state: MelloState,
  message?: string,
) {
  activities.set(key, { state, at: Date.now() })
  emitActivities()
  if (message !== undefined) petSay({ message, ms: 6_000 })
}

export function endPetActivity(key: string, line?: PetLine | string) {
  if (activities.delete(key)) emitActivities()
  if (line !== undefined) petSay(line)
}

export function currentPetActivity(): MelloState | null {
  let latest: { state: MelloState; at: number } | null = null
  for (const activity of activities.values()) {
    if (latest === null || activity.at >= latest.at) latest = activity
  }
  return latest?.state ?? null
}

export function onPetActivity(listener: Listener) {
  activityListeners.add(listener)
  return () => {
    activityListeners.delete(listener)
  }
}
