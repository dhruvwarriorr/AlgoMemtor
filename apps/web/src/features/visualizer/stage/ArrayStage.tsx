import { AnimatePresence, motion } from 'motion/react'

import { cn } from '@/lib/utils'

import type { ArrayView, PointerMark } from '../scene/types'
import { AnimatedText, PointerTag } from './primitives'
import { cellStateClass } from './styles'

function slotWidth(count: number, text: boolean) {
  if (text) return count <= 24 ? 34 : 26
  if (count <= 10) return 56
  if (count <= 20) return 46
  if (count <= 40) return 36
  return 30
}

function barSlot(count: number) {
  if (count <= 12) return 50
  if (count <= 24) return 32
  if (count <= 48) return 16
  if (count <= 80) return 10
  return 7
}

// Pointers under the cells, stacked when several share an index.
function Pointers({
  pointers,
  slot,
  count,
}: {
  pointers: PointerMark[]
  slot: number
  count: number
}) {
  const rows = new Map<number, number>()
  const placed = pointers
    .filter((pointer) => pointer.index >= 0 && pointer.index <= count)
    .map((pointer) => {
      const row = rows.get(pointer.index) ?? 0
      rows.set(pointer.index, row + 1)
      return { ...pointer, row }
    })
  const depth = Math.max(1, ...[...rows.values()])
  return (
    <div
      aria-hidden="true"
      className="relative"
      style={{ height: 14 + depth * 22, width: Math.max(count, 1) * slot }}
    >
      <AnimatePresence initial={false}>
        {placed.map((pointer) => (
          <motion.div
            animate={{
              x: pointer.index * slot + slot / 2,
              y: pointer.row * 22,
              opacity: 1,
            }}
            className="absolute left-0 top-0 flex -translate-x-1/2 flex-col items-center"
            exit={{ opacity: 0 }}
            initial={{
              x: pointer.index * slot + slot / 2,
              y: pointer.row * 22 + 6,
              opacity: 0,
            }}
            key={pointer.name}
          >
            {pointer.row === 0 ? (
              <span className="text-[10px] leading-3 text-primary">▲</span>
            ) : null}
            <PointerTag
              name={
                pointer.index >= count ? `${pointer.name} (end)` : pointer.name
              }
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function Cells({ view }: { view: ArrayView }) {
  const slot = slotWidth(view.cells.length, view.text)
  const height = view.text ? 38 : 48
  const width = view.cells.length * slot
  const window = view.window
  return (
    <div className="relative" style={{ width: Math.max(width, slot) }}>
      {window !== null ? (
        <motion.div
          animate={{
            x: window[0] * slot + 1,
            width:
              (Math.min(window[1], view.cells.length - 1) - window[0] + 1) *
                slot -
              2,
          }}
          aria-hidden="true"
          className="absolute -top-1.5 left-0 rounded-xl border border-dashed border-primary/45 bg-primary/[0.07]"
          initial={false}
          style={{ height: height + 12 }}
        />
      ) : null}
      <div className="relative flex" style={{ height }}>
        <AnimatePresence initial={false} mode="popLayout">
          {view.cells.map((cell) => (
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="flex shrink-0 items-center justify-center"
              exit={{ opacity: 0, scale: 0.6 }}
              initial={{ opacity: 0, scale: 0.6 }}
              key={cell.key}
              layout
              style={{ width: slot, height }}
            >
              <div
                className={cn(
                  'grid h-full w-[calc(100%-6px)] place-items-center rounded-lg border font-mono font-semibold tabular-nums transition-colors duration-200',
                  view.text
                    ? 'text-sm'
                    : slot >= 46
                      ? 'text-[15px]'
                      : 'text-xs',
                  cellStateClass[cell.state],
                )}
                title={cell.text}
              >
                <AnimatedText className="max-w-full px-0.5" text={cell.text} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div aria-hidden="true" className="mt-1 flex">
        {view.cells.map((cell, index) => (
          <span
            className="shrink-0 text-center font-mono text-[10px] text-muted-foreground"
            key={cell.key}
            style={{ width: slot }}
          >
            {index}
          </span>
        ))}
      </div>
      <Pointers
        count={view.cells.length}
        pointers={view.pointers}
        slot={slot}
      />
    </div>
  )
}

function Bars({ view }: { view: ArrayView }) {
  const slot = barSlot(view.cells.length)
  const chart = 150
  const low = Math.min(0, view.min)
  const span = Math.max(1, view.max - low)
  const window = view.window
  const labels = view.cells.length <= 32
  return (
    <div style={{ width: view.cells.length * slot }}>
      <div className="relative flex items-end" style={{ height: chart + 18 }}>
        <AnimatePresence initial={false} mode="popLayout">
          {view.cells.map((cell, index) => {
            const value = cell.numeric ?? 0
            const height = Math.max(3, ((value - low) / span) * chart)
            const outside =
              window !== null && (index < window[0] || index > window[1])
            return (
              <motion.div
                className="flex shrink-0 flex-col items-center justify-end"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                key={cell.key}
                layout
                style={{ width: slot, height: chart + 18 }}
                title={`[${index}] = ${cell.text}`}
              >
                {labels ? (
                  <span className="mb-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {cell.text}
                  </span>
                ) : null}
                <motion.div
                  animate={{ height }}
                  className={cn(
                    'w-[calc(100%-2px)] rounded-t-[4px] transition-colors duration-200',
                    cell.state === 'write'
                      ? 'bg-amber-500'
                      : cell.state === 'read'
                        ? 'bg-primary'
                        : cell.state === 'changed' || cell.state === 'new'
                          ? 'bg-go'
                          : outside
                            ? 'bg-muted-foreground/25'
                            : window !== null
                              ? 'bg-go/70'
                              : 'bg-primary/45',
                  )}
                  initial={false}
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
      {labels ? (
        <div aria-hidden="true" className="mt-1 flex">
          {view.cells.map((cell, index) => (
            <span
              className="shrink-0 text-center font-mono text-[9px] text-muted-foreground"
              key={cell.key}
              style={{ width: slot }}
            >
              {index}
            </span>
          ))}
        </div>
      ) : null}
      <Pointers
        count={view.cells.length}
        pointers={view.pointers}
        slot={slot}
      />
    </div>
  )
}

export function ArrayStage({
  view,
  style,
}: {
  view: ArrayView
  style: 'cells' | 'bars'
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1 pt-2">
      {style === 'bars' && view.numeric ? (
        <Bars view={view} />
      ) : (
        <Cells view={view} />
      )}
    </div>
  )
}
