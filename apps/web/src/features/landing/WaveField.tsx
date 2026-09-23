import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

// Landing background: a field of dots riding two slow traveling waves.
// Crests swell from sky blue into green, the cursor raises a local
// swell, and a click drops a "pebble" whose ring rolls through the field.

type Pebble = { x: number; y: number; born: number }

const SPACING = 26
const FRAME_MS = 1000 / 30
const CURSOR_RADIUS = 220
const BG = '#0a0a0b'

export function WaveField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const cursor = { x: -9999, y: -9999, tx: -9999, ty: -9999 }
    const pebbles: Pebble[] = []
    let width = 0
    let height = 0
    let frame = 0
    let last = 0
    const start = performance.now()

    // Height of the water surface at a point, roughly in [0, 1].
    function surface(x: number, y: number, t: number) {
      const a = Math.sin(x * 0.012 + y * 0.006 - t * 0.9)
      const b = Math.sin(x * -0.005 + y * 0.014 - t * 0.6 + 1.7)
      let h = (a * 0.6 + b * 0.4 + 1) / 2

      const d = Math.hypot(x - cursor.x, y - cursor.y)
      if (d < CURSOR_RADIUS) {
        const k = 1 - d / CURSOR_RADIUS
        h += k * k * 0.9
      }

      for (const p of pebbles) {
        const age = (t * 1000 - (p.born - start)) / 1000
        const ring = age * 320
        const dist = Math.hypot(x - p.x, y - p.y)
        const band = Math.abs(dist - ring)
        if (band < 60) {
          h += (1 - band / 60) * Math.max(0, 1 - age / 1.6) * 0.9
        }
      }
      return Math.min(h, 1.6)
    }

    function draw(now: number) {
      if (!ctx) return
      const t = (now - start) / 1000
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, width, height)

      for (let i = pebbles.length - 1; i >= 0; i--) {
        if (now - pebbles[i].born > 1600) pebbles.splice(i, 1)
      }

      for (let y = SPACING / 2; y < height; y += SPACING) {
        for (let x = SPACING / 2; x < width; x += SPACING) {
          const h = surface(x, y, t)
          const lift = Math.max(0, h - 0.55) / 1.05
          // A small vertical bob sells the "floating" feel.
          const dy = (h - 0.5) * -4
          const radius = 0.7 + h * 1.4
          if (lift > 0.08) {
            // Sky blue (56,189,248) at the foot of a crest, green (74,222,128)
            // at its peak.
            const k = Math.min(1, lift)
            ctx.fillStyle = `rgba(${Math.round(56 + k * 18)},${Math.round(189 + k * 33)},${Math.round(248 - k * 120)},${(0.12 + lift * 0.75).toFixed(3)})`
          } else {
            ctx.fillStyle = `rgba(255,255,255,${(0.05 + h * 0.1).toFixed(3)})`
          }
          ctx.beginPath()
          ctx.arc(x, y + dy, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    function loop(now: number) {
      frame = requestAnimationFrame(loop)
      if (now - last < FRAME_MS) return
      last = now
      cursor.x += (cursor.tx - cursor.x) * 0.15
      cursor.y += (cursor.ty - cursor.y) * 0.15
      draw(now)
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw(performance.now())
    }

    resize()
    window.addEventListener('resize', resize)

    // Reduced motion: one still frame of the field, no reactions.
    if (reduceMotion) {
      return () => window.removeEventListener('resize', resize)
    }

    function onPointerMove(event: PointerEvent) {
      if (cursor.x === -9999) {
        cursor.x = event.clientX
        cursor.y = event.clientY
      }
      cursor.tx = event.clientX
      cursor.ty = event.clientY
    }
    function onPointerLeave() {
      cursor.tx = cursor.ty = cursor.x = cursor.y = -9999
    }
    function onClick(event: MouseEvent) {
      pebbles.push({
        x: event.clientX,
        y: event.clientY,
        born: performance.now(),
      })
    }
    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(frame)
        frame = 0
      } else if (frame === 0) {
        frame = requestAnimationFrame(loop)
      }
    }

    frame = requestAnimationFrame(loop)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('click', onClick)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener(
        'pointerleave',
        onPointerLeave,
      )
      window.removeEventListener('click', onClick)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reduceMotion])

  return (
    <canvas
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      ref={canvasRef}
    />
  )
}
