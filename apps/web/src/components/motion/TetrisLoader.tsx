import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'
import { generateTetrisFrames, type TetrisFrames } from './tetris-frames'

const PALETTE = [
  'var(--tetris-1, oklch(0.797 0.134 211.5))',
  'var(--tetris-2, oklch(0.861 0.173 91.9))',
  'var(--tetris-3, oklch(0.709 0.159 293.5))',
  'var(--tetris-4, oklch(0.800 0.182 151.7))',
  'var(--tetris-5, oklch(0.711 0.166 22.2))',
  'var(--tetris-6, oklch(0.714 0.143 254.6))',
  'var(--tetris-7, oklch(0.758 0.159 55.9))',
] as const

type Size = number | string

const size = (value: Size) => (typeof value === 'number' ? `${value}px` : value)

export type TetrisLoaderProps = {
  columns?: number
  rows?: number
  cellSize?: Size
  gap?: Size
  speed?: number
  playing?: boolean
  loop?: boolean
  onComplete?: () => void
  label?: string
  colors?: readonly string[]
  flashColor?: string
  deadColor?: string
  cellClassName?: string
} & ComponentProps<'div'>

export function TetrisLoader({
  columns = 8,
  rows = 16,
  cellSize = 6,
  gap = 2,
  speed = 40,
  playing = true,
  loop = true,
  onComplete,
  label = 'Loading',
  colors = PALETTE,
  flashColor = 'var(--foreground)',
  deadColor = 'color-mix(in oklab, var(--foreground) 45%, transparent)',
  cellClassName,
  className,
  style,
  ...props
}: TetrisLoaderProps) {
  const width = Math.max(4, Math.round(columns))
  const height = Math.max(6, Math.round(rows))
  const frameDuration = Math.max(16, speed)
  const reduceMotion = useReducedMotion() === true
  const gridRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef(0)
  const completeRef = useRef(onComplete)
  const game = useMemo(
    () => generateTetrisFrames(width, height),
    [height, width],
  )

  useEffect(() => {
    completeRef.current = onComplete
  }, [onComplete])

  const paint = useCallback(
    (cells: HTMLDivElement[], frames: TetrisFrames, frameIndex: number) => {
      const board = frames[frameIndex]
      if (!board) return

      cells.forEach((cell, index) => {
        const value = board[index] ?? 0
        cell.style.backgroundColor = value ? `var(--tetris-cell-${value})` : ''
      })
    },
    [],
  )

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const cells = Array.from(grid.children) as HTMLDivElement[]
    frameRef.current = 0

    if (reduceMotion) {
      paint(cells, game, Math.floor(game.length * 0.55))
      return
    }

    paint(cells, game, frameRef.current)
    if (!playing) return

    let request = 0
    let last = performance.now()
    let owed = 0
    let currentGame = game

    const tick = (now: number) => {
      owed += now - last
      last = now
      if (owed > frameDuration * 4) owed = frameDuration

      let ended = false
      while (owed >= frameDuration) {
        owed -= frameDuration
        frameRef.current += 1
        if (frameRef.current >= currentGame.length) {
          ended = true
          break
        }
      }

      paint(
        cells,
        currentGame,
        Math.min(frameRef.current, currentGame.length - 1),
      )

      if (!ended) {
        request = requestAnimationFrame(tick)
        return
      }

      completeRef.current?.()
      if (loop) {
        currentGame = generateTetrisFrames(width, height)
        frameRef.current = 0
        paint(cells, currentGame, 0)
        request = requestAnimationFrame(tick)
      } else {
        frameRef.current = currentGame.length - 1
      }
    }

    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
  }, [frameDuration, game, height, loop, paint, playing, reduceMotion, width])

  const variables: Record<string, string> = {
    '--tetris-cell': size(cellSize),
    '--tetris-gap': size(gap),
    '--tetris-cell-8': flashColor,
    '--tetris-cell-9': deadColor,
  }
  for (let index = 0; index < 7; index += 1) {
    variables[`--tetris-cell-${index + 1}`] = colors[index] ?? PALETTE[index]
  }

  return (
    <div
      {...props}
      aria-busy={playing}
      aria-label={label}
      className={cn('grid w-fit', className)}
      ref={gridRef}
      role="status"
      style={{
        gridTemplateColumns: `repeat(${width}, var(--tetris-cell))`,
        gap: 'var(--tetris-gap)',
        ...variables,
        ...style,
      }}
    >
      {Array.from({ length: width * height }, (_, index) => (
        <div
          className={cn('bg-foreground/10', cellClassName)}
          data-tetris-cell=""
          key={index}
          style={{
            borderRadius: 'calc(var(--tetris-cell) / 3)',
            height: 'var(--tetris-cell)',
          }}
        />
      ))}
    </div>
  )
}

export default TetrisLoader
