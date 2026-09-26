// Pet sprites are built frame by frame from the concept art. Each file is
// one strip of 132x104 frames laid out as [enter][loop][exit]: enter
// frames ease in from the parent pose, loop frames play while the pose
// holds, and exit frames (or the enter frames reversed) ease back out.
export const spriteFrame = { width: 132, height: 104 } as const

export const melloStates = [
  'idle',
  'greet',
  'awe',
  'watching',
  'scroll',
  'reading',
  'thinking',
  'working',
  'idea',
  'teaching',
  'success',
  'sleepy',
  'sleeping',
] as const

export type MelloState = (typeof melloStates)[number]

export type MelloClip = {
  src: string
  enter: number
  loop: number
  exit: number
  // Loop speed; transitions always run at transitionFps.
  fps: number
  parent: MelloState | null
  label: string
  // A held pose: its frames are positions (a head tilt), not a loop. The
  // frame follows the wanted position and starts and ends at `rest`.
  hold?: { rest: number }
  // Starts and stops at once, without its in-between frames (hover poses).
  instant?: boolean
}

export const transitionFps = 24

// Every pet has one clip per pose.
export type PetClips = Record<MelloState, MelloClip>

// ---- Choosing the pose ------------------------------------------------------

export const sleepyAfterMs = 60_000
export const sleepingAfterMs = 72_000
// A coach question: Mello reads the page, thinks, and past a few seconds
// gets to work on it.
export const readingPhaseMs = 1_500
export const workingAfterMs = 6_000
// When the answer lands: an idea, then explaining it.
export const ideaMs = 1_300
export const teachingMs = 4_500
export const successMs = 2_600

export type MelloInputs = {
  now: number
  // The coach question in flight started at, or null.
  busySince: number | null
  // When the last coach answer arrived.
  answeredAt: number
  // When the app last reported a success.
  succeededAt: number
  // Other slow work in the app (saving, syncing, mentor tools).
  appBusy: boolean
  // The cursor is on the pet; `near` means it is moving anywhere on screen.
  onPet: boolean
  near: boolean
  typing: boolean
  // The page is being scrolled.
  scrolling: boolean
  inAwe: boolean
  idleMs: number
}

export function resolveMelloState(inputs: MelloInputs): MelloState {
  const { now, busySince, answeredAt, succeededAt } = inputs
  if (busySince !== null) {
    const elapsed = now - busySince
    if (elapsed < readingPhaseMs) return 'reading'
    return elapsed < workingAfterMs ? 'thinking' : 'working'
  }
  const sinceAnswer = now - answeredAt
  if (sinceAnswer >= 0 && sinceAnswer < ideaMs) return 'idea'
  if (sinceAnswer >= 0 && sinceAnswer < ideaMs + teachingMs) return 'teaching'
  if (now - succeededAt >= 0 && now - succeededAt < successMs) return 'success'
  if (inputs.appBusy) return 'working'
  if (inputs.onPet) return 'awe'
  if (inputs.typing) return 'watching'
  if (inputs.scrolling) return 'scroll'
  if (inputs.inAwe) return 'awe'
  if (inputs.near) return 'greet'
  if (inputs.idleMs >= sleepingAfterMs) return 'sleeping'
  if (inputs.idleMs >= sleepyAfterMs) return 'sleepy'
  return 'idle'
}

// Where a held pose should look: -1 (far left) to 1 (far right).
export function holdFrame(clip: MelloClip, position: number) {
  if (!clip.hold) return 0
  const clamped = Math.max(-1, Math.min(1, position))
  const span = Math.min(clip.hold.rest, clip.loop - 1 - clip.hold.rest)
  return clip.hold.rest + Math.round(clamped * span)
}

// ---- Playing between poses --------------------------------------------------

