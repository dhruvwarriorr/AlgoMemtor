import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLocation } from 'react-router-dom'

import { useNotification } from '@/app/useNotification'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

import { MelloChatPanel } from './MelloChatPanel'
import {
  DEFAULT_PANEL_SIZE,
  isExpanded,
  LARGE_PANEL_SIZE,
  MIN_PANEL_SIZE,
  readPanelSize,
  savePanelSize,
  type PanelSize,
} from './panel-size'
import { onPetSay, petSay, type PetSaid } from './mello-events'
import { PetAssistantPanel } from './PetAssistantPanel'
import { usePetAssistant } from './pet-assistant'
import { routeLine } from './pet-lines'
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

// Each page greets once per tab session.
const spokenKey = 'algomemtor-pet-spoken'

function spokenRoutes(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(spokenKey)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [],
    )
  } catch {
    return new Set()
  }
}

function rememberSpoken(route: string) {
  try {
    const spoken = spokenRoutes()
    spoken.add(route)
    window.sessionStorage.setItem(spokenKey, JSON.stringify([...spoken]))
  } catch {
    // Without storage the pet may greet a page again next visit.
  }
}

// The latest thing the pet said, while it is still showing.
function usePetSpeech(open: boolean) {
  const { pathname } = useLocation()
  const [line, setLine] = useState<PetSaid | null>(null)

  useEffect(() => onPetSay(setLine), [])

  useEffect(() => {
    if (line === null) return
    const timer = window.setTimeout(
      () => setLine((current) => (current?.id === line.id ? null : current)),
      line.ms ?? 4_200,
    )
    return () => window.clearTimeout(timer)
  }, [line])

  // A short hello the first time each page is opened in this tab.
  useEffect(() => {
    const said = routeLine(pathname)
    const route = pathname.split('/').slice(0, 3).join('/')
    if (said === null || spokenRoutes().has(route)) return
    const timer = window.setTimeout(() => {
      rememberSpoken(route)
      petSay(said)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [pathname])

  return open ? null : line
}

function MelloPetBody({ pet }: { pet: Pet }) {
  const { notify } = useNotification()
  const viewport = useViewport()
  const reduceMotion = useReducedMotion()
  // A page assistant (Doubt Helper, Solution Explorer) the pet hosts; its
  // page decides when it is open.
  const assistant = usePetAssistant()
  const [ownOpen, setOwnOpen] = useState(false)
  const open = assistant === null ? ownOpen : assistant.open
  const setOpen = useCallback(
    (next: boolean) => {
      if (assistant === null) setOwnOpen(next)
      else assistant.onOpenChange(next)
    },
    [assistant],
  )
  const [hovered, setHovered] = useState(false)
  const [near, setNear] = useState(false)
  const [position, setPosition] = useState(readPosition)
  // The learner's chosen chat box size, kept within the window below.
  const [panelSize, setPanelSize] = useState<PanelSize>(readPanelSize)
  const resize = useRef<{ x: number; y: number; from: PanelSize } | null>(null)
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
  const speech = usePetSpeech(open || dragging)
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

  const close = useCallback(() => setOpen(false), [setOpen])
  const hide = useCallback(() => {
    setOpen(false)
    setPetEnabled(false)
    notify({
      title: `${pet.name} is hidden`,
      description: `Turn ${pet.name} back on in Settings, under Appearance.`,
    })
  }, [notify, pet.name, setOpen])

  // The panel opens beside the pet, above when there is room, at the
  // learner's chosen size.
  const panelWidth = Math.min(panelSize.width, viewport.width - margin * 2)
  const petTop = viewport.height - bottom - petHeight
  const roomAbove = petTop - margin * 2
  const panelHeight = Math.min(
    panelSize.height,
    Math.max(roomAbove, viewport.height - bottom - margin * 2),
  )
  const panelAbove = roomAbove >= Math.min(340, panelHeight)
  const onLeftHalf = left + petWidth / 2 < viewport.width / 2
  const panelLeft = clamp(
    onLeftHalf ? left : left + petWidth - panelWidth,
    margin,
    viewport.width - panelWidth - margin,
  )
  const expanded = isExpanded(panelSize)
  const toggleSize = () => {
    const next = expanded ? DEFAULT_PANEL_SIZE : LARGE_PANEL_SIZE
    setPanelSize(next)
    savePanelSize(next)
  }
  // Dragging the corner away from the pet grows the box; toward it shrinks.
  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    try {
      // Keeps the drag going when the pointer leaves the small grip.
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Capture is best effort.
    }
    resize.current = {
      x: event.clientX,
      y: event.clientY,
      from: { width: panelWidth, height: panelHeight },
    }
  }
  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const start = resize.current
    if (start === null) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    setPanelSize({
      width: clamp(
        start.from.width + (onLeftHalf ? dx : -dx),
        MIN_PANEL_SIZE.width,
        viewport.width - margin * 2,
      ),
      height: clamp(
        start.from.height + (panelAbove ? -dy : dy),
        MIN_PANEL_SIZE.height,
        viewport.height - margin * 2,
      ),
    })
  }
  const endResize = () => {
    if (resize.current === null) return
    resize.current = null
    setPanelSize((size) => {
      savePanelSize(size)
      return size
    })
  }
  const showTag =
    !open && !dragging && speech === null && (hovered || busyStates.has(state))

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
          {assistant === null ? (
            <MelloChatPanel
              expanded={expanded}
              onClose={close}
              onHide={hide}
              onToggleSize={toggleSize}
              pet={pet}
            />
          ) : (
            <PetAssistantPanel
              assistant={assistant}
              expanded={expanded}
              onClose={close}
              onHide={hide}
              onToggleSize={toggleSize}
              pet={pet}
            />
          )}
          {/* Resize grip on the corner that points into the page. */}
          <div
            aria-hidden="true"
            className={cn(
              'absolute z-10 size-4 touch-none',
              panelAbove ? 'top-0' : 'bottom-0',
              onLeftHalf ? 'right-0' : 'left-0',
              panelAbove === onLeftHalf
                ? 'cursor-nesw-resize'
                : 'cursor-nwse-resize',
            )}
            onPointerCancel={endResize}
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            title="Drag to resize"
          >
            <svg
              className={cn(
                'size-4 text-muted-foreground/70',
                panelAbove ? '' : 'scale-y-[-1]',
                onLeftHalf ? '' : 'scale-x-[-1]',
              )}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth={1.5}
              viewBox="0 0 16 16"
            >
              <path d="M5 2h9v9M9 2h5v5" />
            </svg>
          </div>
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
        <AnimatePresence>
          {speech !== null ? (
            <motion.span
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                'absolute bottom-full mb-2 w-max max-w-[15rem] rounded-2xl border border-border bg-card px-3 py-2 text-[0.8rem] leading-5 text-foreground',
                onLeftHalf
                  ? 'left-2 origin-bottom-left rounded-bl-md'
                  : 'right-2 origin-bottom-right rounded-br-md',
              )}
              exit={{ opacity: 0, y: 4, scale: 0.9 }}
              initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.85 }}
              key={speech.id}
              role="status"
              transition={{ type: 'spring', stiffness: 460, damping: 26 }}
            >
              <span className="font-semibold">{pet.name}</span>
              <span className="text-muted-foreground"> · </span>
              {speech.message}
            </motion.span>
          ) : null}
        </AnimatePresence>
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
              ? `Close ${pet.name}`
              : assistant === null
                ? `Ask ${pet.name}`
                : `Ask ${pet.name} about ${assistant.subtitle ?? 'this page'}`
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

// The coach's on-page body (named after the chosen pet), shown on every
// signed-in page unless turned off in Settings. It hosts a page's own
// assistant when the page has one.
export function MelloPet() {
  const enabled = usePetEnabled()
  const choice = usePetChoice()
  const { user } = useAuth()
  if (!enabled || user === null) return null
  return <MelloPetBody pet={pets[choice]} />
}
