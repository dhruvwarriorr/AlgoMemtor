// The recursion tree: every function activation recorded in the trace, with
// its arguments and its return value, arranged by who called whom.

import { formatValue, shorten } from '../analysis'
import type { ExecutionTrace } from '../trace'
import { tidyTree, type Point } from './layout'
import type { CallNode } from './types'

export type CallTree = {
  nodes: Map<number, CallNode>
  // Top-level activations (called from main or the module).
  roots: number[]
  // Some function calls itself (directly or through others).
  recursive: boolean
}

const caches = new WeakMap<ExecutionTrace, CallTree>()

const ENTRY_NAMES = new Set(['main', '<module>', 'global'])

export const CALL_TREE_LIMIT = 160

export const CALL_GAP = 104

// A short argument: objects by their first value, e.g. Node(12).
function argText(trace: ExecutionTrace, id: number): string {
  const value = trace.values[id]
  if (value?.kind === 'record' && value.objectId !== undefined) {
    const field = value.fields.find(([, item]) => {
      const kind = trace.values[item]?.kind
      return kind === 'number' || kind === 'string' || kind === 'char'
    })
    const inner =
      field === undefined ? '' : shorten(formatValue(trace, field[1]), 6)
    return `${value.type.replace(/\*$/, '')}(${inner})`
  }
  if (value?.kind === 'sequence') return `[${value.length}]`
  if (value?.kind === 'mapping') return `{${value.length}}`
  return shorten(formatValue(trace, id), 10)
}

function argsText(trace: ExecutionTrace, vars: [string, number][]) {
  return vars
    .filter(([name]) => name !== 'this' && name !== 'self')
    .slice(0, 3)
    .map(([, id]) => argText(trace, id))
    .join(', ')
}

function isEntry(name: string) {
  return ENTRY_NAMES.has(name) || /\.main$/.test(name)
}

export function callTree(trace: ExecutionTrace): CallTree {
  const cached = caches.get(trace)
  if (cached !== undefined) return cached
  const nodes = new Map<number, CallNode>()
  const roots: number[] = []
  let recursive = false
  trace.steps.forEach((step, index) => {
    const top = step.frames.at(-1)
    if (top === undefined) return
    if (step.event === 'call' && !nodes.has(top.id) && top.id !== 0) {
      if (isEntry(top.name)) return
      let parent: number | null = null
      for (let f = step.frames.length - 2; f >= 0; f -= 1) {
        const frame = step.frames[f]
        if (frame !== undefined && nodes.has(frame.id)) {
          parent = frame.id
          break
        }
      }
      const node: CallNode = {
        frame: top.id,
        name: top.name.replace(/^[A-Z]\w*\./, ''),
        args: argsText(trace, top.vars),
        parent,
        children: [],
        callStep: index,
        returnStep: null,
        value: null,
      }
      nodes.set(top.id, node)
      if (parent === null) roots.push(top.id)
      else {
        const parentNode = nodes.get(parent)
        parentNode?.children.push(top.id)
        // Recursion: the same function is already on the chain.
        for (
          let ancestor = parentNode;
          ancestor !== undefined && !recursive;
          ancestor =
            ancestor.parent === null ? undefined : nodes.get(ancestor.parent)
        ) {
          if (ancestor.name === top.name) recursive = true
        }
      }
    } else if (step.event === 'return') {
      const node = nodes.get(top.id)
      if (node !== undefined && node.returnStep === null) {
        node.returnStep = index
        node.value =
          step.value === undefined
            ? null
            : shorten(formatValue(trace, step.value), 16)
      }
    }
  })
  const tree = { nodes, roots, recursive }
  caches.set(trace, tree)
  return tree
}

export type CallTreeState = 'active' | 'current' | 'returned' | 'waiting'

export type CallTreeView = {
  nodes: {
    frame: number
    label: string
    value: string | null
    state: CallTreeState
    x: number
    y: number
  }[]
  edges: { from: number; to: number }[]
  width: number
  height: number
  hidden: number
}

// The part of the call tree that exists at a step: calls made so far,
// with the ones still running highlighted.
export function callTreeAt(
  trace: ExecutionTrace,
  index: number,
): CallTreeView | null {
  const tree = callTree(trace)
  if (tree.nodes.size === 0) return null
  const step = trace.steps[index]
  const running = new Set(step?.frames.map((frame) => frame.id) ?? [])
  const current = step?.frames.at(-1)?.id
  const visible = [...tree.nodes.values()]
    .filter((node) => node.callStep <= index)
    .sort((a, b) => a.callStep - b.callStep)
  const shown = new Set(
    visible.slice(0, CALL_TREE_LIMIT).map((node) => node.frame),
  )
  if (shown.size === 0) return null
  const children = new Map<string, string[]>()
  const top: string[] = []
  for (const node of tree.nodes.values()) {
    if (!shown.has(node.frame)) continue
    const kids = node.children
      .filter((kid) => shown.has(kid))
      .map((kid) => String(kid))
    children.set(String(node.frame), kids)
    if (node.parent === null || !shown.has(node.parent)) {
      top.push(String(node.frame))
    }
  }
  children.set('root', top)
  const { positions, width, height } = tidyTree('root', children, CALL_GAP)
  const lift = (point: Point | undefined) =>
    point === undefined ? { x: 0, y: 0 } : { x: point.x, y: point.y - 76 }
  const nodes: CallTreeView['nodes'] = []
  const edges: CallTreeView['edges'] = []
  for (const frame of shown) {
    const node = tree.nodes.get(frame) as CallNode
    const returned = node.returnStep !== null && node.returnStep <= index
    const point = lift(positions.get(String(frame)))
    nodes.push({
      frame,
      label: `${node.name}(${node.args})`,
      value: returned ? node.value : null,
      state:
        frame === current
          ? 'current'
          : running.has(frame)
            ? 'active'
            : returned
              ? 'returned'
              : 'waiting',
      x: point.x,
      y: point.y,
    })
    if (node.parent !== null && shown.has(node.parent)) {
      edges.push({ from: node.parent, to: frame })
    }
  }
  return {
    nodes,
    edges,
    width,
    height: Math.max(80, height - 76),
    hidden: visible.length - shown.size,
  }
}