export type MelloCursor = {
  state: MelloState
  // enter: easing in; loop: holding; leave: enter played backwards;
  // exit: the pose's own exit frames, which always finish.
  phase: 'enter' | 'loop' | 'leave' | 'exit'
  frame: number
}

function lineage(clips: PetClips, state: MelloState): MelloState[] {
  const chain: MelloState[] = [state]
  let parent = clips[state].parent
  while (parent !== null) {
    chain.unshift(parent)
    parent = clips[parent].parent
  }
  return chain
}

// The child of `state` on the way to `target`, if target lies below it.
function childToward(clips: PetClips, state: MelloState, target: MelloState) {
  const chain = lineage(clips, target)
  const index = chain.indexOf(state)
  return index >= 0 && index < chain.length - 1 ? chain[index + 1] : null
}

function leave(clips: PetClips, cursor: MelloCursor): MelloCursor {
  const clip = clips[cursor.state]
  if (clip.instant) return arrive(clips, clip.parent ?? cursor.state)
  if (clip.exit > 0) return { state: cursor.state, phase: 'exit', frame: 0 }
  if (clip.enter > 0) {
    return { state: cursor.state, phase: 'leave', frame: clip.enter - 1 }
  }
  return arrive(clips, clip.parent ?? cursor.state)
}

function arrive(clips: PetClips, state: MelloState): MelloCursor {
  return { state, phase: 'loop', frame: clips[state].hold?.rest ?? 0 }
}

function enter(clips: PetClips, state: MelloState): MelloCursor {
  return clips[state].enter > 0 && !clips[state].instant
    ? { state, phase: 'enter', frame: 0 }
    : arrive(clips, state)
}

const toward = (from: number, to: number) => from + Math.sign(to - from)

// Advance one frame toward the target pose. `position` steers held poses.
export function stepCursor(
  clips: PetClips,
  cursor: MelloCursor,
  target: MelloState,
  position = 0,
): MelloCursor {
  const clip = clips[cursor.state]
  const stay =
    cursor.state === target || childToward(clips, cursor.state, target) !== null
  switch (cursor.phase) {
    case 'loop': {
      if (clip.hold) {
        // Held poses glide a frame at a time, and settle before leaving.
        const wanted =
          cursor.state === target ? holdFrame(clip, position) : clip.hold.rest
        if (cursor.frame !== wanted) {
          return { ...cursor, frame: toward(cursor.frame, wanted) }
        }
        if (cursor.state === target) return cursor
      } else if (cursor.state === target) {
        return { ...cursor, frame: (cursor.frame + 1) % clip.loop }
      }
      const child = childToward(clips, cursor.state, target)
      return child !== null ? enter(clips, child) : leave(clips, cursor)
    }
    case 'enter':
      if (!stay) return { ...cursor, phase: 'leave' }
      return cursor.frame + 1 >= clip.enter
        ? arrive(clips, cursor.state)
        : { ...cursor, frame: cursor.frame + 1 }
    case 'leave':
      if (stay) return { ...cursor, phase: 'enter' }
      return cursor.frame - 1 < 0
        ? arrive(clips, clip.parent ?? cursor.state)
        : { ...cursor, frame: cursor.frame - 1 }
    case 'exit':
      return cursor.frame + 1 >= clip.exit
        ? arrive(clips, clip.parent ?? cursor.state)
        : { ...cursor, frame: cursor.frame + 1 }
  }
}

// Where the cursor's frame sits in the strip.
export function stripIndex(clips: PetClips, cursor: MelloCursor) {
  const clip = clips[cursor.state]
  switch (cursor.phase) {
    case 'enter':
    case 'leave':
      return cursor.frame
    case 'loop':
      return clip.enter + cursor.frame
    case 'exit':
      return clip.enter + clip.loop + cursor.frame
  }
}

export function frameDelay(clips: PetClips, cursor: MelloCursor) {
  return (
    1000 / (cursor.phase === 'loop' ? clips[cursor.state].fps : transitionFps)
  )
}
