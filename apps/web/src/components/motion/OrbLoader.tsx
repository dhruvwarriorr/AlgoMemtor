import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

/*
 * The "thinking orbs" loader in its solving state, ported line for line from
 * the reference component (21st.dev, larsen66/thinking-orbs): a dot sphere
 * whose latitude bands twist in rubik-style quarter turns, depth-sorted and
 * shaded, with the reference's 64px tuning (speed 1.82, count 0.35,
 * size 1.05). Drawn on a 64px canvas and shown at 56px inside the glass pill.
 */

type Dot = {
  x: number
  y: number
  z: number
  r: number
  white: number
}

type Move = { axis: 0 | 1 | 2; lo: number; hi: number; ang: number }

const SIZE = 64
const SPEED = 1.82
// The rubik preset after the 64px count (0.35) and size (1.05) scaling:
// latitude rings and longitude density scale by sqrt(count), radii by size.
const LAT_RINGS = Math.max(2, Math.round(15 * Math.sqrt(0.35)))
const LON_DENSITY = Math.max(2, Math.round(40 * Math.sqrt(0.35)))
const MOVE_COUNT = 14
const R_BASE = 0.6 * 1.05
const R_DEPTH = 1.7 * 1.05
const R_ACTIVE = 0.3 * 1.05
const R_MIN = 0.3
const INK_FAR = 0.62
const INK_SPAN = 0.54
const SCALE = (SIZE / 300) ** 0.6
const MOVE_TIME = 0.42
const MOVE_PAUSE = 1.2

// The reference's deterministic hash.
function hash(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return value - Math.floor(value)
}

function rotator(
  yaw: number,
  pitch: number,
  cx: number,
  cy: number,
  scale: number,
) {
  const sp = Math.sin(pitch)
  const cp = Math.cos(pitch)
  const sy = Math.sin(yaw)
  const cy2 = Math.cos(yaw)
  return (x: number, y: number, z: number): [number, number, number] => {
    const rx = x * cy2 + z * sy
    const rz = -x * sy + z * cy2
    const ry = y * cp - rz * sp
    const depth = y * sp + rz * cp
    return [cx + rx * scale, cy - ry * scale, depth]
  }
}

// A fixed sequence of quarter turns, each on one axis-aligned slab.
const MOVES: Move[] = Array.from({ length: MOVE_COUNT }, (_, index) => {
  const axis = Math.min(2, Math.floor(hash(index, 2.3) * 3)) as Move['axis']
  const lo = -1 + 0.5 * Math.min(3, Math.floor(hash(index, 5.9) * 4))
  const direction = hash(index, 7.7) < 0.5 ? 1 : -1
  return { axis, lo, hi: lo + 0.5, ang: (direction * Math.PI) / 2 }
})

// How far each move has turned at `time`: the moves play forward, then undo
// in reverse, then pause.
function progress(time: number) {
  const cycle = 2 * MOVE_COUNT * MOVE_TIME + MOVE_PAUSE
  const local = time % cycle
  const amount = new Array<number>(MOVE_COUNT).fill(0)
  let active = -1
  if (local < 2 * MOVE_COUNT * MOVE_TIME) {
    const step = Math.floor(local / MOVE_TIME)
    const within = (local - step * MOVE_TIME) / MOVE_TIME
    const eased = 1 - (1 - Math.min(1, within / 0.7)) ** 3
    if (step < MOVE_COUNT) {
      for (let index = 0; index < step; index++) amount[index] = 1
      amount[step] = eased
      active = step
    } else {
      const undo = 2 * MOVE_COUNT - 1 - step
      for (let index = 0; index < undo; index++) amount[index] = 1
      amount[undo] = 1 - eased
      active = undo
    }
  }
  return { amount, active }
}

function twist(
  point: [number, number, number],
  state: ReturnType<typeof progress>,
): [number, number, number, boolean] {
  let [x, y, z] = point
  let moving = false
  for (let index = 0; index < MOVES.length; index++) {
    const turned = state.amount[index] ?? 0
    const move = MOVES[index]
    if (turned <= 0 || !move) continue
    const coordinate = move.axis === 0 ? x : move.axis === 1 ? y : z
    if (coordinate < move.lo || coordinate >= move.hi) continue
    if (index === state.active) moving = true
    const angle = move.ang * turned
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    if (move.axis === 0) {
      const nextY = y * cos - z * sin
      z = y * sin + z * cos
      y = nextY
    } else if (move.axis === 1) {
      const nextX = x * cos + z * sin
      z = -x * sin + z * cos
      x = nextX
    } else {
      const nextX = x * cos - y * sin
      y = x * sin + y * cos
      x = nextX
    }
  }
  return [x, y, z, moving]
}

