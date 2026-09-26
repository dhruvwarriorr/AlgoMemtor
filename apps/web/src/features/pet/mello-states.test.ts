import { describe, expect, it } from 'vitest'

import {
  melloStates,
  holdFrame,
  ideaMs,
  readingPhaseMs,
  resolveMelloState,
  sleepingAfterMs,
  sleepyAfterMs,
  stepCursor,
  stripIndex,
  successMs,
  teachingMs,
  workingAfterMs,
  type MelloCursor,
  type MelloInputs,
  type MelloState,
} from './mello-states'
import { petIds, pets } from './pets'

const melloClips = pets.mello.clips

const base: MelloInputs = {
  now: 100_000,
  busySince: null,
  answeredAt: Number.NEGATIVE_INFINITY,
  succeededAt: Number.NEGATIVE_INFINITY,
  appBusy: false,
  onPet: false,
  near: false,
  typing: false,
  scrolling: false,
  inAwe: false,
  idleMs: 0,
}

describe('resolveMelloState', () => {
  it('rests idle by default', () => {
    expect(resolveMelloState(base)).toBe('idle')
  })

  it('reads the page, thinks, then works on a long question', () => {
    const at = (elapsed: number) =>
      resolveMelloState({ ...base, busySince: base.now - elapsed })
    expect(at(0)).toBe('reading')
    expect(at(readingPhaseMs)).toBe('thinking')
    expect(at(workingAfterMs)).toBe('working')
  })

  it('gets an idea when the answer lands, then explains it', () => {
    const since = (elapsed: number) =>
      resolveMelloState({
        ...base,
        answeredAt: base.now - elapsed,
        onPet: true,
      })
    expect(since(0)).toBe('idea')
    expect(since(ideaMs)).toBe('teaching')
    expect(since(ideaMs + teachingMs)).toBe('awe')
  })

  it('celebrates a success and works while the app is busy', () => {
    expect(resolveMelloState({ ...base, succeededAt: base.now })).toBe(
      'success',
    )
    expect(
      resolveMelloState({ ...base, succeededAt: base.now - successMs }),
    ).toBe('idle')
    expect(resolveMelloState({ ...base, appBusy: true })).toBe('working')
  })

  it('winks when the cursor is near and is in awe when it is on her', () => {
    expect(resolveMelloState({ ...base, near: true })).toBe('greet')
    expect(resolveMelloState({ ...base, near: true, onPet: true })).toBe('awe')
  })

  it('watches while the learner types, and is in awe on the visualizer', () => {
    expect(resolveMelloState({ ...base, typing: true })).toBe('watching')
    expect(resolveMelloState({ ...base, typing: true, near: true })).toBe(
      'watching',
    )
    expect(resolveMelloState({ ...base, inAwe: true })).toBe('awe')
  })

  it('plays the scroll pose while the page scrolls', () => {
    expect(resolveMelloState({ ...base, scrolling: true })).toBe('scroll')
    // Scrolling outranks the cursor greeting and the visualizer's awe...
    expect(
      resolveMelloState({ ...base, scrolling: true, near: true, inAwe: true }),
    ).toBe('scroll')
    // ...but typing and the pet under the cursor come first.
    expect(resolveMelloState({ ...base, scrolling: true, typing: true })).toBe(
      'watching',
    )
    expect(resolveMelloState({ ...base, scrolling: true, onPet: true })).toBe(
      'awe',
    )
  })

  it('gets sleepy after a quiet minute, then sleeps', () => {
    expect(resolveMelloState({ ...base, idleMs: sleepyAfterMs - 1 })).toBe(
      'idle',
    )
    expect(resolveMelloState({ ...base, idleMs: sleepyAfterMs })).toBe('sleepy')
    expect(resolveMelloState({ ...base, idleMs: sleepingAfterMs })).toBe(
      'sleeping',
    )
  })
})

// Plays the cursor until it holds `target`, returning every pose it passed.
function travel(from: MelloCursor, target: MelloState, clips = melloClips) {
  const path: MelloCursor[] = []
  let cursor = from
  for (let i = 0; i < 200; i += 1) {
    cursor = stepCursor(clips, cursor, target)
    path.push(cursor)
    if (cursor.state === target && cursor.phase === 'loop') break
  }
  return path
}

const idleLoop: MelloCursor = { state: 'idle', phase: 'loop', frame: 0 }

