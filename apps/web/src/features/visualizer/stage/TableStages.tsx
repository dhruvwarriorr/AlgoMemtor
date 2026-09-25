import { AnimatePresence, motion } from 'motion/react'

import { cn } from '@/lib/utils'

import type {
  Cell,
  CubeView,
  GridView,
  MapView,
  QueueView,
  SetView,
  StackView,
} from '../scene/types'
import { AnimatedText, MoreNote, PointerTag } from './primitives'
import { cellStateClass, heat } from './styles'

// ---- 2D grids -----------------------------------------------------------------------

function gridCellClass(cell: Cell, maze: boolean) {
  if (maze) {
    if (cell.text === '#') return 'border-ink/70 bg-ink/85 text-ink-foreground'
    if (cell.text === '.' || cell.text === ' ')
      return 'border-border bg-card text-muted-foreground'
    return 'border-amber-400 bg-amber-100 text-amber-950 dark:bg-amber-400/20 dark:text-amber-50'
  }
  return cellStateClass[cell.state]
}

export function GridStage({ view }: { view: GridView }) {
  const size = view.colCount > 16 ? 28 : view.colCount > 10 ? 34 : 42
  const rowMarks = new Map<number, string[]>()
  for (const pointer of view.rowPointers) {
    rowMarks.set(pointer.index, [
      ...(rowMarks.get(pointer.index) ?? []),
      pointer.name,
    ])
  }
  const colMarks = new Map<number, string[]>()
  for (const pointer of view.colPointers) {
    colMarks.set(pointer.index, [
      ...(colMarks.get(pointer.index) ?? []),
      pointer.name,
    ])
  }
  const columns = Array.from({ length: view.colCount }, (_, index) => index)
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <table className="border-separate border-spacing-[3px]">
        <thead>
          <tr>
            <th aria-label="Row" className="w-8" />
            {columns.map((column) => (
              <th
                className="px-0 pb-0.5 text-center align-bottom font-mono text-[10px] font-medium text-muted-foreground"
                key={column}
                scope="col"
                style={{ width: size }}
              >
                <div className="flex flex-col items-center gap-0.5">
                  {(colMarks.get(column) ?? []).map((name) => (
                    <motion.span key={name} layoutId={`${view.id}:col:${name}`}>
                      <PointerTag name={name} tone="amber" />
                    </motion.span>
                  ))}
                  <span>{column}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row, r) => (
            <tr key={r}>
              <th
                className="pr-1 text-right font-mono text-[10px] font-medium text-muted-foreground"
                scope="row"
              >
                <div className="flex items-center justify-end gap-1">
                  {(rowMarks.get(r) ?? []).map((name) => (
                    <motion.span key={name} layoutId={`${view.id}:row:${name}`}>
                      <PointerTag name={name} />
                    </motion.span>
                  ))}
                  <span>{r}</span>
                </div>
              </th>
              {row.map((cell) => (
                <td className="p-0" key={cell.key}>
                  <div
                    className={cn(
                      'grid place-items-center rounded-md border font-mono text-xs font-semibold tabular-nums transition-colors duration-200',
                      gridCellClass(cell, view.maze),
                    )}
                    style={{
                      width: size,
                      height: size,
                      ...(cell.state === 'none' && view.numeric && !view.maze
                        ? { background: heat(cell.numeric, view.min, view.max) }
                        : {}),
                    }}
                    title={cell.text}
                  >
                    <AnimatedText
                      className="max-w-full px-0.5"
                      text={cell.text}
                    />
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {view.rowCount > view.rows.length ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Showing {view.rows.length} of {view.rowCount} rows.
        </p>
      ) : null}
    </div>
  )
}

// ---- 3D arrays ----------------------------------------------------------------------

export function CubeStage({
  view,
  isometric,
}: {
  view: CubeView
  isometric: boolean
}) {
  const cols = Math.max(1, ...view.layers.map((layer) => layer[0]?.length ?? 0))
  const rows = Math.max(1, ...view.layers.map((layer) => layer.length))
  const size = cols > 6 ? 26 : 34
  const layerWidth = cols * (size + 3)
  const layerHeight = rows * (size + 3)
  const layerColors = [
    'color-mix(in oklab, var(--primary) 16%, var(--card))',
    'color-mix(in oklab, #f59e0b 20%, var(--card))',
    'color-mix(in oklab, var(--go) 18%, var(--card))',
    'color-mix(in oklab, #a855f7 16%, var(--card))',
  ]
  const grid = (layer: Cell[][], k: number) => (
    <div
      className="grid gap-[3px] rounded-xl border border-border p-1.5 shadow-soft"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${size}px)`,
        background: layerColors[k % layerColors.length],
      }}
    >
      {layer.flat().map((cell) => (
        <div
          className={cn(
            'grid place-items-center rounded-[5px] border font-mono text-[11px] font-semibold tabular-nums transition-colors',
            cell.state === 'none'
              ? 'border-border/70 bg-card/80'
              : cellStateClass[cell.state],
          )}
          key={cell.key}
          style={{ width: size, height: size }}
          title={cell.text}
        >
          <AnimatedText text={cell.text} />
        </div>
      ))}
    </div>
  )
  if (!isometric) {
    return (
      <div className="flex flex-wrap gap-4 overflow-x-auto pb-1">
        {view.layers.map((layer, k) => (
          <div className="flex flex-col gap-1" key={k}>
            <span className="font-mono text-[11px] text-muted-foreground">
              {view.name}[{k}]
            </span>
            {grid(layer, k)}
          </div>
        ))}
      </div>
    )
  }
  const lift = 46
  return (
    <div
      className="relative mx-auto overflow-visible"
      style={{
        height: layerHeight * 0.75 + view.layers.length * lift + 60,
        width: layerWidth * 1.3 + 40,
        perspective: 1100,
      }}
    >
      <div
        className="absolute left-1/2 top-[45%]"
        style={{
          transform: 'translate(-50%, -50%) rotateX(56deg) rotateZ(-38deg)',
          transformStyle: 'preserve-3d',
        }}
      >
        {view.layers.map((layer, k) => (
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute left-0 top-0"
            initial={{ opacity: 0 }}
            key={k}
            style={{
              transform: `translate(-50%, -50%) translateZ(${(k - (view.layers.length - 1) / 2) * lift}px)`,
            }}
          >
            {grid(layer, k)}
            <span
              className="absolute -left-12 top-0 font-mono text-[10px] font-semibold text-muted-foreground"
              style={{ transform: 'rotateZ(38deg)' }}
            >
              [{k}]
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ---- stacks and queues -----------------------------------------------------------------

const MAX_STACK = 12

export function StackStage({ view }: { view: StackView }) {
  const shown = view.items.slice(-MAX_STACK)
  const hidden = view.items.length - shown.length
  return (
    <div className="flex items-end justify-center gap-3 py-1">
      <div className="flex flex-col items-center">
        <div className="relative flex min-h-24 w-32 flex-col-reverse items-stretch gap-1.5 rounded-b-xl border-x-2 border-b-2 border-foreground/25 px-2 pb-2 pt-6 sm:w-40">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((cell, index) => {
              const top = index === shown.length - 1
              return (
                <motion.div
                  animate={{ opacity: 1, y: 0, x: 0 }}
                  className={cn(
                    'relative grid h-9 place-items-center rounded-lg border font-mono text-sm font-semibold transition-colors',
                    top
                      ? 'border-go bg-go text-white shadow-soft dark:text-go-soft'
                      : cell.state === 'new'
                        ? cellStateClass.new
                        : 'border-go/40 bg-go-soft text-go-foreground',
                  )}
                  exit={{
                    opacity: 0,
                    y: -46,
                    x: 36,
                    transition: { duration: 0.28 },
                  }}
                  initial={{ opacity: 0, y: -46 }}
                  key={cell.key}
                  layout
                >
                  <AnimatedText className="max-w-full px-1" text={cell.text} />
                  {top ? (
                    <motion.span
                      className="absolute -left-[4.2rem] flex items-center gap-1 text-[11px] font-semibold text-foreground sm:-left-[4.6rem]"
                      layoutId={`${view.id}:top`}
                    >
                      Top <span aria-hidden="true">→</span>
                    </motion.span>
                  ) : null}
                </motion.div>
              )
            })}
          </AnimatePresence>
          {view.items.length === 0 ? (
            <span className="py-4 text-center text-xs text-muted-foreground">
              empty
            </span>
          ) : null}
        </div>
        <span className="mt-1.5 text-[11px] text-muted-foreground">
          {view.length} item{view.length === 1 ? '' : 's'}
          {hidden > 0 ? ` · ${hidden} more below` : ''} · push/pop at the top
        </span>
      </div>
    </div>
  )
}

const MAX_QUEUE = 14

export function QueueStage({ view }: { view: QueueView }) {
  const shown = view.items.slice(0, MAX_QUEUE)
  return (
    <div className="flex flex-col gap-2 overflow-x-auto pb-1">
      <div className="flex min-w-max items-center gap-2">
        <span className="flex w-16 shrink-0 flex-col items-end text-right text-[11px] font-semibold leading-tight text-foreground">
          Front
          <span className="font-normal text-muted-foreground">
            {view.double ? 'pop here' : 'dequeue ←'}
          </span>
        </span>
        <div className="relative flex min-h-14 min-w-44 items-center gap-1.5 rounded-full border-2 border-primary/30 bg-gradient-to-b from-primary/[0.08] to-primary/[0.02] px-3 py-2">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((cell, index) => (
              <motion.div
                animate={{ opacity: 1, x: 0, scale: 1 }}
                className={cn(
                  'grid h-10 min-w-10 place-items-center rounded-full border px-2.5 font-mono text-sm font-semibold transition-colors',
                  index === 0
                    ? 'border-primary bg-primary text-primary-foreground'
                    : cell.state === 'new'
                      ? cellStateClass.new
                      : 'border-primary/40 bg-card text-foreground',
                )}
                exit={{
                  opacity: 0,
                  x: -48,
                  scale: 0.7,
                  transition: { duration: 0.28 },
                }}
                initial={{ opacity: 0, x: 48, scale: 0.7 }}
                key={cell.key}
                layout
              >
                <AnimatedText text={cell.text} />
              </motion.div>
            ))}
          </AnimatePresence>
          {view.items.length === 0 ? (
            <span className="px-4 text-xs text-muted-foreground">empty</span>
          ) : null}
        </div>
        <span className="flex w-16 shrink-0 flex-col text-[11px] font-semibold leading-tight text-foreground">
          Back
          <span className="font-normal text-muted-foreground">
            {view.double ? 'push here' : '← enqueue'}
          </span>
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {view.length} item{view.length === 1 ? '' : 's'} · first in, first out
        {view.items.length > shown.length
          ? ` · ${view.items.length - shown.length} more at the back`
          : ''}
      </p>
    </div>
  )
}

// ---- sets and maps ---------------------------------------------------------------------

export function SetStage({ view }: { view: SetView }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-2xl border border-dashed border-border bg-secondary/30 p-2.5">
        <AnimatePresence initial={false} mode="popLayout">
          {view.items.map((cell) => (
            <motion.span
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                'rounded-full border px-2.5 py-1 font-mono text-xs font-semibold transition-colors',
                cellStateClass[cell.state === 'new' ? 'new' : 'none'],
              )}
              exit={{ opacity: 0, scale: 0.5 }}
              initial={{ opacity: 0, scale: 0.5 }}
              key={cell.key}
              layout
            >
              {cell.text}
            </motion.span>
          ))}
        </AnimatePresence>
        {view.items.length === 0 ? (
          <span className="px-1 text-xs text-muted-foreground">empty set</span>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {view.length} unique item{view.length === 1 ? '' : 's'}{' '}
        <MoreNote shown={view.items.length} total={view.length} />
      </p>
    </div>
  )
}

export function MapStage({ view }: { view: MapView }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] bg-secondary/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Key</span>
          <span>Value</span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          <AnimatePresence initial={false}>
            {view.entries.map((entry) => (
              <motion.div
                animate={{ opacity: 1, height: 'auto' }}
                className={cn(
                  'grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] items-center gap-2 border-t border-border px-3 py-1.5 font-mono text-xs transition-colors duration-300',
                  entry.state === 'new' && 'bg-go-soft text-go-foreground',
                  entry.state === 'changed' &&
                    'bg-amber-100 text-amber-950 dark:bg-amber-400/15 dark:text-amber-50',
                )}
                exit={{ opacity: 0, height: 0 }}
                initial={{ opacity: 0, height: 0 }}
                key={entry.key}
                layout="position"
              >
                <span className="truncate font-semibold">{entry.keyText}</span>
                <span className="min-w-0 truncate">
                  <span
                    aria-hidden="true"
                    className="mr-1.5 text-muted-foreground"
                  >
                    →
                  </span>
                  <AnimatedText text={entry.valueText} />
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          {view.entries.length === 0 ? (
            <p className="border-t border-border px-3 py-3 text-xs text-muted-foreground">
              empty
            </p>
          ) : null}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {view.length} entr{view.length === 1 ? 'y' : 'ies'}{' '}
        <MoreNote shown={view.entries.length} total={view.length} />
      </p>
    </div>
  )
}
