import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'

import { useNotification } from '@/app/useNotification'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

import { MelloChatPanel } from './MelloChatPanel'
import { preloadPet } from './mello-preload'
import { MelloSprite } from './MelloSprite'
import { spriteFrame } from './mello-states'
import { setPetEnabled, usePetChoice, usePetEnabled } from './pet-preference'
import { pets, type Pet } from './pets'
import { useMelloBrain, type PetRect } from './useMelloBrain'

// Measured from the bottom-right corner, where the pet sits by default.
const positionKey = 'algomemtor-pet-position'
const margin = 8
const petWidth = spriteFrame.width
const petHeight = spriteFrame.height

type Position = { right: number; bottom: number }

function readPosition(): Position {
  try {
    const raw = window.localStorage.getItem(positionKey)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'right' in parsed &&
      'bottom' in parsed &&
      typeof parsed.right === 'number' &&
      typeof parsed.bottom === 'number'
    ) {
      return { right: parsed.right, bottom: parsed.bottom }
    }
  } catch {
    // Fall back to the default corner.
  }
  return { right: margin + 8, bottom: margin }
}

function savePosition(position: Position) {
  try {
    window.localStorage.setItem(positionKey, JSON.stringify(position))
  } catch {
    // The position then resets on reload.
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

function useViewport() {
  // The layout viewport, without scrollbars, matches fixed positioning.
  const read = () => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  })
  const [size, setSize] = useState(read)
  useEffect(() => {
    const onResize = () => setSize(read())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

const busyStates = new Set(['reading', 'thinking', 'working'])
// Moving the mouse anywhere greets the pet (a wink and a thumbs-up for
// Mello, a wave for the others); it stops as soon as the mouse rests.
const cursorRestMs = 250

function MelloPetBody({ pet }: { pet: Pet }) {
  const { notify } = useNotification()
  const viewport = useViewport()
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [near, setNear] = useState(false)
  const [position, setPosition] = useState(readPosition)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{
    x: number
    y: number
    from: Position
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  const setHover = (next: boolean) => setHovered(next)
  const toggle = () => setOpen(!open)

  useEffect(() => preloadPet(pet.clips), [pet])

  const right = clamp(
    position.right,
    margin,
    viewport.width - petWidth - margin,
  )
  const left = viewport.width - right - petWidth
  const bottom = clamp(
    position.bottom,
    margin,
    viewport.height - petHeight - margin,
  )

  // Where the pet is, for the brain's typing tilt.
  const rect = useRef<PetRect>({
    left: 0,
    top: 0,
    width: petWidth,
    height: petHeight,
  })
  const { state, lean } = useMelloBrain({
    onPet: hovered && !open,
    near: near && !open,
    pet: rect,
  })
  useEffect(() => {
    rect.current = {
      left,
      top: viewport.height - bottom - petHeight,
      width: petWidth,
      height: petHeight,
    }
  }, [left, bottom, viewport.height])
  useEffect(() => {
    let timer = 0
    const onMove = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      setNear(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setNear(false), cursorRestMs)
    }
    const onLeave = () => {
      window.clearTimeout(timer)
      setNear(false)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      from: { right, bottom },
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (!current.moved && Math.hypot(dx, dy) < 6) return
    if (!current.moved) {
      current.moved = true
      setDragging(true)
    }
    setPosition({
      right: current.from.right - dx,
      bottom: current.from.bottom - dy,
    })
  }

  function onPointerUp() {
    const current = drag.current
    drag.current = null
    if (!current?.moved) return
    suppressClick.current = true
    setDragging(false)
    savePosition({ right, bottom })
  }

  const close = useCallback(() => setOpen(false), [])
  const hide = useCallback(() => {
    setOpen(false)
    setPetEnabled(false)
    notify({
      title: `${pet.name} is hidden`,
      description: `Turn ${pet.name} back on in Settings, under Appearance.`,
    })
  }, [notify, pet.name])

  // The panel opens beside the pet, above when there is room.
  const panelWidth = Math.min(340, viewport.width - margin * 2)
  const petTop = viewport.height - bottom - petHeight
  const roomAbove = petTop - margin * 2
  const panelHeight = Math.min(
    460,
    Math.max(roomAbove, viewport.height - bottom - margin * 2),
  )
  const panelAbove = roomAbove >= Math.min(340, panelHeight)
  const onLeftHalf = left + petWidth / 2 < viewport.width / 2
  const panelLeft = clamp(
    onLeftHalf ? left : left + petWidth - panelWidth,
    margin,
    viewport.width - panelWidth - margin,
  )
  const showTag = !open && !dragging && (hovered || busyStates.has(state))

  return (
    <>
      {open ? (
        <div
          className="fixed z-50 animate-rise"
          style={{
            left: panelLeft,
            width: panelWidth,
            height: panelAbove ? Math.min(panelHeight, roomAbove) : panelHeight,
            ...(panelAbove
              ? { bottom: bottom + petHeight + margin }
              : { top: margin }),
          }}
        >
          <MelloChatPanel onClose={close} onHide={hide} pet={pet} />
        </div>
      ) : null}
      <div
        className="mello-arrive pointer-events-none fixed z-50"
        data-mello-ignore
        style={
          {
            right,
            bottom,
            width: petWidth,
            height: petHeight,
            '--pet-accent': pet.accent,
          } as CSSProperties
        }
      >
        <span className="mello-shadow" />
        {showTag ? (
          <span
            className={cn(
              'absolute -top-7 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium whitespace-nowrap text-foreground shadow-md',
              onLeftHalf ? 'left-2' : 'right-2',
            )}
          >
            <span className="font-semibold">{pet.name}</span>
            <span className="text-muted-foreground">
              {' · '}
              {pet.clips[state].label}
            </span>
          </span>
        ) : null}
        <button
          aria-expanded={open}
          aria-label={
            open
              ? `Close ${pet.name}, your AI coach`
              : `Ask ${pet.name}, your AI coach`
          }
          className={cn(
            'pointer-events-auto block size-full touch-none rounded-2xl outline-none select-none focus-visible:ring-2 focus-visible:ring-ring',
            dragging ? 'cursor-grabbing' : 'cursor-pointer',
          )}
          onBlur={() => setHover(false)}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false
              return
            }
            toggle()
          }}
          onFocus={(event) => {
            if (event.currentTarget.matches(':focus-visible')) setHover(true)
          }}
          onPointerCancel={onPointerUp}
          onPointerDown={onPointerDown}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') setHover(true)
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') setHover(false)
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          title={`Drag to move ${pet.name}`}
          type="button"
        >
          <MelloSprite
            clips={pet.clips}
            key={pet.id}
            lean={lean}
            state={state}
          />
        </button>
      </div>
    </>
  )
}

// Mello is the AI Coach's on-page body, shown on every signed-in page
// unless turned off in Settings.
export function MelloPet() {
  const enabled = usePetEnabled()
  const choice = usePetChoice()
  const { user } = useAuth()
  if (!enabled || user === null) return null
  return <MelloPetBody pet={pets[choice]} />
}
