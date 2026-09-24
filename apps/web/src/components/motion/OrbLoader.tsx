import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

/*
 * The "thinking orbs" loader (composing state), reproduced from the
 * reference: a faint Fibonacci sphere of ghost dots wrapped by an undulating
 * multi-lane ribbon, depth-sorted and shaded, drawn on a 64px canvas and shown
 * at 56px inside a dark glass pill.
 */

type Dot = {
  x: number
  y: number
  z: number
  r: number
  white: number
  a: number
}

const SIZE = 64
const SPEED = 2.34
// Ribbon parameters for the 64px orb, after the reference's count (0.25) and
// size (0.85) scaling.
const GHOSTS = 38
const LANES = 3
const SEGMENTS = 44
const BAND_MUL = 3.9
const R_BASE = 1.1 * 0.85
const R_DEPTH = 1.7 * 0.85
const R_MIN = 0.3
const SCALE = (SIZE / 300) ** 0.6

function rotator(yaw: number, pitch: number, cx: number, cy: number) {
  const sp = Math.sin(pitch)
  const cp = Math.cos(pitch)
  const sy = Math.sin(yaw)
  const cy2 = Math.cos(yaw)
  return (x: number, y: number, z: number): [number, number, number] => {
    const rx = x * cy2 + z * sy
    const rz = -x * sy + z * cy2
    const ry = y * cp - rz * sp
    const depth = y * sp + rz * cp
    return [cx + rx, cy - ry, depth]
  }
}

function fibonacci(index: number, count: number): [number, number, number] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const y = 1 - (2 * (index + 0.5)) / count
  const radius = Math.sqrt(1 - y * y)
  const angle = index * golden
  return [radius * Math.cos(angle), y, radius * Math.sin(angle)]
}

function drawOrb(
  context: CanvasRenderingContext2D,
  time: number,
  dark: boolean,
) {
  const center = SIZE / 2
  const radius = (SIZE / 2) * 0.78
  const project = rotator(0, 0.3, center, center)
  const dots: Dot[] = []

  for (let index = 0; index < GHOSTS; index++) {
    const [fx, fy, fz] = fibonacci(index, GHOSTS)
    const [x, y, z] = project(fx * radius, fy * radius, fz * radius)
    const depth = (z / radius + 1) / 2
    dots.push({ x, y, z, r: 0.8 * SCALE, white: 0.78, a: 0.1 + 0.22 * depth })
  }

  // The ribbon's frame (the reference runs it with spin 0).
  const tilt = 0.55
  const ex = 1
  const ey = 0
  const ez = 0
  const fx = 0
  const fy = Math.cos(tilt)
  const fz = Math.sin(tilt)
  const nx = ey * fz - ez * fy
  const ny = ez * fx - ex * fz
  const nz = ex * fy - ey * fx
  const bands = Math.max(1, Math.round(LANES * BAND_MUL))
  const middle = (bands - 1) / 2

  for (let band = 0; band < bands; band++) {
    const offset = (band - middle) * 0.075
    const edge = Math.abs(band - middle) / Math.max(1, middle)
    for (let segment = 0; segment < SEGMENTS; segment++) {
      const angle = (segment / SEGMENTS) * 2 * Math.PI
      const wobble =
        0.16 * Math.sin(angle * 3 - time * 1.7 + band * 0.22) +
        0.07 * Math.sin(angle * 5 + time * 1.1)
      const lift = offset + wobble
      const px = ex * Math.cos(angle) + fx * Math.sin(angle) + nx * lift
      const py = ey * Math.cos(angle) + fy * Math.sin(angle) + ny * lift
      const pz = ez * Math.cos(angle) + fz * Math.sin(angle) + nz * lift
      const length = Math.sqrt(px * px + py * py + pz * pz)
      const [x, y, z] = project(
        (px / length) * radius,
        (py / length) * radius,
        (pz / length) * radius,
      )
      const depth = (z / radius + 1) / 2
      dots.push({
        x,
        y,
        z,
        r: (R_BASE + R_DEPTH * depth) * (1 - 0.25 * edge) * SCALE,
        white: 0.52 - 0.44 * depth + 0.18 * edge,
        a: 0.4 + 0.6 * depth,
      })
    }
  }

  dots.sort((left, right) => left.z - right.z)
  for (const dot of dots) {
    if (dot.a < 0.02) continue
    // In dark mode a lower "white" value renders brighter; in light mode the
    // same value renders darker, so the orb reads as ink on a light pill.
    const white = Math.min(1, Math.max(0, dot.white))
    const shade = Math.round((dark ? 1 - white : white) * 255)
    context.fillStyle = `rgba(${shade},${shade},${shade},${dot.a})`
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

// The orb in the reference's dark glass pill with its status line.
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
        'bg-[rgb(255_255_255/0.72)] shadow-[inset_0_0_0_1px_rgba(16,16,18,0.08),inset_0_0_50px_0_rgba(16,16,18,0.02)]',
        'dark:bg-[rgb(20_20_20/0.96)] dark:shadow-[inset_0_0_0_1px_rgba(44,47,54,0.31),inset_0_0_50px_0_rgba(255,255,255,0.012)]',
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
