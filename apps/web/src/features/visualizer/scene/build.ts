// Builds the scene for one step: which variables become which pictures.
// Classification uses the recorded value shapes (sequence shape, nesting,
// object links) and, only where a shape is ambiguous, the variable's name
// (a Python list called `stack` is drawn as a stack).

import {
  accessIndexes,
  changesAt,
  formatValue,
  pointersFor,
  shorten,
  windowRange,
} from '../analysis'
import type {
  ExecutionTrace,
  TraceAccess,
  TraceFrame,
  TraceStep,
  TraceValue,
} from '../trace'
import { itemIdentity, stableKeys, type KeyMode } from './keys'
import { graphLayout, inorderTree, tidyTree } from './layout'
import { narrate } from './narrate'
import type {
  Cell,
  CellState,
  GraphNodeState,
  GraphView,
  ListView,
  MapEntryView,
  NodeView,
  PointerMark,
  ScalarChip,
  Scene,
  StructureView,
  TreeView,
} from './types'

const MAX_CELLS = 120
const MAX_GRID_ROWS = 40
const MAX_GRID_COLS = 40
const MAX_GRAPH_NODES = 80
const MAX_STRUCTURES = 12
const BARS_AFTER = 10

type Variable = {
  frame: TraceFrame
  name: string
  id: number
  value: TraceValue
  global: boolean
  // Belongs to the entry function (main) while another function runs: only
  // its structures are drawn, so the whole tree or array stays in view.
  outer: boolean
}

const stackNames = /^(st|stk|stack|stck|stak|s_?stack|monostack|mono)\d*$/i
const queueNames = /^(q|qu|queue|bfs|frontier)\d*$/i
const graphNames =
  /^(adj|adjacency|adj_?list|graph|g|gr|edges?|neighbou?rs|nbrs|children|tree|al|e)\d*$/i
const edgeListNames = /^(edges?|edge_?list|el)\d*$/i
const visitedNames =
  /^(vis|visited|seen|used|marked|done|explored|inq|in_?queue|taken|was)\d*$/i
const badgeNames =
  /^(dist|distance|d|depth|level|lvl|cost|dp|low|tin|disc|color|colour|col|comp|component|indeg|indegree|parent|par|p)\d*$/i
const currentNames = /^(u|node|cur|curr|current|at|src|top|x)$/i
const neighborNames = /^(v|nb|nei|next|nxt|to|child|y)$/i

const linkNames = {
  left: /^(left|l|lc|lchild|left_?child|leftChild)$/i,
  right: /^(right|r|rc|rchild|right_?child|rightChild)$/i,
  next: /^(next|nxt|succ|link|forward|nextNode|next_node)$/i,
  prev: /^(prev|previous|pred|back|prevNode|prev_node)$/i,
  parent: /^(parent|par|up)$/i,
  children: /^(children|kids|child|adj|next_nodes|nodes|sons)$/i,
}
const labelFields = [
  'val',
  'value',
  'key',
  'data',
  'v',
  'x',
  'item',
  'info',
  'num',
  'id',
  'name',
  'ch',
  'c',
]

