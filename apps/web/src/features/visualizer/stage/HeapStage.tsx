import { AnimatePresence, motion } from 'motion/react'

import { cn } from '@/lib/utils'

import type { Cell, HeapView } from '../scene/types'
import { AnimatedText } from './primitives'

// A priority queue as the binary heap it really is: the tree, the array that
// stores it (item i has children 2i+1 and 2i+2), what this step pushed or
// popped, and the order the items will come out in.

const MAX_TREE = 31
const LEVEL_GAP = 62
const colourTransition = 'fill 0.25s ease, stroke 0.25s ease'

function nodeColours(cell: Cell, top: boolean) {
  if (top) {
    return {
      fill: 'var(--primary)',
      stroke: 'var(--primary)',
      text: 'var(--primary-foreground)',
    }
  }
  if (cell.state === 'new') {
    return {
      fill: 'color-mix(in oklab, var(--go) 55%, var(--card))',
      stroke: 'var(--go)',
      text: 'var(--foreground)',
    }
  }
  if (cell.state === 'changed') {
    return {
      fill: 'color-mix(in oklab, #f59e0b 35%, var(--card))',
      stroke: '#f59e0b',
      text: 'var(--foreground)',
    }
  }
  return {
    fill: 'var(--go-soft)',
    stroke: 'color-mix(in oklab, var(--go) 60%, var(--border))',
    text: 'var(--go-foreground)',
  }
}

function HeapTree({ view }: { view: HeapView }) {
  const shown = view.items.slice(0, MAX_TREE)
  const depth = shown.length === 0 ? 0 : Math.floor(Math.log2(shown.length))
  // Long items such as [9, 3] become pills instead of circles.
  const longest = Math.max(
    1,
    ...shown.map((cell) => Math.min(cell.text.length, 10)),
  )
  const width = longest > 3 ? longest * 7.5 + 18 : 40
  const svgWidth = Math.max(240, 2 ** depth * (width + 12) + 24)
  const position = (index: number) => {
    const level = Math.floor(Math.log2(index + 1))
    const offset = index + 1 - 2 ** level
    return {
      x: ((offset + 0.5) / 2 ** level) * svgWidth,
      y: 34 + level * LEVEL_GAP,
    }
  }
  const height = 34 + depth * LEVEL_GAP + 40
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <svg
        aria-label={`Heap tree of ${view.name}`}
        className="mx-auto block max-w-none"
        height={height}
        role="img"
        viewBox={`0 0 ${svgWidth} ${height}`}
        width={svgWidth}
      >
        {shown.map((_, index) => {
          if (index === 0) return null
          const from = position(Math.floor((index - 1) / 2))
          const to = position(index)
          return (
            <line
              key={`edge-${index}`}
              stroke="color-mix(in oklab, var(--foreground) 40%, transparent)"
              strokeWidth={1.5}
              x1={from.x}
              x2={to.x}
              y1={from.y}
              y2={to.y}
            />
          )
        })}
        <AnimatePresence initial={false}>
          {shown.map((cell, index) => {
            const point = position(index)
            const top = index === 0
            const colours = nodeColours(cell, top)
            return (
              <motion.g
                animate={{ x: point.x, y: point.y, opacity: 1, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: point.y - 30,
                  transition: { duration: 0.25 },
                }}
                initial={{
                  x: point.x,
                  y: point.y + 16,
                  opacity: 0,
                  scale: 0.6,
                }}
                key={cell.key}
              >
                <rect
                  height={36}
                  rx={18}
                  strokeWidth={2}
                  style={{
                    fill: colours.fill,
                    stroke: colours.stroke,
                    transition: colourTransition,
                  }}
                  width={width}
                  x={-width / 2}
                  y={-18}
                />
                <text
                  className="font-mono text-[12.5px] font-bold"
                  dominantBaseline="central"
                  style={{ fill: colours.text, transition: colourTransition }}
                  textAnchor="middle"
                >
                  {cell.text.length > 10
                    ? `${cell.text.slice(0, 9)}…`
                    : cell.text}
                </text>
                {top ? (
                  <text
                    className="fill-primary font-sans text-[10px] font-bold uppercase tracking-wide"
                    textAnchor="middle"
                    y={-24}
                  >
                    top
                  </text>
                ) : null}
              </motion.g>
            )
          })}
        </AnimatePresence>
        {/* Array indexes under each node, fixed to the slot, not the value. */}
        {shown.map((_, index) => {
          const point = position(index)
          return (
            <text
              className="fill-muted-foreground font-mono text-[9.5px]"
              key={`index-${index}`}
              textAnchor="middle"
              x={point.x}
              y={point.y + 29}
            >
              [{index}]
            </text>
          )
        })}
      </svg>
      {view.items.length > MAX_TREE ? (
        <p className="text-center text-[11px] text-muted-foreground">
          The first {MAX_TREE} of {view.length} items are drawn as a tree.
        </p>
      ) : null}
    </div>
  )
}

