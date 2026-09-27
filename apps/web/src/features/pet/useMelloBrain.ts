import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { useQueryClient, type Mutation } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'

import { coachSendMutationKey } from '@/features/coach/hooks'

import {
  currentPetActivity,
  onMelloSuccess,
  onPetActivity,
  onPetQuestion,
  onPetSay,
} from './mello-events'
import {
  resolveMelloState,
  sleepingAfterMs,
  type MelloState,
} from './mello-states'

function isCoachSend(key: readonly unknown[] | undefined) {
  return (
    key !== undefined &&
    key.length === coachSendMutationKey.length &&
    key.every((part, index) => part === coachSendMutationKey[index])
  )
}

const isOtherWork = (mutation: Mutation<unknown, unknown, unknown, unknown>) =>
  !isCoachSend(mutation.options.mutationKey)

// Typing keeps Mello watching until this long after the last key.
const typingLingerMs = 1_500
// Scrolling keeps the scroll pose going until this long after it stops.
const scrollLingerMs = 900
// Other app work shows as working only once it takes a moment.
const appBusyAfterMs = 800
// The head reaches its full tilt at this many characters.
const fullTiltChars = 100

export type PetRect = {
  left: number
  top: number
  width: number
  height: number
}

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type !== 'password') ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function textLength(target: HTMLElement) {
  if (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement
  ) {
    return target.value.length
  }
  return target.textContent?.length ?? 0
}

// Where the typing is, as a head tilt: toward the text box's side, further
// the longer the text grows.
function typingLean(target: HTMLElement, pet: PetRect) {
  const box = target.getBoundingClientRect()
  const side = box.left + box.width / 2 >= pet.left + pet.width / 2 ? 1 : -1
  return side * Math.min(1, textLength(target) / fullTiltChars)
}

export type MelloMind = {
  state: MelloState
  // Head tilt for the watching pose, -1 (left) to 1 (right).
  lean: number
}