function numberOf(value: TraceValue | undefined): number | null {
  if (value === undefined) return null
  if (value.kind === 'number') {
    const parsed = Number(value.text)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (value.kind === 'bool') return value.value ? 1 : 0
  if (value.kind === 'char') return null
  return null
}

function isScalar(value: TraceValue | undefined) {
  return (
    value !== undefined &&
    (value.kind === 'number' ||
      value.kind === 'bool' ||
      value.kind === 'char' ||
      value.kind === 'string' ||
      value.kind === 'none' ||
      value.kind === 'unset' ||
      value.kind === 'opaque')
  )
}

function isPairLike(value: TraceValue | undefined): boolean {
  if (value === undefined) return false
  if (value.kind === 'sequence' && value.shape === 'tuple') return true
  return (
    value.kind === 'record' &&
    value.objectId === undefined &&
    (value.type.startsWith('pair') ||
      value.type.startsWith('tuple') ||
      value.type.startsWith('Map.Entry') ||
      value.type.startsWith('array'))
  )
}

function componentsOf(
  trace: ExecutionTrace,
  value: TraceValue | undefined,
): (TraceValue | undefined)[] {
  if (value === undefined) return []
  if (value.kind === 'sequence')
    return value.items.map((id) => trace.values[id])
  if (value.kind === 'record')
    return value.fields.map(([, id]) => trace.values[id])
  return []
}

function cellText(trace: ExecutionTrace, id: number, max = 10): string {
  const value = trace.values[id]
  if (value?.kind === 'string' && value.length <= max) return value.text
  if (value?.kind === 'char') return value.text === ' ' ? '␠' : value.text
  const text = formatValue(trace, id)
  if (value?.kind === 'number' && /e\+?\d+$/i.test(text) === false) {
    const n = Number(text)
    if (Math.abs(n) >= 1e15) return n > 0 ? '∞' : '-∞'
    if (Math.abs(n) >= 1e9 && Number.isInteger(n) && text.length > 9) {
      return n > 0 ? '∞' : '-∞'
    }
  }
  if (text === 'inf' || text === 'Infinity') return '∞'
  if (text === '-inf' || text === '-Infinity') return '-∞'
  return shorten(text, max)
}

// ---- variables and previous values ------------------------------------------------

function variablesAt(trace: ExecutionTrace, step: TraceStep): Variable[] {
  const top = step.frames.at(-1)
  const global = step.frames.find((frame) => frame.id === 0)
  const entry = step.frames.find(
    (frame) => frame.id !== 0 && frame.elided !== true,
  )
  const frames = [top, entry, global].filter(
    (frame, index, list): frame is TraceFrame =>
      frame !== undefined && list.indexOf(frame) === index,
  )
  const variables: Variable[] = []
  for (const frame of frames) {
    for (const [name, id] of frame.vars) {
      const value = trace.values[id]
      if (value === undefined) continue
      variables.push({
        frame,
        name,
        id,
        value,
        global: frame.id === 0 && frame !== top,
        outer: frame === entry && frame !== top,
      })
    }
  }
  return variables
}

function valueAt(
  trace: ExecutionTrace,
  index: number,
  frame: number,
  name: string,
): number | undefined {
  const step = trace.steps[index]
  return step?.frames
    .find((item) => item.id === frame)
    ?.vars.find(([key]) => key === name)?.[1]
}

function accessesFor(
  step: TraceStep,
  frame: number,
  name: string,
): { reads: (number | string)[][]; writes: (number | string)[][] } {
  return {
    reads: accessIndexes(step.reads, frame, name),
    writes: accessIndexes(step.writes, frame, name),
  }
}

function pathMatches(path: (number | string)[], prefix: (number | string)[]) {
  return prefix.every((part, index) => String(path[index]) === String(part))
}

function stateOf(
  path: (number | string)[],
  access: { reads: (number | string)[][]; writes: (number | string)[][] },
  changed: boolean,
  fresh: boolean,
): CellState {
  if (
    access.writes.some(
      (item) => item.length === path.length && pathMatches(item, path),
    )
  ) {
    return 'write'
  }
  if (
    access.reads.some(
      (item) => item.length === path.length && pathMatches(item, path),
    )
  ) {
    return 'read'
  }
  if (fresh) return 'new'
  return changed ? 'changed' : 'none'
}

// ---- keys ----------------------------------------------------------------------------

function itemsOf(
  trace: ExecutionTrace,
  frame: number,
  name: string,
  mode: 'items' | 'entries',
) {
  return (step: number): string[] | null => {
    const id = valueAt(trace, step, frame, name)
    const value = id === undefined ? undefined : trace.values[id]
    if (mode === 'entries') {
      if (value?.kind !== 'mapping') return null
      return value.entries.map(([key]) => itemIdentity(trace, key))
    }
    if (value?.kind === 'sequence') {
      return value.items
        .slice(0, MAX_CELLS)
        .map((id) => itemIdentity(trace, id))
    }
    if (value?.kind === 'string') {
      return [...value.text.slice(0, MAX_CELLS)].map((char) => `c${char}`)
    }
    return null
  }
}

function keysFor(
  trace: ExecutionTrace,
  index: number,
  variable: Variable,
  mode: KeyMode,
  entries = false,
): string[] {
  return stableKeys(
    trace,
    `${variable.frame.id}:${variable.name}${entries ? ':entries' : ''}`,
    index,
    itemsOf(
      trace,
      variable.frame.id,
      variable.name,
      entries ? 'entries' : 'items',
    ),
    mode,
  )
}

// ---- classification ---------------------------------------------------------------------

type Context = {
  trace: ExecutionTrace
  index: number
  step: TraceStep
  previous: TraceStep | undefined
  variables: Variable[]
  changedNames: Set<string>
}

function base(context: Context, variable: Variable) {
  const key = `${variable.frame.id}:${variable.name}`
  const access = accessesFor(context.step, variable.frame.id, variable.name)
  return {
    id: key,
    name: variable.name,
    owner: variable.global ? 'global' : variable.frame.name,
    type:
      'type' in variable.value && typeof variable.value.type === 'string'
        ? variable.value.type
        : variable.value.kind,
    changed: context.changedNames.has(key),
    active: access.reads.length > 0 || access.writes.length > 0,
  }
}

function cellsOf(
  context: Context,
  variable: Variable,
  ids: number[],
  mode: KeyMode,
  path: (number | string)[] = [],
): Cell[] {
  const { trace } = context
  const keys =
    path.length === 0 ? keysFor(trace, context.index, variable, mode) : []
  const prevId = valueAt(
    trace,
    context.index - 1,
    variable.frame.id,
    variable.name,
  )
  const prevValue = prevId === undefined ? undefined : trace.values[prevId]
  const prevItems = prevValue?.kind === 'sequence' ? prevValue.items : null
  const access = accessesFor(context.step, variable.frame.id, variable.name)
  return ids.slice(0, MAX_CELLS).map((id, index) => {
    const before = prevItems?.[index]
    const changed = prevItems !== null && before !== id
    const fresh = prevItems !== null && before === undefined
    return {
      key: keys[index] ?? `${variable.name}:${index}`,
      text: cellText(trace, id),
      numeric: numberOf(trace.values[id]),
      state: stateOf([...path, index], access, changed, fresh),
    }
  })
}

function numericRange(cells: Cell[]) {
  const numbers = cells
    .map((cell) => cell.numeric)
    .filter(
      (value): value is number => value !== null && Math.abs(value) < 1e15,
    )
  return {
    numeric: numbers.length === cells.length && cells.length > 0,
    min: numbers.length === 0 ? 0 : Math.min(...numbers),
    max: numbers.length === 0 ? 0 : Math.max(...numbers),
  }
}

function arrayView(
  context: Context,
  variable: Variable,
  value: TraceValue & { kind: 'sequence' },
): StructureView {
  const cells = cellsOf(context, variable, value.items, 'positional')
  const pointers = arrayPointers(context, variable, value.length)
  const range = numericRange(cells)
  return {
    ...base(context, variable),
    kind: 'array',
    cells,
    length: value.length,
    pointers,
    window: windowRange(pointers),
    ...range,
    text: false,
    style: range.numeric && value.length >= BARS_AFTER ? 'bars' : 'cells',
  }
}

// Scalar variables that commonly hold positions in an array.
const pointerNames =
  /^(i|j|l|r|lo|hi|low|high|left|right|mid|start|end|begin|slow|fast|front|back|pos|idx|index|ptr|min_?idx|max_?idx|pivot|lt|gt)$/i

function arrayPointers(context: Context, variable: Variable, length: number) {
  const { trace, step } = context
  const hinted = pointersFor(
    trace,
    step.frames,
    variable.frame,
    variable.name,
    length,
  )
  const hinted1D = trace.indexHints[variable.name] ?? []
  const arrays = context.variables.filter(
    (other) =>
      other.value.kind === 'sequence' &&
      other.value.shape === 'array' &&
      other.value.items.every((id) => isScalar(trace.values[id])),
  )
  // Named pointers apply to the only array, or to arrays already indexed by
  // variables, so two unrelated arrays do not both get every pointer.
  void hinted1D
  if (arrays.length !== 1) return hinted
  const names = new Set(hinted.map((pointer) => pointer.name))
  const extra: PointerMark[] = []
  const frames = [variable.frame, step.frames.find((frame) => frame.id === 0)]
  for (const frame of frames) {
    for (const [name, id] of frame?.vars ?? []) {
      if (names.has(name) || !pointerNames.test(name)) continue
      const value = trace.values[id]
      if (value?.kind !== 'number' || !/^-?\d+$/.test(value.text)) continue
      const index = Number(value.text)
      if (index < 0 || index > length) continue
      names.add(name)
      extra.push({ name, index })
    }
  }
  return [...hinted, ...extra]
}

function stringView(
  context: Context,
  variable: Variable,
  value: TraceValue & { kind: 'string' },
): StructureView {
  const { trace } = context
  const keys = keysFor(trace, context.index, variable, 'positional')
  const prevId = valueAt(
    trace,
    context.index - 1,
    variable.frame.id,
    variable.name,
  )
  const prevValue = prevId === undefined ? undefined : trace.values[prevId]
  const prevText = prevValue?.kind === 'string' ? prevValue.text : null
  const access = accessesFor(context.step, variable.frame.id, variable.name)
  const cells: Cell[] = [...value.text.slice(0, MAX_CELLS)].map(
    (char, index) => ({
      key: keys[index] ?? `${variable.name}:${index}`,
      text: char === ' ' ? '␠' : char,
      numeric: null,
      state: stateOf(
        [index],
        access,
        prevText !== null && prevText[index] !== char,
        prevText !== null && index >= prevText.length,
      ),
    }),
  )
  const pointers = pointersFor(
    trace,
    context.step.frames,
    variable.frame,
    variable.name,
    value.length,
  )
  return {
    ...base(context, variable),
    kind: 'array',
    cells,
    length: value.length,
    pointers,
    window: windowRange(pointers),
    numeric: false,
    min: 0,
    max: 0,
    text: true,
    style: 'cells',
  }
}

function gridRowIds(
  trace: ExecutionTrace,
  id: number,
): number[] | string | null {
  const row = trace.values[id]
  if (row === undefined) return null
  if (row.kind === 'string')
    return row.length <= MAX_GRID_COLS * 2 ? row.text : null
  if (row.kind !== 'sequence' || row.shape === 'set') return null
  if (!row.items.every((cell) => isScalar(trace.values[cell]))) return null
  return row.items
}

function gridView(
  context: Context,
  variable: Variable,
  value: TraceValue & { kind: 'sequence' },
): StructureView | null {
  const { trace } = context
  const rowsIds = value.items
    .slice(0, MAX_GRID_ROWS)
    .map((id) => gridRowIds(trace, id))
  if (rowsIds.some((row) => row === null) || rowsIds.length === 0) return null
  const access = accessesFor(context.step, variable.frame.id, variable.name)
  const prevId = valueAt(
    trace,
    context.index - 1,
    variable.frame.id,
    variable.name,
  )
  const prevValue = prevId === undefined ? undefined : trace.values[prevId]
  const prevRows =
    prevValue?.kind === 'sequence'
      ? prevValue.items.map((id) => gridRowIds(trace, id))
      : null
  let maze = false
  const rows: Cell[][] = rowsIds.map((row, r) => {
    const before = prevRows?.[r]
    if (typeof row === 'string') {
      if (/^[#.*@SEXGO+|\-_ ]+$/.test(row) && row.includes('#')) maze = true
      return [...row.slice(0, MAX_GRID_COLS)].map((char, c) => ({
        key: `${r}:${c}`,
        text: char,
        numeric: null,
        state: stateOf(
          [r, c],
          access,
          typeof before === 'string' && before[c] !== char,
          false,
        ),
      }))
    }
    const ids = row as number[]
    return ids.slice(0, MAX_GRID_COLS).map((id, c) => ({
      key: `${r}:${c}`,
      text: cellText(trace, id, 6),
      numeric: numberOf(trace.values[id]),
      state: stateOf(
        [r, c],
        access,
        Array.isArray(before) && before[c] !== id,
        false,
      ),
    }))
  })
  const flat = rows.flat()
  const range = numericRange(flat)
  // Row and column pointers from the first and second index used with it.
  const hints = trace.indexHints[variable.name] ?? []
  const lookup = (hint: string) => {
    const id =
      variable.frame.vars.find(([key]) => key === hint)?.[1] ??
      context.step.frames
        .find((frame) => frame.id === 0)
        ?.vars.find(([key]) => key === hint)?.[1]
    const found = id === undefined ? undefined : trace.values[id]
    return found?.kind === 'number' && /^-?\d+$/.test(found.text)
      ? Number(found.text)
      : null
  }
  const rowPointers: PointerMark[] = []
  const colPointers: PointerMark[] = []
  const lastAccess = [...access.writes, ...access.reads].find(
    (path) => path.length >= 2,
  )
  for (const hint of hints) {
    const at = lookup(hint)
    if (at === null) continue
    if (
      lastAccess !== undefined &&
      String(lastAccess[1]) === String(at) &&
      /^(j|c|col|y|x2|nc|cc)$/i.test(hint)
    ) {
      colPointers.push({ name: hint, index: at })
    } else if (/^(i|r|row|x|nr|rr)$/i.test(hint) && at < rows.length) {
      rowPointers.push({ name: hint, index: at })
    } else if (/^(j|c|col|y|nc|cc)$/i.test(hint)) {
      colPointers.push({ name: hint, index: at })
    }
  }
  return {
    ...base(context, variable),
    kind: 'grid',
    rows,
    rowCount: value.length,
    colCount: Math.max(0, ...rows.map((row) => row.length)),
    rowPointers,
    colPointers,
    ...range,
    maze,
  }
}

function cubeView(
  context: Context,
  variable: Variable,
  value: TraceValue & { kind: 'sequence' },
): StructureView | null {
  const { trace } = context
  const access = accessesFor(context.step, variable.frame.id, variable.name)
  const layers: Cell[][][] = []
  for (const [k, layerId] of value.items.slice(0, 8).entries()) {
    const layer = trace.values[layerId]
    if (layer?.kind !== 'sequence') return null
    const rows: Cell[][] = []
    for (const [r, rowId] of layer.items.slice(0, 12).entries()) {
      const row = trace.values[rowId]
      if (
        row?.kind !== 'sequence' ||
        !row.items.every((id) => isScalar(trace.values[id]))
      ) {
        return null
      }
      rows.push(
        row.items.slice(0, 12).map((id, c) => ({
          key: `${k}:${r}:${c}`,
          text: cellText(trace, id, 5),
          numeric: numberOf(trace.values[id]),
          state: stateOf([k, r, c], access, false, false),
        })),
      )
    }
    layers.push(rows)
  }
  if (layers.length === 0) return null
  return {
    ...base(context, variable),
    kind: 'cube',
    layers,
    ...numericRange(layers.flat(2)),
  }
}

function orderedCells(
  context: Context,
  variable: Variable,
  ids: number[],
): Cell[] {
  const { trace } = context
  const keys = keysFor(trace, context.index, variable, 'ordered')
  const prevId = valueAt(
    trace,
    context.index - 1,
    variable.frame.id,
    variable.name,
  )
  const prevValue = prevId === undefined ? undefined : trace.values[prevId]
  const prevKeys =
    context.index > 0 && prevValue?.kind === 'sequence'
      ? new Set(keysFor(trace, context.index - 1, variable, 'ordered'))
      : null
  return ids.slice(0, MAX_CELLS).map((id, index) => {
    const key = keys[index] ?? `${variable.name}:${index}`
    return {
      key,
      text: cellText(trace, id, 14),
      numeric: numberOf(trace.values[id]),
      state: prevKeys !== null && !prevKeys.has(key) ? 'new' : 'none',
    }
  })
}

// Numbers, or tuples of numbers compared item by item: (dist, node).
function sortKey(trace: ExecutionTrace, id: number): number[] | null {
  const value = trace.values[id]
  const number = numberOf(value)
  if (number !== null) return [number]
  if (value?.kind === 'string') return null
  if (isPairLike(value) || value?.kind === 'sequence') {
    const parts = componentsOf(trace, value).map((part) => numberOf(part))
    if (parts.length > 0 && parts.every((part) => part !== null)) {
      return parts
    }
  }
  return null
}

function compareKeys(a: number[], b: number[]) {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const diff = a[i] - b[i]
    if (diff !== 0) return diff
  }
  return a.length - b.length
}

function heapView(
  context: Context,
  variable: Variable,
  value: TraceValue & { kind: 'sequence' },
): StructureView {
  const { trace, index } = context
  // Positional keys follow a value when a sift swaps it with its parent.
  const keys = keysFor(trace, index, variable, 'positional')
  const prevId = valueAt(trace, index - 1, variable.frame.id, variable.name)
  const prevValue = prevId === undefined ? undefined : trace.values[prevId]
  const prevItems =
    index > 0 && prevValue?.kind === 'sequence' ? prevValue.items : null
  const prevKeys =
    prevItems === null
      ? null
      : keysFor(trace, index - 1, variable, 'positional')
  const current = new Set(keys)
  const items: Cell[] = value.items.slice(0, MAX_CELLS).map((id, position) => {
    const key = keys[position] ?? `${variable.name}:${position}`
    const moved =
      prevKeys !== null &&
      prevKeys.includes(key) &&
      prevKeys.indexOf(key) !== position
    return {
      key,
      text: cellText(trace, id, 14),
      numeric: numberOf(trace.values[id]),
      state:
        prevKeys !== null && !prevKeys.includes(key)
          ? 'new'
          : moved
            ? 'changed'
            : 'none',
    }
  })
  const pushed = items
    .filter((cell) => cell.state === 'new')
    .map((cell) => cell.text)
  const popped =
    prevItems === null || prevKeys === null
      ? []
      : prevItems
          .map((id, position) => ({ id, key: prevKeys[position] }))
          .filter((item) => item.key !== undefined && !current.has(item.key))
          .map((item) => cellText(trace, item.id, 14))
  const sortKeys = value.items.map((id) => sortKey(trace, id))
  let order: 'min' | 'max' | 'unknown' = 'unknown'
  let popOrder: string[] | null = null
  if (sortKeys.length > 0 && sortKeys.every((key) => key !== null)) {
    const all = sortKeys
    const top = all[0]
    const isMin = all.every((key) => compareKeys(top, key) <= 0)
    const isMax = all.every((key) => compareKeys(top, key) >= 0)
    order = isMin ? 'min' : isMax ? 'max' : 'unknown'
    if (order !== 'unknown') {
      popOrder = value.items
        .map((id, position) => ({
          key: all[position],
          text: cellText(trace, id, 14),
        }))
        .sort((a, b) =>
          order === 'min'
            ? compareKeys(a.key, b.key)
            : compareKeys(b.key, a.key),
        )
        .slice(0, 24)
        .map((item) => item.text)
    }
  }
  return {
    ...base(context, variable),
    kind: 'heap',
    items,
    length: value.length,
    order,
    popOrder,
    pushed,
    popped,
  }
}

function mapView(
  context: Context,
  variable: Variable,
  value: TraceValue & { kind: 'mapping' },
): StructureView {
  const { trace } = context
  const keys = keysFor(trace, context.index, variable, 'ordered', true)
  const prevId = valueAt(
    trace,
    context.index - 1,
    variable.frame.id,
    variable.name,
  )
  const prevValue = prevId === undefined ? undefined : trace.values[prevId]
  const before = new Map<string, number>()
  if (prevValue?.kind === 'mapping') {
    for (const [key, item] of prevValue.entries)
      before.set(itemIdentity(trace, key), item)
  }
  const entries: MapEntryView[] = value.entries
    .slice(0, MAX_CELLS)
    .map(([key, item], index) => {
      const identity = itemIdentity(trace, key)
      const old = before.get(identity)
      return {
        key: keys[index] ?? `${variable.name}:${index}`,
        keyText: cellText(trace, key, 18),
        valueText: shorten(formatValue(trace, item), 40),
        state:
          prevValue?.kind !== 'mapping'
            ? 'none'
            : old === undefined
              ? 'new'
              : old !== item
                ? 'changed'
                : 'none',
      }
    })
  return {
    ...base(context, variable),
    kind: 'map',
    entries,
    length: value.length,
  }
}

// ---- graphs -------------------------------------------------------------------------------

type Adjacency = {
  nodes: string[]
  edges: { from: string; to: string; weight?: string }[]
  directed: boolean
  numeric: boolean
}

function neighbor(
  trace: ExecutionTrace,
  id: number,
): { node: string; weight?: string } | null {
  const value = trace.values[id]
  if (value === undefined) return null
  if (value.kind === 'number' && /^-?\d+$/.test(value.text))
    return { node: value.text }
  if (value.kind === 'string' && value.length <= 12) return { node: value.text }
  if (value.kind === 'char') return { node: value.text }
  const smallTuple =
    value.kind === 'sequence' &&
    value.length >= 2 &&
    value.length <= 3 &&
    value.items.every((item) => trace.values[item]?.kind === 'number')
  if (isPairLike(value) || smallTuple) {
    const [first, second] = componentsOf(trace, value)
    if (first?.kind === 'number' && /^-?\d+$/.test(first.text)) {
      return {
        node: first.text,
        weight:
          second === undefined
            ? undefined
            : shorten(formatScalarText(second), 8),
      }
    }
  }
  return null
}

function formatScalarText(value: TraceValue): string {
  if (value.kind === 'number') return value.text
  if (value.kind === 'string') return value.text
  if (value.kind === 'char') return value.text
  if (value.kind === 'bool') return String(value.value)
  return '?'
}

function finishAdjacency(
  nodes: string[],
  raw: { from: string; to: string; weight?: string }[],
  numeric: boolean,
): Adjacency | null {
  if (raw.length === 0 || nodes.length === 0 || nodes.length > MAX_GRAPH_NODES)
    return null
  const pairs = new Set(raw.map((edge) => `${edge.from}->${edge.to}`))
  const undirected = raw.every(
    (edge) => edge.from === edge.to || pairs.has(`${edge.to}->${edge.from}`),
  )
  const edges = undirected
    ? raw.filter((edge) => {
        const a = numeric ? Number(edge.from) : edge.from
        const b = numeric ? Number(edge.to) : edge.to
        return a <= b
      })
    : raw
  return { nodes, edges, directed: !undirected, numeric }
}

function adjacencyOf(
  trace: ExecutionTrace,
  name: string,
  value: TraceValue,
): Adjacency | null {
  if (
    value.kind === 'sequence' &&
    value.shape !== 'set' &&
    value.shape !== 'tuple'
  ) {
    const rows = value.items.map((id) => trace.values[id])
    if (rows.length < 2 || rows.length > MAX_GRAPH_NODES + 1) return null
    // Edge list: [[u, v], [u, v, w], ...]
    if (
      edgeListNames.test(name) &&
      rows.every((row) => {
        const parts = componentsOf(trace, row)
        return (
          parts.length >= 2 &&
          parts.length <= 3 &&
          parts.every((part) => part?.kind === 'number')
        )
      })
    ) {
      const raw: Adjacency['edges'] = []
      const labels = new Set<string>()
      for (const row of rows) {
        const [u, v, w] = componentsOf(trace, row)
        if (u?.kind !== 'number' || v?.kind !== 'number') return null
        labels.add(u.text)
        labels.add(v.text)
        raw.push({
          from: u.text,
          to: v.text,
          ...(w?.kind === 'number' ? { weight: w.text } : {}),
        })
      }
      const nodes = [...labels].sort((a, b) => Number(a) - Number(b))
      if (nodes.length > MAX_GRAPH_NODES) return null
      return { nodes, edges: raw, directed: false, numeric: true }
    }
    if (!rows.every((row) => row?.kind === 'sequence' && row.shape !== 'tuple'))
      return null
    const lengths = new Set(
      rows.map((row) => (row?.kind === 'sequence' ? row.length : -1)),
    )
    const named = graphNames.test(name)
    const ragged = lengths.size > 1
    const n = rows.length
    // Adjacency matrix: adj[i][j] != 0.
    if (named && !ragged && lengths.has(n) && n <= 30) {
      const raw: Adjacency['edges'] = []
      let matrix = true
      rows.forEach((row, i) => {
        if (row?.kind !== 'sequence') return
        row.items.forEach((id, j) => {
          const cell = trace.values[id]
          const number = numberOf(cell)
          if (number === null) matrix = false
          else if (number !== 0 && i !== j && Math.abs(number) < 1e9) {
            raw.push({
              from: String(i),
              to: String(j),
              ...(number !== 1 && cell?.kind === 'number'
                ? { weight: cell.text }
                : {}),
            })
          }
        })
      })
      if (matrix && raw.length > 0) {
        return finishAdjacency(
          rows.map((_, i) => String(i)),
          raw,
          true,
        )
      }
    }
    if (!named && !ragged) return null
    const raw: Adjacency['edges'] = []
    let valid = true
    rows.forEach((row, i) => {
      if (row?.kind !== 'sequence') return
      for (const id of row.items) {
        const found = neighbor(trace, id)
        if (found === null || !/^-?\d+$/.test(found.node)) {
          valid = false
          return
        }
        const target = Number(found.node)
        if (target < 0 || target >= n) {
          valid = false
          return
        }
        raw.push({
          from: String(i),
          to: found.node,
          ...(found.weight === undefined ? {} : { weight: found.weight }),
        })
      }
    })
    if (!valid) return null
    // A leading empty row of a 1-indexed graph is left out.
    const used = new Set(raw.flatMap((edge) => [edge.from, edge.to]))
    const nodes = rows
      .map((_, i) => String(i))
      .filter((label, i) => i !== 0 || used.has(label) || rows.length <= 1)
    return finishAdjacency(nodes, raw, true)
  }
  if (value.kind === 'mapping') {
    if (value.entries.length < 1 || value.entries.length > MAX_GRAPH_NODES)
      return null
    const named = graphNames.test(name)
    const raw: Adjacency['edges'] = []
    const labels = new Set<string>()
    let numeric = true
    for (const [keyId, itemId] of value.entries) {
      const key = trace.values[keyId]
      const item = trace.values[itemId]
      if (key === undefined || !isScalar(key) || item?.kind !== 'sequence')
        return null
      const from = formatScalarText(key)
      if (!/^-?\d+$/.test(from)) numeric = false
      labels.add(from)
      for (const id of item.items) {
        const found = neighbor(trace, id)
        if (found === null) return null
        if (!/^-?\d+$/.test(found.node)) numeric = false
        labels.add(found.node)
        raw.push({
          from,
          to: found.node,
          ...(found.weight === undefined ? {} : { weight: found.weight }),
        })
      }
    }
    if (!named && raw.length === 0) return null
    if (!named) {
      // Unnamed maps count as graphs only when neighbours are also keys.
      const keys = new Set(
        value.entries.map(([keyId]) => formatScalarText(trace.values[keyId])),
      )
      if (!raw.every((edge) => keys.has(edge.to))) return null
    }
    const nodes = [...labels].sort((a, b) =>
      numeric ? Number(a) - Number(b) : a.localeCompare(b),
    )
    return finishAdjacency(nodes, raw, numeric)
  }
  return null
}

type GraphLayoutCache = Map<
  string,
  {
    positions: Map<string, { x: number; y: number }>
    width: number
    height: number
    signature: string
  }
>
const graphLayouts = new WeakMap<ExecutionTrace, GraphLayoutCache>()

// The layout comes from the most complete version of the graph in the whole
// run, so nodes keep their places while edges are being read.
function stableGraphLayout(
  trace: ExecutionTrace,
  variable: Variable,
): {
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
} | null {
  let cache = graphLayouts.get(trace)
  if (cache === undefined) {
    cache = new Map()
    graphLayouts.set(trace, cache)
  }
  const key = `${variable.frame.id}:${variable.name}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  let best: Adjacency | null = null
  const seen = new Set<number>()
  for (let index = 0; index < trace.steps.length; index += 1) {
    const id = valueAt(trace, index, variable.frame.id, variable.name)
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    const value = trace.values[id]
    if (value === undefined) continue
    const adjacency = adjacencyOf(trace, variable.name, value)
    if (
      adjacency !== null &&
      (best === null ||
        adjacency.edges.length + adjacency.nodes.length >
          best.edges.length + best.nodes.length)
    ) {
      best = adjacency
    }
  }
  if (best === null) return null
  const layout = graphLayout(best.nodes, best.edges)
  const entry = { ...layout, signature: best.nodes.join(',') }
  cache.set(key, entry)
  return entry
}

function nodeIndexOf(value: TraceValue | undefined): number | null {
  if (value?.kind !== 'number' || !/^-?\d+$/.test(value.text)) return null
  return Number(value.text)
}

function graphView(
  context: Context,
  variable: Variable,
  adjacency: Adjacency,
): GraphView | null {
  const { trace } = context
  const layout = stableGraphLayout(trace, variable)
  const positions =
    layout?.positions ?? graphLayout(adjacency.nodes, adjacency.edges).positions
  const nodeSet = new Set(adjacency.nodes)
  const states = new Map<string, GraphNodeState>()
  const badges = new Map<string, string>()
  let badgeSource: string | undefined
  let visitedSource: string | undefined
  const count =
    Math.max(
      ...adjacency.nodes.map((node) => (adjacency.numeric ? Number(node) : 0)),
    ) + 1
  // Arrays indexed by node: visited flags and per-node values.
  for (const other of context.variables) {
    if (other === variable) continue
    const value = other.value
    if (
      value.kind === 'sequence' &&
      adjacency.numeric &&
      value.shape !== 'tuple'
    ) {
      if (value.length < count - 1 || value.length > count + 2) {
        if (!(value.shape === 'set' && visitedNames.test(other.name))) continue
      }
      if (visitedNames.test(other.name)) {
        if (value.shape === 'set') {
          for (const id of value.items) {
            const node = nodeIndexOf(trace.values[id])
            if (node !== null && nodeSet.has(String(node)))
              states.set(String(node), 'visited')
          }
        } else {
          value.items.forEach((id, node) => {
            const number = numberOf(trace.values[id])
            if (number !== null && number !== 0 && nodeSet.has(String(node))) {
              states.set(String(node), 'visited')
            }
          })
        }
        visitedSource = other.name
      } else if (badgeNames.test(other.name) && badgeSource === undefined) {
        if (!value.items.every((id) => isScalar(trace.values[id]))) continue
        value.items.forEach((id, node) => {
          if (nodeSet.has(String(node)))
            badges.set(String(node), cellText(trace, id, 5))
        })
        badgeSource = other.name
      }
    }
  }
  // Without a visited array, a known distance means the node was reached.
  if (
    visitedSource === undefined &&
    badgeSource !== undefined &&
    /^(dist|distance|d|depth|level|lvl)\d*$/i.test(badgeSource)
  ) {
    for (const [node, badge] of badges) {
      if (badge !== '-1' && badge !== '∞' && badge !== '?')
        states.set(node, 'visited')
    }
    visitedSource = badgeSource
  }
  // Nodes waiting in a queue, stack or priority queue.
  for (const other of context.variables) {
    const value = other.value
    if (value.kind !== 'sequence') continue
    const frontier =
      value.shape === 'queue' ||
      value.shape === 'stack' ||
      value.shape === 'deque' ||
      value.shape === 'heap' ||
      (value.shape === 'array' &&
        (queueNames.test(other.name) ||
          stackNames.test(other.name) ||
          /^(pq|heap|h)$/i.test(other.name)))
    if (!frontier) continue
    for (const id of value.items) {
      const item = trace.values[id]
      let node = nodeIndexOf(item)
      if (node === null && isPairLike(item)) {
        const parts = componentsOf(trace, item)
        for (let p = parts.length - 1; p >= 0; p -= 1) {
          const candidate = nodeIndexOf(parts[p])
          if (candidate !== null && nodeSet.has(String(candidate))) {
            node = candidate
            break
          }
        }
      }
      if (
        node !== null &&
        nodeSet.has(String(node)) &&
        states.get(String(node)) !== 'current'
      ) {
        states.set(String(node), 'frontier')
      }
    }
  }
  // The node being processed and the neighbour being looked at.
  let current: string | null = null
  let next: string | null = null
  const top = context.step.frames.at(-1)
  for (const [name, id] of top?.vars ?? []) {
    const node = nodeIndexOf(trace.values[id])
    if (node === null || !nodeSet.has(String(node))) continue
    if (currentNames.test(name) && current === null) current = String(node)
    else if (neighborNames.test(name) && next === null) next = String(node)
  }
  if (next !== null) states.set(next, 'neighbor')
  if (current !== null) states.set(current, 'current')
  const nodes = adjacency.nodes.map((node) => {
    const point = positions.get(node) ?? { x: 40, y: 40 }
    const badge = badges.get(node)
    return {
      id: adjacency.numeric ? Number(node) : adjacency.nodes.indexOf(node),
      label: node,
      x: point.x,
      y: point.y,
      state: states.get(node) ?? 'none',
      ...(badge === undefined ? {} : { badge }),
    }
  })
  const idOf = new Map(
    adjacency.nodes.map((node, i) => [node, nodes[i]?.id ?? i]),
  )
  const edges = adjacency.edges.map((edge) => ({
    from: idOf.get(edge.from) ?? 0,
    to: idOf.get(edge.to) ?? 0,
    ...(edge.weight === undefined ? {} : { weight: edge.weight }),
    active:
      current !== null &&
      next !== null &&
      ((edge.from === current && edge.to === next) ||
        (!adjacency.directed && edge.from === next && edge.to === current)),
  }))
  return {
    ...base(context, variable),
    kind: 'graph',
    nodes,
    edges,
    directed: adjacency.directed,
    width: layout?.width ?? 400,
    height: layout?.height ?? 300,
    ...(badgeSource === undefined ? {} : { badgeSource }),
    ...(visitedSource === undefined ? {} : { visitedSource }),
  }
}

// ---- linked objects: trees and lists ------------------------------------------------------

type ObjectNode = {
  objectId: number
  type: string
  value: TraceValue & { kind: 'record' }
}

function objectOf(value: TraceValue | undefined): ObjectNode | null {
  if (value?.kind !== 'record' || value.objectId === undefined) return null
  return { objectId: value.objectId, type: value.type, value }
}

function labelOf(
  trace: ExecutionTrace,
  record: TraceValue & { kind: 'record' },
  links: Set<string>,
) {
  const scalars = record.fields.filter(
    ([name, id]) => !links.has(name) && isScalar(trace.values[id]),
  )
  const main =
    scalars.find(([name]) => labelFields.includes(name)) ?? scalars[0]
  const label = main === undefined ? record.type : cellText(trace, main[1], 8)
  const badges = scalars
    .filter((field) => field !== main)
    .slice(0, 2)
    .map(([name, id]) => `${name}=${cellText(trace, id, 5)}`)
  return { label, badges }
}

// Field names that link objects of the same type, found across everything
// reachable from the given roots.
function linkFields(
  trace: ExecutionTrace,
  roots: TraceValue[],
): Map<string, Set<string>> {
  const byType = new Map<string, Set<string>>()
  const seen = new Set<number>()
  const visit = (value: TraceValue | undefined) => {
    if (value?.kind !== 'record' || value.objectId === undefined) return
    if (seen.has(value.objectId)) return
    seen.add(value.objectId)
    const links = byType.get(value.type) ?? new Set<string>()
    byType.set(value.type, links)
    for (const [name, id] of value.fields) {
      const field = trace.values[id]
      if (field === undefined) continue
      if (
        (field.kind === 'record' || field.kind === 'ref') &&
        field.type.replace(/\*$/, '') === value.type.replace(/\*$/, '')
      ) {
        links.add(name)
        visit(field)
      } else if (
        field.kind === 'none' &&
        Object.values(linkNames).some((pattern) => pattern.test(name))
      ) {
        links.add(name)
      } else if (field.kind === 'sequence' && linkNames.children.test(name)) {
        const items = field.items.map((item) => trace.values[item])
        if (
          items.length === 0 ||
          items.some(
            (item) =>
              item?.kind === 'record' ||
              item?.kind === 'ref' ||
              item?.kind === 'none',
          )
        ) {
          links.add(name)
          items.forEach(visit)
        }
      }
    }
  }
  roots.forEach(visit)
  return byType
}

function reachable(trace: ExecutionTrace, value: TraceValue): Set<number> {
  const found = new Set<number>()
  const visit = (item: TraceValue | undefined) => {
    if (item === undefined) return
    if (item.kind === 'record' && item.objectId !== undefined) {
      if (found.has(item.objectId)) return
      found.add(item.objectId)
      for (const [, id] of item.fields) visit(trace.values[id])
    } else if (item.kind === 'sequence' && item.shape !== 'set') {
      for (const id of item.items.slice(0, MAX_CELLS)) visit(trace.values[id])
    }
  }
  visit(value)
  return found
}

function linkedView(
  context: Context,
  variable: Variable,
  pointerNames: Map<number, string[]>,
  links: Map<string, Set<string>>,
): TreeView | ListView | null {
  const { trace } = context
  const root = objectOf(variable.value)
  if (root === null) return null
  const fields = links.get(root.type) ?? new Set<string>()
  if (fields.size === 0) return null
  const has = (pattern: RegExp) =>
    [...fields].some((name) => pattern.test(name))
  const binary = has(linkNames.left) && has(linkNames.right)
  const nary = [...fields].some((name) => linkNames.children.test(name))
  const listy = !binary && !nary
  const prevId = valueAt(
    trace,
    context.index - 1,
    variable.frame.id,
    variable.name,
  )
  const before = new Map<number, number>()
  if (prevId !== undefined) {
    const collect = (id: number) => {
      const value = trace.values[id]
      if (
        value?.kind !== 'record' ||
        value.objectId === undefined ||
        before.has(value.objectId)
      )
        return
      before.set(value.objectId, id)
      for (const [, field] of value.fields) collect(field)
    }
    collect(prevId)
  }
  const stateFor = (objectId: number, valueId: number): CellState => {
    if (prevId === undefined) return 'none'
    if (!before.has(objectId)) return 'new'
    return before.get(objectId) !== valueId ? 'changed' : 'none'
  }
  const labelFor = (node: ObjectNode) => labelOf(trace, node.value, fields)

  if (listy) {
    const nextField =
      [...fields].find((name) => linkNames.next.test(name)) ??
      [...fields].find(
        (name) => !linkNames.prev.test(name) && !linkNames.parent.test(name),
      )
    if (nextField === undefined) return null
    const doubly = [...fields].some((name) => linkNames.prev.test(name))
    const nodes: NodeView[] = []
    const indexOf = new Map<number, number>()
    let cycleTo: number | null = null
    let more = false
    let currentId: number | undefined = variable.id
    while (currentId !== undefined) {
      const current: TraceValue | undefined = trace.values[currentId]
      if (current === undefined) break
      if (current.kind === 'ref') {
        cycleTo = indexOf.get(current.objectId) ?? null
        break
      }
      if (current.kind === 'opaque') {
        more = true
        break
      }
      const node = objectOf(current)
      if (node === null) break
      if (indexOf.has(node.objectId)) {
        cycleTo = indexOf.get(node.objectId) ?? null
        break
      }
      indexOf.set(node.objectId, nodes.length)
      const valueId = currentId
      const { label, badges } = labelFor(node)
      nodes.push({
        key: `o${node.objectId}`,
        label,
        badges,
        pointers: pointerNames.get(node.objectId) ?? [],
        state: stateFor(node.objectId, valueId),
        x: nodes.length * 118 + 50,
        y: 60,
      })
      if (nodes.length >= 40) {
        more = true
        break
      }
      currentId = node.value.fields.find(([name]) => name === nextField)?.[1]
    }
    return {
      ...base(context, variable),
      kind: 'list',
      nodes,
      cycleTo,
      doubly,
      more,
    }
  }

  // Trees.
  const children = new Map<string, string[]>()
  const left = new Map<string, string>()
  const right = new Map<string, string>()
  const nodes = new Map<string, NodeView>()
  const edges: TreeView['edges'] = []
  const visit = (valueId: number | undefined): string | null => {
    const value = valueId === undefined ? undefined : trace.values[valueId]
    const node = objectOf(value)
    if (node === null || value === undefined) {
      if (value?.kind === 'ref') return `o${value.objectId}`
      return null
    }
    const key = `o${node.objectId}`
    if (nodes.has(key) || nodes.size >= 120) return key
    const { label, badges } = labelFor(node)
    nodes.set(key, {
      key,
      label,
      badges,
      pointers: pointerNames.get(node.objectId) ?? [],
      state: stateFor(node.objectId, valueId as number),
      x: 0,
      y: 0,
    })
    const kids: string[] = []
    for (const [name, id] of node.value.fields) {
      if (
        !fields.has(name) ||
        linkNames.parent.test(name) ||
        linkNames.prev.test(name)
      )
        continue
      const field = trace.values[id]
      if (field?.kind === 'sequence') {
        for (const item of field.items) {
          const child = visit(item)
          if (child !== null) {
            kids.push(child)
            edges.push({ from: key, to: child })
          }
        }
        continue
      }
      const child = visit(id)
      if (child === null) continue
      kids.push(child)
      const side = linkNames.left.test(name)
        ? 'left'
        : linkNames.right.test(name)
          ? 'right'
          : undefined
      if (side === 'left') left.set(key, child)
      if (side === 'right') right.set(key, child)
      edges.push({
        from: key,
        to: child,
        ...(side === undefined ? {} : { side }),
      })
    }
    children.set(key, kids)
    return key
  }
  const rootKey = visit(variable.id)
  if (rootKey === null) return null
  const layout = binary
    ? inorderTree(rootKey, left, right)
    : tidyTree(rootKey, children)
  const placed = [...nodes.values()].map((node) => {
    const point = layout.positions.get(node.key) ?? { x: 0, y: 0 }
    return { ...node, x: point.x, y: point.y }
  })
  return {
    ...base(context, variable),
    kind: 'tree',
    nodes: placed,
    edges: edges.filter((edge) => nodes.has(edge.to)),
    width: layout.width,
    height: layout.height,
  }
}

// ---- entry point ------------------------------------------------------------------------------

function scalarText(
  trace: ExecutionTrace,
  value: TraceValue,
  id: number,
): string {
  if (value.kind === 'record' && value.objectId !== undefined) {
    const label = labelOf(trace, value, new Set())
    return `→ ${value.type.replace(/\*$/, '')}(${label.label})`
  }
  return shorten(formatValue(trace, id), 42)
}

const firstSeenCache = new WeakMap<ExecutionTrace, Map<string, number>>()

// The step where each variable first appears. Ordering by it keeps every
// card and chip in the same place for the whole run: entering a function
// adds its variables after the ones already on screen instead of moving
// them.
function firstSeen(trace: ExecutionTrace): Map<string, number> {
  const cached = firstSeenCache.get(trace)
  if (cached !== undefined) return cached
  const seen = new Map<string, number>()
  trace.steps.forEach((step, index) => {
    for (const frame of step.frames) {
      for (const [name] of frame.vars) {
        const key = `${frame.id}:${name}`
        if (!seen.has(key)) seen.set(key, index)
      }
    }
  })
  firstSeenCache.set(trace, seen)
  return seen
}

function byFirstSeen<T extends { id: string }>(
  trace: ExecutionTrace,
  items: T[],
): T[] {
  const seen = firstSeen(trace)
  return items
    .map((item, order) => ({ item, order, at: seen.get(item.id) ?? Infinity }))
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .map(({ item }) => item)
}

export function buildScene(
  trace: ExecutionTrace,
  index: number,
  sourceLines: readonly string[],
): Scene {
  const step = trace.steps[index]
  if (step === undefined) {
    return {
      narration: { tone: 'info', headline: 'Nothing to show.' },
      scalars: [],
      structures: [],
      stack: [],
    }
  }
  const previous = index > 0 ? trace.steps[index - 1] : undefined
  const variables = variablesAt(trace, step)
  const changes = step.event === 'call' ? [] : changesAt(trace, index)
  const changedNames = new Set(
    changes.map((change) => `${change.frame}:${change.name}`),
  )
  const context: Context = {
    trace,
    index,
    step,
    previous,
    variables,
    changedNames,
  }

  // Objects: which variables point at which nodes, and which are roots.
  const objectVars = variables.filter(
    (variable) => objectOf(variable.value) !== null,
  )
  const links = linkFields(
    trace,
    objectVars.map((variable) => variable.value),
  )
  const pointerNames = new Map<number, string[]>()
  const counts = new Map<string, number>()
  for (const variable of objectVars)
    counts.set(variable.name, (counts.get(variable.name) ?? 0) + 1)
  for (const variable of objectVars) {
    const node = objectOf(variable.value) as ObjectNode
    // Two variables called `root` (main's and the helper's) are told apart.
    const label =
      (counts.get(variable.name) ?? 0) > 1 && variable.outer
        ? `${variable.name} (${variable.frame.name.replace(/^[A-Z]\w*\./, '')})`
        : variable.name
    pointerNames.set(node.objectId, [
      ...(pointerNames.get(node.objectId) ?? []),
      label,
    ])
  }
  // Largest structures first, so a variable pointing into one becomes a label.
  const bySize = objectVars
    .map((variable) => ({ variable, reach: reachable(trace, variable.value) }))
    .sort((a, b) => b.reach.size - a.reach.size)
  const drawn = new Set<number>()
  const objectRoots = new Set<Variable>()
  for (const { variable, reach } of bySize) {
    const node = objectOf(variable.value) as ObjectNode
    if (drawn.has(node.objectId)) continue
    if ((links.get(node.type)?.size ?? 0) === 0) continue
    objectRoots.add(variable)
    for (const id of reach) drawn.add(id)
  }

  const structures: StructureView[] = []
  const scalars: ScalarChip[] = []
  const shownObjects = new Set<number>()
  const previousFrames = previous?.frames ?? []
  for (const variable of variables) {
    const { value, name, frame } = variable
    const key = `${frame.id}:${name}`
    if (isNoise(variable)) continue
    let view: StructureView | null = null
    if (value.kind === 'sequence') {
      const shape = value.shape
      if (
        shape === 'stack' ||
        (shape === 'array' &&
          stackNames.test(name) &&
          value.items.every((id) => !isContainerValue(trace.values[id])))
      ) {
        view = {
          ...base(context, variable),
          kind: 'stack',
          items: orderedCells(context, variable, value.items),
          length: value.length,
        }
      } else if (
        shape === 'queue' ||
        shape === 'deque' ||
        (shape === 'array' &&
          queueNames.test(name) &&
          value.items.every((id) => !isContainerValue(trace.values[id])))
      ) {
        view = {
          ...base(context, variable),
          kind: shape === 'deque' && stackNames.test(name) ? 'stack' : 'queue',
          items: orderedCells(context, variable, value.items),
          length: value.length,
          ...(shape === 'deque' && stackNames.test(name)
            ? {}
            : { double: shape === 'deque' }),
        } as StructureView
      } else if (shape === 'heap') {
        view = heapView(context, variable, value)
      } else if (shape === 'set') {
        view = {
          ...base(context, variable),
          kind: 'set',
          items: orderedCells(context, variable, value.items),
          length: value.length,
        }
      } else if (shape === 'tuple') {
        view = null
      } else {
        const items = value.items.map((id) => trace.values[id])
        const adjacency = adjacencyOf(trace, name, value)
        if (adjacency !== null) view = graphView(context, variable, adjacency)
        if (
          view === null &&
          items.length > 0 &&
          items.every(
            (item) =>
              item?.kind === 'sequence' &&
              item.items.every((id) => trace.values[id]?.kind === 'sequence'),
          )
        ) {
          view = cubeView(context, variable, value)
        }
        if (
          view === null &&
          items.length > 0 &&
          items.every(
            (item) => item?.kind === 'sequence' || item?.kind === 'string',
          )
        ) {
          view = gridView(context, variable, value)
        }
        if (
          view === null &&
          items.every(
            (item) =>
              isScalar(item) ||
              isPairLike(item) ||
              item?.kind === 'record' ||
              item?.kind === 'ref',
          )
        ) {
          view = arrayView(context, variable, value)
        }
        if (view === null) view = arrayView(context, variable, value)
      }
    } else if (value.kind === 'mapping') {
      const adjacency = adjacencyOf(trace, name, value)
      view =
        adjacency === null
          ? mapView(context, variable, value)
          : graphView(context, variable, adjacency)
    } else if (value.kind === 'string') {
      const indexed = (trace.indexHints[name]?.length ?? 0) > 0
      const accessed = accessesFor(step, frame.id, name)
      if (
        (indexed || accessed.reads.length > 0 || accessed.writes.length > 0) &&
        value.length <= MAX_CELLS &&
        value.length > 0
      ) {
        view = stringView(context, variable, value)
      }
    } else if (value.kind === 'record' && objectRoots.has(variable)) {
      view = linkedView(context, variable, pointerNames, links)
    } else if (
      value.kind === 'record' &&
      value.objectId !== undefined &&
      value.fields.length > 0 &&
      !drawn.has(value.objectId) &&
      value.fields.some(([, id]) => isContainerValue(trace.values[id]))
    ) {
      // An object holding containers (a class with a list field): its fields.
      view = {
        ...base(context, variable),
        kind: 'record',
        fields: value.fields.slice(0, 16).map(([field, id]) => ({
          name: field,
          text: shorten(formatValue(trace, id), 60),
          state: 'none',
        })),
      }
    }
    if (view !== null) {
      const objectId =
        value.kind === 'sequence' || value.kind === 'mapping'
          ? value.objectId
          : undefined
      if (objectId !== undefined && shownObjects.has(objectId)) continue
      if (objectId !== undefined) shownObjects.add(objectId)
      structures.push(view)
      continue
    }
    if (variable.outer) continue
    const beforeId = previousFrames
      .find((item) => item.id === frame.id)
      ?.vars.find(([item]) => item === name)?.[1]
    const beforeValue =
      beforeId === undefined ? undefined : trace.values[beforeId]
    const changed = changedNames.has(key)
    const pointer =
      value.kind === 'record' &&
      value.objectId !== undefined &&
      drawn.has(value.objectId)
    scalars.push({
      id: key,
      name,
      owner: variable.global ? 'global' : frame.name,
      text: scalarText(trace, value, variable.id),
      ...(changed && beforeValue !== undefined && beforeId !== undefined
        ? { before: scalarText(trace, beforeValue, beforeId) }
        : {}),
      changed,
      fresh: changed && beforeId === undefined,
      kind: value.kind,
      pointer,
    })
  }
  return {
    narration: narrate(trace, index, sourceLines),
    scalars: byFirstSeen(trace, scalars),
    structures: byFirstSeen(trace, structures).slice(0, MAX_STRUCTURES),
    stack: step.frames
      .filter((frame) => frame.elided !== true)
      .map((frame) => ({ id: frame.id, name: frame.name, line: frame.line })),
  }
}

// Java's `args` and library readers/writers say nothing about the algorithm.
function isNoise(variable: Variable) {
  const { value, name } = variable
  if (name === 'args' && value.kind === 'sequence' && value.length === 0)
    return true
  if (
    value.kind === 'opaque' &&
    /^java\.(util|io)\.(Scanner|BufferedReader|InputStreamReader|PrintWriter|BufferedWriter|OutputStreamWriter|StringTokenizer|PrintStream)/.test(
      value.text,
    )
  ) {
    return true
  }
  return false
}

function isContainerValue(value: TraceValue | undefined) {
  return value?.kind === 'sequence' || value?.kind === 'mapping'
}

export type { TraceAccess }
