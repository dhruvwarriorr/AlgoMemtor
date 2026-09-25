// What the visualizer draws for one step. A scene is derived only from the
// recorded trace: structures are the program's own variables, classified by
// their recorded shape (and, where the shape is ambiguous, by the variable's
// name), so nothing here is guessed by a model.

import type { SequenceShape, TraceValue } from '../trace'

export type CellState = 'none' | 'read' | 'write' | 'changed' | 'new'

export type Cell = {
  // Stable across steps so a moved value slides instead of blinking.
  key: string
  text: string
  // Numeric value for bars and heat colours; null for non-numbers.
  numeric: number | null
  state: CellState
}

export type PointerMark = { name: string; index: number }

type StructureBase = {
  // `${frameId}:${name}`, stable while the variable lives.
  id: string
  name: string
  // The function the variable belongs to; "global" for globals.
  owner: string
  type: string
  // Changed on this step.
  changed: boolean
  // Read or written on this step.
  active: boolean
}

export type ArrayView = StructureBase & {
  kind: 'array'
  cells: Cell[]
  length: number
  pointers: PointerMark[]
  window: [number, number] | null
  numeric: boolean
  min: number
  max: number
  // A string drawn as its characters.
  text: boolean
  // Bars suit long numeric arrays (sorting, searching); cells otherwise.
  style: 'cells' | 'bars'
}

export type GridView = StructureBase & {
  kind: 'grid'
  rows: Cell[][]
  rowCount: number
  colCount: number
  rowPointers: PointerMark[]
  colPointers: PointerMark[]
  numeric: boolean
  min: number
  max: number
  // A character maze: '#' walls, '.' floor.
  maze: boolean
}

export type CubeView = StructureBase & {
  kind: 'cube'
  layers: Cell[][][]
  numeric: boolean
  min: number
  max: number
}

export type StackView = StructureBase & {
  kind: 'stack'
  // Bottom first; the last item is the top.
  items: Cell[]
  length: number
}

export type QueueView = StructureBase & {
  kind: 'queue'
  // Front first.
  items: Cell[]
  length: number
  double: boolean
}

export type HeapView = StructureBase & {
  kind: 'heap'
  // Array order: item i has children 2i+1 and 2i+2.
  items: Cell[]
  length: number
  // Which end comes out first, judged from the recorded items.
  order: 'min' | 'max' | 'unknown'
  // Items in the order they would be removed, when they can be compared.
  popOrder: string[] | null
  // What this step added and removed.
  pushed: string[]
  popped: string[]
}

export type MapEntryView = {
  key: string
  keyText: string
  valueText: string
  state: CellState
}

export type MapView = StructureBase & {
  kind: 'map'
  entries: MapEntryView[]
  length: number
}

export type SetView = StructureBase & {
  kind: 'set'
  items: Cell[]
  length: number
}

export type GraphNodeState =
  'none' | 'visited' | 'current' | 'neighbor' | 'frontier'

export type GraphNode = {
  id: number
  label: string
  x: number
  y: number
  state: GraphNodeState
  // A per-node value such as dist[v].
  badge?: string
}

export type GraphEdge = {
  from: number
  to: number
  weight?: string
  active: boolean
}

export type GraphView = StructureBase & {
  kind: 'graph'
  nodes: GraphNode[]
  edges: GraphEdge[]
  directed: boolean
  width: number
  height: number
  // Name of the array whose values label the nodes, e.g. "dist".
  badgeSource?: string
  visitedSource?: string
}

export type NodeView = {
  key: string
  label: string
  badges: string[]
  // Variables pointing at this node, e.g. ["cur", "head"].
  pointers: string[]
  state: CellState
  x: number
  y: number
}

export type TreeView = StructureBase & {
  kind: 'tree'
  nodes: NodeView[]
  edges: { from: string; to: string; side?: 'left' | 'right' }[]
  width: number
  height: number
}

export type ListView = StructureBase & {
  kind: 'list'
  nodes: NodeView[]
  // Index of the node the last one points back to (a cycle), if any.
  cycleTo: number | null
  doubly: boolean
  // More nodes follow that were not recorded.
  more: boolean
}

export type RecordView = StructureBase & {
  kind: 'record'
  fields: { name: string; text: string; state: CellState }[]
}

export type StructureView =
  | ArrayView
  | GridView
  | CubeView
  | StackView
  | QueueView
  | HeapView
  | MapView
  | SetView
  | GraphView
  | TreeView
  | ListView
  | RecordView

export type StructureKind = StructureView['kind']

export type ScalarChip = {
  id: string
  name: string
  owner: string
  text: string
  before?: string
  changed: boolean
  // Declared on this step.
  fresh: boolean
  kind: TraceValue['kind']
  // Points into a drawn structure (a node) rather than holding a value.
  pointer: boolean
}

export type NarrationTone =
  | 'info'
  | 'true'
  | 'false'
  | 'loop'
  | 'call'
  | 'return'
  | 'output'
  | 'input'
  | 'warning'
  | 'error'
  | 'done'

export type Narration = {
  tone: NarrationTone
  // One short sentence, e.g. "a[mid] < target is true, go right".
  headline: string
  // The source being evaluated, e.g. "a[mid] < target".
  code?: string
  // The same with values substituted, e.g. "23 < 40".
  evaluated?: string
  detail?: string[]
}

export type CallNode = {
  frame: number
  name: string
  args: string
  parent: number | null
  children: number[]
  callStep: number
  returnStep: number | null
  value: string | null
}

export type Scene = {
  narration: Narration
  scalars: ScalarChip[]
  structures: StructureView[]
  // Innermost last.
  stack: { id: number; name: string; line: number }[]
}

export type { SequenceShape }
