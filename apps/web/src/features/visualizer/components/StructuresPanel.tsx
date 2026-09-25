import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import {
  accessIndexes,
  formatValue,
  pointersFor,
  shorten,
  windowRange,
  type Pointer,
} from '../analysis'
import type {
  ExecutionTrace,
  TraceFrame,
  TraceStep,
  TraceValue,
} from '../trace'

type Structure = {
  frame: TraceFrame
  name: string
  id: number
  value: TraceValue
  previous: TraceValue | undefined
}

const MAX_STRUCTURES = 10
const GRID_LIMIT = 24

function isScalar(value: TraceValue | undefined) {
  return (
    value !== undefined &&
    value.kind !== 'sequence' &&
    value.kind !== 'mapping' &&
    value.kind !== 'record'
  )
}

const MAX_GRID_TEXT = 64

// Rows of a grid: lists of scalars, or strings drawn as rows of characters.
function gridRow(
  trace: ExecutionTrace,
  id: number | undefined,
): string[] | null {
  const row = id === undefined ? undefined : trace.values[id]
  if (row === undefined) return null
  if (row.kind === 'string') {
    return row.length <= MAX_GRID_TEXT ? [...row.text] : null
  }
  if (row.kind !== 'sequence' || row.shape === 'set') return null
  if (!row.items.every((cell) => isScalar(trace.values[cell]))) return null
  return row.items.map((cell) => shorten(formatValue(trace, cell), 6))
}

function isGrid(trace: ExecutionTrace, value: TraceValue) {
  if (
    value.kind !== 'sequence' ||
    value.shape === 'set' ||
    value.items.length === 0
  ) {
    return false
  }
  return value.items.every((id) => gridRow(trace, id) !== null)
}

function previousValue(
  trace: ExecutionTrace,
  current: number,
  frame: number,
  name: string,
) {
  const previous = current > 0 ? trace.steps[current - 1] : undefined
  const id = previous?.frames
    .find((item) => item.id === frame)
    ?.vars.find(([key]) => key === name)?.[1]
  return id === undefined ? undefined : trace.values[id]
}

function collect(
  trace: ExecutionTrace,
  step: TraceStep,
  current: number,
): Structure[] {
  const top = step.frames.at(-1)
  const global = step.frames.find((frame) => frame.id === 0)
  const frames = [top, global].filter(
    (frame, index, list): frame is TraceFrame =>
      frame !== undefined && list.indexOf(frame) === index,
  )
  const structures: Structure[] = []
  for (const frame of frames) {
    for (const [name, id] of frame.vars) {
      const value = trace.values[id]
      if (value === undefined) continue
      const indexedString =
        value.kind === 'string' &&
        (trace.indexHints[name]?.length ?? 0) > 0 &&
        value.length <= 200
      if (
        value.kind === 'sequence' ||
        value.kind === 'mapping' ||
        indexedString
      ) {
        structures.push({
          frame,
          name,
          id,
          value,
          previous: previousValue(trace, current, frame.id, name),
        })
      }
    }
  }
  return structures
}

export function StructuresPanel({
  trace,
  current,
}: {
  trace: ExecutionTrace
  current: number
}) {
  const step = trace.steps[current]
  if (step === undefined) return null
  const structures = collect(trace, step, current)
  if (structures.length === 0) return null
  const shown = structures.slice(0, MAX_STRUCTURES)
  return (
    <section
      aria-labelledby="structures-heading"
      className="min-w-0 rounded-xl border border-border bg-card p-4"
    >
      <h2
        className="text-sm font-semibold text-foreground"
        id="structures-heading"
      >
        Data structures
      </h2>
      <Legend />
      <div className="mt-3 grid gap-5">
        {shown.map((structure) => (
          <StructureView
            key={`${structure.frame.id}:${structure.name}`}
            step={step}
            structure={structure}
            trace={trace}
          />
        ))}
      </div>
      {structures.length > shown.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {structures.length - shown.length} more containers are listed under
          Variables.
        </p>
      ) : null}
    </section>
  )
}

