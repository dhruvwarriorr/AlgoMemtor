import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

// Landing background: a still tide map. Soft contour lines of a liquid
// surface, deep blue in the troughs through sky to green on the crests. It
// stays put; only the pointer raises a faint swell that the nearest lines
// bend around, and the field settles again when the pointer leaves.

const BG = '#0a0a0b'
const STEP = 0.2
const CURSOR_RADIUS = 170
const CURSOR_LIFT = 0.32
// A fixed moment of the flowing field, so the map never drifts.
const T = 12

// Sky-to-green palette stops: trough, mid, crest.
const stops = [
  [30, 64, 175],
  [56, 189, 248],
  [74, 222, 128],
] as const

function tone(t: number) {
  const k = Math.min(1, Math.max(0, t))
  const [from, to, f] =
    k < 0.5
      ? [stops[0], stops[1], k / 0.5]
      : [stops[1], stops[2], (k - 0.5) / 0.5]
  return [0, 1, 2].map((index) =>
    Math.round(from[index] + (to[index] - from[index]) * f),
  )
}

export function TideField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const cursor = { x: 0, y: 0, tx: 0, ty: 0, strength: 0, target: 0 }
    let width = 0
    let height = 0
    let cell = 16
    let cols = 0
    let rows = 0
    let base = new Float32Array(0)
    let values = new Float32Array(0)
    let frame = 0

    // Height of the still surface at a point: broad, gently warped waves.
    function surface(x: number, y: number) {
      const nx = x * 0.0032
      const ny = y * 0.0032
      const wx = nx + 0.7 * Math.sin(ny * 1.5 + T * 0.19)
      const wy = ny + 0.7 * Math.sin(nx * 1.2 - T * 0.15)
      return (
        0.65 * Math.sin(wx * 2 + T * 0.22) * Math.cos(wy * 1.5 - T * 0.17) +
        0.35 * Math.sin((wx + wy) * 2.6 - T * 0.29)
      )
    }

    function draw() {
      if (!ctx) return
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, width, height)

      let low = Infinity
      let high = -Infinity
      const lift = cursor.strength * CURSOR_LIFT
      for (let j = 0; j <= rows; j += 1) {
        for (let i = 0; i <= cols; i += 1) {
          const index = j * (cols + 1) + i
          let value = base[index] ?? 0
          if (lift > 0.002) {
            const d = Math.hypot(i * cell - cursor.x, j * cell - cursor.y)
            if (d < CURSOR_RADIUS) {
              const k = 1 - d / CURSOR_RADIUS
              value += k * k * (3 - 2 * k) * lift
            }
          }
          values[index] = value
          if (value < low) low = value
          if (value > high) high = value
        }
      }

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (
        let level = Math.ceil(low / STEP);
        level <= Math.floor(high / STEP);
        level += 1
      ) {
        const iso = level * STEP
        const path = new Path2D()
        for (let j = 0; j < rows; j += 1) {
          const y0 = j * cell
          for (let i = 0; i < cols; i += 1) {
            const at = j * (cols + 1) + i
            const v0 = values[at] ?? 0
            const v1 = values[at + 1] ?? 0
            const v3 = values[at + cols + 1] ?? 0
            const v2 = values[at + cols + 2] ?? 0
            const code =
              (v0 > iso ? 8 : 0) |
              (v1 > iso ? 4 : 0) |
              (v2 > iso ? 2 : 0) |
              (v3 > iso ? 1 : 0)
            if (code === 0 || code === 15) continue
            const x0 = i * cell
            const edge = (side: number): [number, number] => {
              if (side === 0) return [x0 + (cell * (iso - v0)) / (v1 - v0), y0]
              if (side === 1)
                return [x0 + cell, y0 + (cell * (iso - v1)) / (v2 - v1)]
              if (side === 2)
                return [x0 + (cell * (iso - v3)) / (v2 - v3), y0 + cell]
              return [x0, y0 + (cell * (iso - v0)) / (v3 - v0)]
            }
            const segment = (a: number, b: number) => {
              const [ax, ay] = edge(a)
              const [bx, by] = edge(b)
              path.moveTo(ax, ay)
              path.lineTo(bx, by)
            }
            switch (code) {
              case 1:
              case 14:
                segment(2, 3)
                break
              case 2:
              case 13:
                segment(1, 2)
                break
              case 3:
              case 12:
                segment(1, 3)
                break
              case 4:
              case 11:
                segment(0, 1)
                break
              case 5:
                segment(0, 1)
                segment(2, 3)
                break
              case 6:
              case 9:
                segment(0, 2)
                break
              case 7:
              case 8:
                segment(0, 3)
                break
              case 10:
                segment(0, 3)
                segment(1, 2)
                break
            }
          }
        }
        const height01 = (iso + 1) / 2
        const [r, g, b] = tone(height01)
        const index = level % 4 === 0
        const alpha =
          (0.04 + 0.1 * Math.min(1, Math.max(0, height01))) * (index ? 1.5 : 1)
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`
        ctx.lineWidth = index ? 1.1 : 0.7
        ctx.stroke(path)
      }
    }

    // Eases the swell toward the pointer and stops once it has settled, so
    // nothing moves while the pointer is still.
    function settle() {
      frame = 0
      cursor.x += (cursor.tx - cursor.x) * 0.1
      cursor.y += (cursor.ty - cursor.y) * 0.1
      cursor.strength += (cursor.target - cursor.strength) * 0.08
      draw()
      const moving =
        Math.abs(cursor.tx - cursor.x) > 0.5 ||
        Math.abs(cursor.ty - cursor.y) > 0.5 ||
        Math.abs(cursor.target - cursor.strength) > 0.005
      if (moving) frame = requestAnimationFrame(settle)
    }
    function wake() {
      if (frame === 0) frame = requestAnimationFrame(settle)
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      cell = width < 640 ? 20 : 16
      cols = Math.ceil(width / cell)
      rows = Math.ceil(height / cell)
      base = new Float32Array((cols + 1) * (rows + 1))
      values = new Float32Array((cols + 1) * (rows + 1))
      for (let j = 0; j <= rows; j += 1) {
        for (let i = 0; i <= cols; i += 1) {
          base[j * (cols + 1) + i] = surface(i * cell, j * cell)
        }
      }
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    resize()
    window.addEventListener('resize', resize)

    // Reduced motion: the still map only, no swell.
    if (reduceMotion) {
      return () => window.removeEventListener('resize', resize)
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType !== 'mouse') return
      if (cursor.target === 0 && cursor.strength < 0.01) {
        cursor.x = event.clientX
        cursor.y = event.clientY
      }
      cursor.tx = event.clientX
      cursor.ty = event.clientY
      cursor.target = 1
      wake()
    }
    function onPointerLeave() {
      cursor.target = 0
      wake()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener(
        'pointerleave',
        onPointerLeave,
      )
    }
  }, [reduceMotion])

  return (
    <>
      <canvas
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
        ref={canvasRef}
      />
      {/* A vignette to hold the eye in the middle. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(10,10,11,0.8)_100%)]"
      />
    </>
  )
}