describe('stepCursor', () => {
  it('loops the current pose', () => {
    expect(stepCursor(melloClips, idleLoop, 'idle')).toEqual({
      ...idleLoop,
      frame: 1,
    })
    const last = { ...idleLoop, frame: melloClips.idle.loop - 1 }
    expect(stepCursor(melloClips, last, 'idle').frame).toBe(0)
  })

  it('eases into a pose through every enter frame', () => {
    const path = travel(idleLoop, 'reading')
    const enters = path.filter((cursor) => cursor.phase === 'enter')
    expect(enters.map((cursor) => cursor.frame)).toEqual(
      Array.from({ length: melloClips.reading.enter }, (_, index) => index),
    )
    expect(path.at(-1)).toEqual({ state: 'reading', phase: 'loop', frame: 0 })
  })

  it('goes between poses by way of idle, never cutting', () => {
    const reading: MelloCursor = { state: 'reading', phase: 'loop', frame: 3 }
    const path = travel(reading, 'thinking')
    expect(path.some((c) => c.state === 'reading' && c.phase === 'leave')).toBe(
      true,
    )
    expect(path.some((c) => c.state === 'idle')).toBe(true)
    expect(path.at(-1)?.state).toBe('thinking')
  })

  it('falls asleep through sleepy', () => {
    const states = travel(idleLoop, 'sleeping').map((cursor) => cursor.state)
    expect(states.indexOf('sleepy')).toBeGreaterThanOrEqual(0)
    expect(states.indexOf('sleepy')).toBeLessThan(states.indexOf('sleeping'))
  })

  it('reaches awe through the greeting and backs off to it', () => {
    const states = travel(idleLoop, 'awe').map((cursor) => cursor.state)
    expect(states.indexOf('greet')).toBeLessThan(states.indexOf('awe'))
    const inAwe: MelloCursor = { state: 'awe', phase: 'loop', frame: 3 }
    expect(travel(inAwe, 'greet').at(-1)).toEqual({
      state: 'greet',
      phase: 'loop',
      frame: 0,
    })
  })

  it('turns back smoothly when the target changes mid-transition', () => {
    const entering: MelloCursor = { state: 'reading', phase: 'enter', frame: 8 }
    expect(stepCursor(melloClips, entering, 'idle')).toEqual({
      state: 'reading',
      phase: 'leave',
      frame: 8,
    })
    expect(
      stepCursor(melloClips, { ...entering, phase: 'leave' }, 'reading').phase,
    ).toBe('enter')
  })

  it('starts and stops the hover poses at once, for every pet', () => {
    for (const pet of petIds) {
      const clips = pets[pet].clips
      // Idle to the greeting in one step, and from there to awe in one more.
      expect(stepCursor(clips, idleLoop, 'greet')).toEqual({
        state: 'greet',
        phase: 'loop',
        frame: 0,
      })
      expect(travel(idleLoop, 'awe', clips)).toHaveLength(2)
      // Back to idle just as quickly, with no exit frames.
      const greeting: MelloCursor = { state: 'greet', phase: 'loop', frame: 5 }
      expect(stepCursor(clips, greeting, 'idle')).toEqual({
        state: 'idle',
        phase: 'loop',
        frame: 0,
      })
      const inAwe: MelloCursor = { state: 'awe', phase: 'loop', frame: 3 }
      expect(travel(inAwe, 'idle', clips).map((c) => c.state)).toEqual([
        'greet',
        'idle',
      ])
    }
  })

  it('turns the head a frame at a time toward the typing', () => {
    const clip = melloClips.watching
    const rest = clip.hold?.rest ?? 0
    let cursor: MelloCursor = { state: 'watching', phase: 'loop', frame: rest }
    const right = holdFrame(clip, 1)
    const seen: number[] = []
    while (cursor.frame !== right) {
      cursor = stepCursor(melloClips, cursor, 'watching', 1)
      seen.push(cursor.frame)
    }
    expect(seen).toEqual(
      Array.from({ length: right - rest }, (_, index) => rest + index + 1),
    )
    expect(stepCursor(melloClips, cursor, 'watching', 1)).toEqual(cursor)
  })

  it('straightens the head before going back to idle', () => {
    const tilted: MelloCursor = { state: 'watching', phase: 'loop', frame: 20 }
    const path = travel(tilted, 'idle')
    const rest = melloClips.watching.hold?.rest ?? 0
    const firstLeave = path.findIndex((c) => c.phase === 'leave')
    expect(path[firstLeave - 1]).toEqual({
      state: 'watching',
      phase: 'loop',
      frame: rest,
    })
  })

  it('goes from an idea straight into teaching', () => {
    const idea: MelloCursor = { state: 'idea', phase: 'loop', frame: 4 }
    const states = travel(idea, 'teaching').map((c) => c.state)
    expect(states).not.toContain('idle')
  })

  it('keeps every frame inside its strip', () => {
    for (const pet of petIds) {
      const clips = pets[pet].clips
      for (const state of melloStates) {
        const clip = clips[state]
        const total = clip.enter + clip.loop + clip.exit
        for (const phase of ['enter', 'loop', 'exit'] as const) {
          const count = clip[phase]
          for (let frame = 0; frame < count; frame += 1) {
            const index = stripIndex(clips, { state, phase, frame })
            expect(index).toBeGreaterThanOrEqual(0)
            expect(index).toBeLessThan(total)
          }
        }
      }
    }
  })
})