function drawOrb(
  context: CanvasRenderingContext2D,
  time: number,
  dark: boolean,
) {
  const center = SIZE / 2
  const project = rotator(
    time * 0.55,
    0.35 + 0.1 * Math.sin(time * 0.9),
    center,
    center,
    (SIZE / 2) * 0.82,
  )
  const state = progress(time)
  const dots: Dot[] = []

  for (let ring = 0; ring <= LAT_RINGS; ring++) {
    const latitude = -Math.PI / 2 + (ring / LAT_RINGS) * Math.PI
    const cosLat = Math.cos(latitude)
    const sinLat = Math.sin(latitude)
    const count = Math.max(1, Math.round(Math.abs(cosLat) * LON_DENSITY))
    for (let index = 0; index < count; index++) {
      const longitude = (index / count) * 2 * Math.PI
      const [tx, ty, tz, moving] = twist(
        [cosLat * Math.cos(longitude), sinLat, cosLat * Math.sin(longitude)],
        state,
      )
      const [x, y, z] = project(tx, ty, tz)
      const depth = (z + 1) / 2
      dots.push({
        x,
        y,
        z,
        r: (R_BASE + R_DEPTH * depth + (moving ? R_ACTIVE : 0)) * SCALE,
        white: INK_FAR - INK_SPAN * depth - (moving ? 0.14 : 0),
      })
    }
  }

  dots.sort((left, right) => left.z - right.z)
  for (const dot of dots) {
    // A lower "white" value renders brighter on dark and darker on light.
    const white = Math.min(1, Math.max(0, dot.white))
    const shade = Math.round((dark ? 1 - white : white) * 255)
    context.fillStyle = `rgba(${shade},${shade},${shade},1)`
    context.beginPath()
    context.arc(dot.x, dot.y, Math.max(R_MIN, dot.r), 0, Math.PI * 2)
    context.fill()
  }
}

export function ThinkingOrb({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(SIZE * ratio)
    canvas.height = Math.round(SIZE * ratio)

    // Follows the app theme (a `.dark` ancestor), checked every frame so a
    // theme switch mid-load is picked up.
    const render = (time: number) => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, SIZE, SIZE)
      drawOrb(context, time, canvas.closest('.dark') !== null)
    }

    if (reduceMotion) {
      render(0.6)
      return
    }

    let frame = 0
    let running = false
    const tick = () => {
      render((performance.now() / 1000) * SPEED)
      if (running) frame = requestAnimationFrame(tick)
    }
    const start = () => {
      if (running) return
      running = true
      frame = requestAnimationFrame(tick)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }
    const onVisibility = () =>
      document.visibilityState === 'hidden' ? stop() : start()

    render((performance.now() / 1000) * SPEED)
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reduceMotion])

  return (
    <canvas
      aria-hidden="true"
      className={cn('block size-14 shrink-0', className)}
      ref={canvasRef}
    />
  )
}

// The orb in the reference's glass pill with its status line. Dark mode uses
// the reference's exact pill; light mode mirrors it.
export function OrbLoader({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex h-[74px] items-center gap-3 rounded-full pr-8 pl-[9px]',
        'bg-[rgba(255,255,255,0.72)] shadow-[inset_0_0_0_1px_rgba(16,16,18,0.08),inset_0_0_50px_0_rgba(16,16,18,0.02)]',
        'dark:bg-[rgba(29,29,29,0.42)] dark:shadow-[inset_0_0_0_1px_rgba(44,47,54,0.31),inset_0_0_50px_0_rgba(255,255,255,0.012)]',
        className,
      )}
    >
      <ThinkingOrb />
      <span className="text-lg leading-6 whitespace-nowrap text-[rgba(16,16,18,0.5)] dark:text-[rgba(251,251,251,0.5)]">
        {label}
      </span>
    </div>
  )
}