function HeapArray({ view }: { view: HeapView }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        Stored as an array (children of [i] are [2i+1] and [2i+2])
      </span>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-max gap-1">
          {view.items.map((cell, index) => (
            <motion.div
              className="flex flex-col items-center"
              key={cell.key}
              layout
            >
              <span
                className={cn(
                  'grid h-9 min-w-9 place-items-center rounded-lg border px-2 font-mono text-xs font-semibold transition-colors duration-200',
                  index === 0
                    ? 'border-primary bg-primary text-primary-foreground'
                    : cell.state === 'new'
                      ? 'border-go bg-go-soft text-go-foreground'
                      : cell.state === 'changed'
                        ? 'border-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-400/20 dark:text-amber-50'
                        : 'border-border bg-card text-foreground',
                )}
              >
                <AnimatedText text={cell.text} />
              </span>
              <span className="mt-0.5 font-mono text-[9.5px] text-muted-foreground">
                {index}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PopOrder({ order }: { order: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        Comes out in this order
      </span>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <ol className="flex min-w-max items-center gap-1">
          {order.map((text, index) => (
            <li className="flex items-center gap-1" key={`${index}-${text}`}>
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="text-xs text-muted-foreground"
                >
                  →
                </span>
              ) : null}
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold',
                  index === 0
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-secondary/50 text-foreground',
                )}
              >
                {text}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export function HeapStage({
  view,
  stepKey,
}: {
  view: HeapView
  stepKey: number
}) {
  const orderLabel =
    view.order === 'min'
      ? 'min-heap · the smallest item is on top'
      : view.order === 'max'
        ? 'max-heap · the largest item is on top'
        : 'the top item comes out first'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-7 flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-muted-foreground">
          {orderLabel}
        </span>
        <AnimatePresence initial={false} mode="popLayout">
          {view.pushed.length > 0 ? (
            <motion.span
              animate={{ opacity: 1, y: 0 }}
              className="rounded-full bg-go-soft px-2 py-0.5 font-mono font-semibold text-go-foreground"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0, y: 6 }}
              key={`push-${stepKey}`}
            >
              + pushed {view.pushed.join(', ')}
            </motion.span>
          ) : null}
          {view.popped.length > 0 ? (
            <motion.span
              animate={{ opacity: 1, y: 0 }}
              className="rounded-full bg-danger-soft px-2 py-0.5 font-mono font-semibold text-danger-foreground"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0, y: -6 }}
              key={`pop-${stepKey}`}
            >
              − popped {view.popped.join(', ')}
            </motion.span>
          ) : null}
        </AnimatePresence>
        <span className="ml-auto text-muted-foreground">
          {view.length} item{view.length === 1 ? '' : 's'}
        </span>
      </div>
      {view.items.length === 0 ? (
        <p className="grid h-24 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
          empty
        </p>
      ) : (
        <>
          <HeapTree view={view} />
          <HeapArray view={view} />
          {view.popOrder !== null && view.popOrder.length > 1 ? (
            <PopOrder order={view.popOrder} />
          ) : null}
        </>
      )}
    </div>
  )
}