// Decides Mello's pose from what the learner and the app are doing.
export function useMelloBrain({
  onPet,
  near,
  pet,
}: {
  onPet: boolean
  near: boolean
  pet: RefObject<PetRect>
}): MelloMind {
  const queryClient = useQueryClient()
  const { pathname } = useLocation()
  const [now, setNow] = useState(() => Date.now())
  const [busySince, setBusySince] = useState<number | null>(null)
  const [answeredAt, setAnsweredAt] = useState(Number.NEGATIVE_INFINITY)
  const [succeededAt, setSucceededAt] = useState(Number.NEGATIVE_INFINITY)
  const [appBusySince, setAppBusySince] = useState<number | null>(null)
  const [idleMs, setIdleMs] = useState(0)
  const [typingUntil, setTypingUntil] = useState(0)
  const [scrollingUntil, setScrollingUntil] = useState(0)
  const [lean, setLean] = useState(0)
  const [activity, setActivity] = useState(currentPetActivity)
  const [cue, setCue] = useState<{ state: MelloState; until: number } | null>(
    null,
  )
  const lastActivity = useRef(0)

  useEffect(
    () =>
      onPetActivity(() => {
        setActivity(currentPetActivity())
        lastActivity.current = Date.now()
        setIdleMs(0)
      }),
    [],
  )

  useEffect(
    () =>
      onPetSay((line) => {
        lastActivity.current = line.at
        setIdleMs(0)
        setNow(line.at)
        if (line.state !== undefined) {
          setCue({ state: line.state, until: line.at + (line.ms ?? 3_000) })
        }
      }),
    [],
  )

  // A hosted page assistant answering reads like a coach question. Only a
  // change counts, so a page opening with nothing pending is not an answer.
  useEffect(() => {
    let busy = false
    return onPetQuestion((next) => {
      if (next === busy) return
      busy = next
      const at = Date.now()
      lastActivity.current = at
      setIdleMs(0)
      setNow(at)
      if (next) {
        setBusySince(at)
        setAnsweredAt(Number.NEGATIVE_INFINITY)
      } else {
        setBusySince(null)
        setAnsweredAt(at)
      }
    })
  }, [])

  // Follow coach questions, from the panel or the Coach page, and any other
  // work the app is doing.
  useEffect(() => {
    const cache = queryClient.getMutationCache()
    return cache.subscribe((event) => {
      if (event.type !== 'updated') return
      const at = Date.now()
      if (isCoachSend(event.mutation.options.mutationKey)) {
        // A question or its answer keeps Mello awake: a long wait is not
        // the learner walking away.
        lastActivity.current = at
        setIdleMs(0)
        setNow(at)
        if (event.action.type === 'pending') {
          setBusySince(at)
          setAnsweredAt(Number.NEGATIVE_INFINITY)
        } else if (event.action.type === 'success') {
          setBusySince(null)
          setAnsweredAt(at)
        } else if (event.action.type === 'error') {
          setBusySince(null)
        }
        return
      }
      const working =
        queryClient.isMutating({ predicate: isOtherWork, status: 'pending' }) >
        0
      setAppBusySince((since) => (working ? (since ?? at) : null))
    })
  }, [queryClient])

  useEffect(
    () =>
      onMelloSuccess(() => {
        const at = Date.now()
        lastActivity.current = at
        setIdleMs(0)
        setNow(at)
        setSucceededAt(at)
      }),
    [],
  )

  // Any input is activity; it wakes Mello up.
  useEffect(() => {
    lastActivity.current = Date.now()
    const onActivity = () => {
      lastActivity.current = Date.now()
      setIdleMs(0)
    }
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const
    for (const name of events) {
      window.addEventListener(name, onActivity, { passive: true })
    }
    return () => {
      for (const name of events) window.removeEventListener(name, onActivity)
    }
  }, [])

  // Typing anywhere: Mello turns to watch the text box.
  useEffect(() => {
    const onInput = (event: Event) => {
      const target = event.target
      if (!isEditable(target) || !(target instanceof HTMLElement)) return
      // Typing in the pet's own chat is not the learner typing on the page.
      if (target.closest('[data-mello-ignore]')) return
      const at = Date.now()
      const lean = typingLean(target, pet.current)
      // A transition keeps this re-render out of the input event, so it
      // cannot reset a controlled input before React applies the keystroke.
      startTransition(() => {
        setNow(at)
        setTypingUntil(at + typingLingerMs)
        setLean(lean)
      })
    }
    document.addEventListener('input', onInput, true)
    return () => document.removeEventListener('input', onInput, true)
  }, [pet])

  // Scrolling the page or any panel in it: the pet plays its scroll pose.
  useEffect(() => {
    let last = 0
    const onScroll = (event: Event) => {
      // The pet's own chat scrolling is not the learner scrolling the page.
      if (
        event.target instanceof Element &&
        event.target.closest('[data-mello-ignore]')
      ) {
        return
      }
      const at = Date.now()
      // Scroll events fire every frame; a few updates a second are enough.
      if (at - last < 150) return
      last = at
      setNow(at)
      setScrollingUntil(at + scrollLingerMs)
    }
    document.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    })
    return () =>
      document.removeEventListener('scroll', onScroll, { capture: true })
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const at = Date.now()
      setNow(at)
      setIdleMs(Math.min(at - lastActivity.current, sleepingAfterMs))
    }, 250)
    return () => window.clearInterval(timer)
  }, [])

  const state = resolveMelloState({
    now,
    busySince,
    answeredAt,
    succeededAt,
    appBusy: appBusySince !== null && now - appBusySince >= appBusyAfterMs,
    onPet,
    near,
    typing: typingUntil > now,
    scrolling: scrollingUntil > now,
    inAwe: pathname === '/visualizer' || pathname.startsWith('/visualizer/'),
    idleMs,
    cued: cue !== null && cue.until > now ? cue.state : null,
    activity,
  })
  return { state, lean }
}
