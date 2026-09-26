import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import {
  frameDelay,
  spriteFrame,
  stepCursor,
  stripIndex,
  type MelloCursor,
  type MelloState,
  type PetClips,
} from './mello-states'
import { isSpriteReady, preloadSprite } from './mello-preload'
import './mello.css'

function paint(element: HTMLElement, clips: PetClips, cursor: MelloCursor) {
  const clip = clips[cursor.state]
  const frames = clip.enter + clip.loop + clip.exit
  element.style.backgroundImage = `url(${clip.src})`
  element.style.backgroundSize = `${frames * spriteFrame.width}px ${spriteFrame.height}px`
  element.style.backgroundPosition = `${-stripIndex(clips, cursor) * spriteFrame.width}px 0`
}

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Plays a pet frame by frame and eases between poses through their
// in-between frames. Each new frame fades in over the last one, so motion
// reads as smooth rather than stepped.
export function MelloSprite({
  clips,
  state,
  lean = 0,
  className,
}: {
  clips: PetClips
  state: MelloState
  // Head tilt for held poses, -1 to 1.
  lean?: number
  className?: string
}) {
  const under = useRef<HTMLSpanElement | null>(null)
  const over = useRef<HTMLSpanElement | null>(null)
  const target = useRef(state)
  const position = useRef(lean)
  const cursor = useRef<MelloCursor>({ state, phase: 'loop', frame: 0 })
  // Runs the next frame now instead of waiting out the current one.
  const stepNow = useRef<(() => void) | null>(null)

  useEffect(() => {
    position.current = lean
  }, [lean])

  useEffect(() => {
    target.current = state
    // Hover poses start and stop on the very next frame.
    if (clips[state].instant || clips[cursor.current.state].instant) {
      stepNow.current?.()
    }
    const node = over.current
    // Without motion, show the pose at rest and skip the in-betweens.
    if (node && reducedMotion()) {
      cursor.current = { state, phase: 'loop', frame: 0 }
      paint(node, clips, cursor.current)
    }
  }, [clips, state])

  useEffect(() => {
    const back = under.current
    const front = over.current
    if (!back || !front) return
    paint(front, clips, cursor.current)
    if (reducedMotion()) return
    let timer = 0
    const tick = () => {
      const next = stepCursor(
        clips,
        cursor.current,
        target.current,
        position.current,
      )
      const delay = frameDelay(clips, next)
      const src = clips[next.state].src
      // Hold the current frame until the next pose's sheet is decoded,
      // so a change never flashes empty.
      if (next.state === cursor.current.state || isSpriteReady(src)) {
        paint(back, clips, cursor.current)
        paint(front, clips, next)
        front.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: delay * 0.9,
          easing: 'ease-out',
        })
        cursor.current = next
      } else {
        preloadSprite(src)
      }
      timer = window.setTimeout(tick, delay)
    }
    timer = window.setTimeout(tick, frameDelay(clips, cursor.current))
    stepNow.current = () => {
      window.clearTimeout(timer)
      tick()
    }
    return () => {
      stepNow.current = null
      window.clearTimeout(timer)
    }
  }, [clips])

  return (
    <span
      aria-hidden="true"
      className={cn('mello-sprite', className)}
      style={{ width: spriteFrame.width, height: spriteFrame.height }}
    >
      <span className="mello-layer" ref={under} />
      <span className="mello-layer" ref={over} />
    </span>
  )
}