function Legend() {
  return (
    <ul
      aria-label="Legend"
      className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-muted-foreground"
    >
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-2.5 rounded-sm ring-2 ring-primary"
        />{' '}
        read
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-2.5 rounded-sm bg-amber-300 dark:bg-amber-400/60"
        />{' '}
        written or changed
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-2.5 rounded-sm bg-primary/20"
        />{' '}
        window between pointers
      </li>
    </ul>
  )
}

function StructureView({
  trace,
  step,
  structure,
}: {
  trace: ExecutionTrace
  step: TraceStep
  structure: Structure
}) {
  const { value, name, frame, previous } = structure
  const scope = frame.id === 0 ? 'global' : frame.name
  const reads = accessIndexes(step.reads, frame.id, name)
  const writes = accessIndexes(step.writes, frame.id, name)
  const heading = (
    <div className="mb-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2">
      <h3 className="font-mono text-[0.8rem] font-semibold text-foreground">
        {name}
      </h3>
      <span className="text-[0.7rem] text-muted-foreground">
        {value.kind === 'sequence' || value.kind === 'mapping'
          ? value.type
          : 'string'}
        {value.kind === 'sequence' || value.kind === 'mapping'
          ? ` · size ${value.length}`
          : ''}
        {' · '}
        {scope}
      </span>
    </div>
  )

  if (value.kind === 'string') {
    const cells = [...value.text]
    const previousCells =
      previous?.kind === 'string' ? [...previous.text] : undefined
    const pointers = pointersFor(trace, step.frames, frame, name, cells.length)
    return (
      <div className="min-w-0">
        {heading}
        <CellRow
          cells={cells.map((char, index) => ({
            text: char === ' ' ? '␣' : char,
            changed:
              previousCells !== undefined && previousCells[index] !== char,
          }))}
          label={name}
          pointers={pointers}
          reads={reads}
          total={value.length}
          writes={writes}
        />
      </div>
    )
  }

  if (value.kind === 'mapping') {
    const before =
      previous?.kind === 'mapping'
        ? new Map(
            previous.entries.map(([key, item]) => [
              formatValue(trace, key),
              item,
            ]),
          )
        : undefined
    const touched = new Set(
      [...reads, ...writes].map((path) => String(path[0])),
    )
    return (
      <div className="min-w-0">
        {heading}
        {value.entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Empty.</p>
        ) : (
          <div className="max-h-64 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left font-mono text-[0.78rem]">
              <thead className="sticky top-0 bg-secondary/80 text-[0.7rem] text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-1 font-medium" scope="col">
                    key
                  </th>
                  <th className="px-3 py-1 font-medium" scope="col">
                    value
                  </th>
                </tr>
              </thead>
              <tbody>
                {value.entries.map(([key, item]) => {
                  const keyText = formatValue(trace, key)
                  const changed =
                    before !== undefined && before.get(keyText) !== item
                  return (
                    <tr
                      className={cn(
                        'border-t border-border/60',
                        changed && 'bg-amber-100/80 dark:bg-amber-400/10',
                        touched.has(keyText) &&
                          'outline-2 -outline-offset-2 outline-primary',
                      )}
                      key={keyText}
                    >
                      <td className="px-3 py-1 text-foreground">
                        {shorten(keyText, 40)}
                      </td>
                      <td className="px-3 py-1 text-foreground">
                        {shorten(formatValue(trace, item), 60)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  if (value.kind !== 'sequence') return null

  if (isGrid(trace, value)) {
    return (
      <div className="min-w-0">
        {heading}
        <GridView
          name={name}
          previous={previous}
          reads={reads}
          trace={trace}
          value={value}
          writes={writes}
        />
      </div>
    )
  }

  const previousItems =
    previous?.kind === 'sequence' ? previous.items : undefined
  const cells = value.items.map((item, index) => ({
    text: shorten(formatValue(trace, item), 18),
    changed: previousItems !== undefined && previousItems[index] !== item,
  }))

  if (value.shape === 'stack') {
    return (
      <div className="min-w-0">
        {heading}
        <StackView cells={cells} />
      </div>
    )
  }

  if (value.shape === 'set') {
    return (
      <div className="min-w-0">
        {heading}
        {cells.length === 0 ? (
          <p className="text-xs text-muted-foreground">Empty.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {cells.map((cell, index) => (
              <li
                className={cn(
                  'rounded-full border border-border px-2.5 py-0.5 font-mono text-[0.78rem]',
                  cell.changed &&
                    'border-amber-500/50 bg-amber-100 dark:bg-amber-400/15',
                )}
                key={index}
              >
                {cell.text}
              </li>
            ))}
            {value.length > cells.length ? (
              <li className="px-1 text-xs text-muted-foreground">
                … {value.length - cells.length} more
              </li>
            ) : null}
          </ul>
        )}
      </div>
    )
  }

  const pointers =
    value.shape === 'array' || value.shape === 'deque'
      ? pointersFor(trace, step.frames, frame, name, value.length)
      : []
  const ends =
    value.shape === 'queue' || value.shape === 'deque'
      ? { first: 'front', last: 'back' }
      : value.shape === 'heap'
        ? { first: 'top', last: null }
        : null
  return (
    <div className="min-w-0">
      {heading}
      <CellRow
        cells={cells}
        ends={ends}
        label={name}
        pointers={pointers}
        reads={reads}
        total={value.length}
        writes={writes}
      />
    </div>
  )
}

type Cell = { text: string; changed: boolean }

function CellRow({
  label,
  cells,
  total,
  pointers,
  reads,
  writes,
  ends = null,
}: {
  label: string
  cells: Cell[]
  total: number
  pointers: Pointer[]
  reads: (number | string)[][]
  writes: (number | string)[][]
  ends?: { first: string; last: string | null } | null
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const readSet = new Set(reads.map((path) => path[0]))
  const writeSet = new Set(writes.map((path) => path[0]))
  const span = windowRange(pointers)
  const focus =
    [...writeSet, ...readSet].find(
      (item): item is number => typeof item === 'number',
    ) ??
    pointers[0]?.index ??
    null

  useEffect(() => {
    const container = scrollRef.current
    if (container === null || focus === null) return
    const cell = container.querySelector<HTMLElement>(`[data-index="${focus}"]`)
    if (cell === null) return
    const left = cell.offsetLeft
    const right = left + cell.offsetWidth
    if (left < container.scrollLeft + 24)
      container.scrollLeft = Math.max(0, left - 24)
    else if (right > container.scrollLeft + container.clientWidth - 24) {
      container.scrollLeft = right - container.clientWidth + 24
    }
  }, [focus])

  if (cells.length === 0 && total === 0) {
    return <p className="text-xs text-muted-foreground">Empty.</p>
  }
  const byIndex = new Map<number, string[]>()
  for (const pointer of pointers) {
    byIndex.set(pointer.index, [
      ...(byIndex.get(pointer.index) ?? []),
      pointer.name,
    ])
  }
  // A pointer one past the end (for example i == n) gets its own slot.
  const slots = Math.max(
    cells.length,
    ...pointers.map((pointer) =>
      pointer.index < total ? 0 : pointer.index + 1,
    ),
  )
  return (
    <div className="min-w-0 overflow-x-auto pb-1" ref={scrollRef}>
      <ol
        aria-label={`${label} elements`}
        className="flex w-max items-start gap-1 pt-1 pr-2"
      >
        {Array.from({ length: slots }, (_, index) => {
          const cell = cells[index]
          const names = byIndex.get(index)
          const inWindow = span !== null && index >= span[0] && index <= span[1]
          const read = readSet.has(index)
          const written = writeSet.has(index)
          return (
            <li
              className="flex w-11 shrink-0 flex-col items-center"
              data-index={index}
              key={index}
            >
              <span className="text-[0.62rem] text-muted-foreground tabular-nums">
                {endLabel(ends, index, cells.length) ?? index}
              </span>
              <span
                className={cn(
                  'mt-0.5 flex h-9 w-full items-center justify-center overflow-hidden rounded-md border px-0.5 font-mono text-[0.78rem] text-foreground transition-colors',
                  cell === undefined
                    ? 'border-dashed border-border/70 text-muted-foreground'
                    : 'border-border bg-background',
                  inWindow && cell !== undefined && 'bg-primary/12',
                  (written || cell?.changed === true) &&
                    'border-amber-500/60 bg-amber-200/80 dark:bg-amber-400/25',
                  read && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                )}
                title={cell?.text}
              >
                {cell === undefined ? (index >= total ? 'end' : '') : cell.text}
              </span>
              {names !== undefined ? (
                <span className="mt-0.5 flex flex-col items-center text-[0.68rem] leading-tight font-semibold text-primary">
                  <span aria-hidden="true">↑</span>
                  <span className="max-w-11 truncate font-mono">
                    {names.join(',')}
                  </span>
                </span>
              ) : null}
            </li>
          )
        })}
        {total > cells.length ? (
          <li className="flex h-full items-center self-center px-2 pt-4 text-xs whitespace-nowrap text-muted-foreground">
            … {total - cells.length} more
          </li>
        ) : null}
      </ol>
    </div>
  )
}

function endLabel(
  ends: { first: string; last: string | null } | null,
  index: number,
  count: number,
): string | null {
  if (ends === null) return null
  if (index === 0) return ends.first
  if (index === count - 1) return ends.last
  return null
}

function StackView({ cells }: { cells: Cell[] }) {
  if (cells.length === 0)
    return <p className="text-xs text-muted-foreground">Empty.</p>
  const reversed = [...cells].reverse()
  return (
    <ol
      aria-label="Stack, top first"
      className="flex max-h-56 w-40 flex-col gap-1 overflow-y-auto"
    >
      {reversed.map((cell, index) => (
        <li
          className={cn(
            'flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[0.78rem]',
            cell.changed &&
              'border-amber-500/60 bg-amber-200/80 dark:bg-amber-400/25',
          )}
          key={cells.length - index}
        >
          <span className="truncate">{cell.text}</span>
          {index === 0 ? (
            <span className="ml-2 text-[0.65rem] font-semibold text-primary">
              top
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

function GridView({
  trace,
  value,
  previous,
  reads,
  writes,
  name,
}: {
  trace: ExecutionTrace
  value: Extract<TraceValue, { kind: 'sequence' }>
  previous: TraceValue | undefined
  reads: (number | string)[][]
  writes: (number | string)[][]
  name: string
}) {
  const rows = value.items
    .slice(0, GRID_LIMIT)
    .map((id) => gridRow(trace, id) ?? [])
  const previousRows =
    previous?.kind === 'sequence'
      ? previous.items.map((id) => gridRow(trace, id) ?? [])
      : undefined
  const columns = Math.min(
    GRID_LIMIT,
    Math.max(...rows.map((row) => row.length)),
  )
  const key = (path: (number | string)[]) => `${path[0]}:${path[1]}`
  const readSet = new Set(reads.filter((path) => path.length >= 2).map(key))
  const writeSet = new Set(writes.filter((path) => path.length >= 2).map(key))
  const rowTouched = new Set([...reads, ...writes].map((path) => path[0]))
  return (
    <div className="min-w-0 overflow-auto">
      <table
        aria-label={`${name} grid`}
        className="border-separate border-spacing-0.5 font-mono text-[0.72rem]"
      >
        <thead>
          <tr>
            <th className="sr-only" scope="col">
              row
            </th>
            {Array.from({ length: columns }, (_, column) => (
              <th
                className="px-1 text-center font-normal text-muted-foreground"
                key={column}
                scope="col"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              <th
                className={cn(
                  'pr-1 text-right font-normal text-muted-foreground',
                  rowTouched.has(r) && 'font-semibold text-primary',
                )}
                scope="row"
              >
                {r}
              </th>
              {Array.from({ length: columns }, (_, c) => {
                const cell = row[c]
                const changed =
                  previousRows !== undefined && cell !== previousRows[r]?.[c]
                const cellKey = `${r}:${c}`
                return (
                  <td
                    className={cn(
                      'h-7 min-w-7 rounded border border-border bg-background px-1 text-center text-foreground',
                      cell === undefined && 'border-dashed bg-transparent',
                      (changed || writeSet.has(cellKey)) &&
                        cell !== undefined &&
                        'border-amber-500/60 bg-amber-200/80 dark:bg-amber-400/25',
                      readSet.has(cellKey) && 'outline-2 outline-primary',
                    )}
                    key={c}
                  >
                    {cell ?? ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {value.length > rows.length || columns === GRID_LIMIT ? (
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          Showing up to {GRID_LIMIT} rows and columns.
        </p>
      ) : null}
    </div>
  )
}
