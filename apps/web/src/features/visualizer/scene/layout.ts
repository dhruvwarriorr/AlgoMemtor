// Deterministic layouts for graphs and trees. The same input always gives the
// same picture, so a node never jumps between two runs of the same program.

export type Point = { x: number; y: number }

export type LayoutEdge = { from: string; to: string }

export const NODE_GAP_X = 64
export const NODE_GAP_Y = 76
const PADDING = 36

// Tidy tree: leaves take consecutive columns, a parent sits over its
// children. `children` lists the child ids of each node in order.
export function tidyTree(
  root: string,
  children: ReadonlyMap<string, readonly string[]>,
  gapX = NODE_GAP_X,
): { positions: Map<string, Point>; width: number; height: number } {
  const positions = new Map<string, Point>()
  let column = 0
  let depthMax = 0
  const seen = new Set<string>()
  const place = (id: string, depth: number): number => {
    seen.add(id)
    depthMax = Math.max(depthMax, depth)
    const kids = (children.get(id) ?? []).filter((kid) => !seen.has(kid))
    if (kids.length === 0) {
      const x = column
      column += 1
      positions.set(id, { x, y: depth })
      return x
    }
    const xs = kids.map((kid) => place(kid, depth + 1))
    const x = ((xs[0] ?? 0) + (xs[xs.length - 1] ?? 0)) / 2
    positions.set(id, { x, y: depth })
    return x
  }
  place(root, 0)
  return scale(positions, column - 1, depthMax, gapX)
}

// Binary tree by in-order position: every node has its own column, so left
// subtrees are always left of their parent (the textbook BST picture).
export function inorderTree(
  root: string,
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>,
): { positions: Map<string, Point>; width: number; height: number } {
  const positions = new Map<string, Point>()
  let column = 0
  let depthMax = 0
  const seen = new Set<string>()
  const visit = (id: string | undefined, depth: number) => {
    if (id === undefined || seen.has(id)) return
    seen.add(id)
    depthMax = Math.max(depthMax, depth)
    visit(left.get(id), depth + 1)
    positions.set(id, { x: column, y: depth })
    column += 1
    visit(right.get(id), depth + 1)
  }
  visit(root, 0)
  return scale(positions, column - 1, depthMax)
}

function scale(
  grid: Map<string, Point>,
  columns: number,
  depth: number,
  gapX = NODE_GAP_X,
): { positions: Map<string, Point>; width: number; height: number } {
  const positions = new Map<string, Point>()
  for (const [id, point] of grid) {
    positions.set(id, {
      x: PADDING + point.x * gapX,
      y: PADDING + point.y * NODE_GAP_Y,
    })
  }
  return {
    positions,
    width: PADDING * 2 + Math.max(0, columns) * gapX,
    height: PADDING * 2 + depth * NODE_GAP_Y,
  }
}

// A small pseudo-random generator so force layouts are reproducible.
function random(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 10_000) / 10_000
  }
}

function isTree(nodes: readonly string[], edges: readonly LayoutEdge[]) {
  if (nodes.length === 0 || edges.length !== nodes.length - 1) return false
  const adjacent = new Map<string, string[]>()
  for (const edge of edges) {
    adjacent.set(edge.from, [...(adjacent.get(edge.from) ?? []), edge.to])
    adjacent.set(edge.to, [...(adjacent.get(edge.to) ?? []), edge.from])
  }
  const seen = new Set<string>([nodes[0]])
  const queue = [nodes[0]]
  while (queue.length > 0) {
    const node = queue.shift() as string
    for (const next of adjacent.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen.size === nodes.length
}

// Graph layout: trees are drawn layered from their first node, other graphs
// with a force-directed layout (Fruchterman–Reingold) seeded from a circle.
export function graphLayout(
  nodes: readonly string[],
  edges: readonly LayoutEdge[],
): { positions: Map<string, Point>; width: number; height: number } {
  if (nodes.length === 0) {
    return { positions: new Map(), width: 0, height: 0 }
  }
  if (isTree(nodes, edges)) {
    const children = new Map<string, string[]>()
    const adjacent = new Map<string, string[]>()
    for (const edge of edges) {
      adjacent.set(edge.from, [...(adjacent.get(edge.from) ?? []), edge.to])
      adjacent.set(edge.to, [...(adjacent.get(edge.to) ?? []), edge.from])
    }
    const root = nodes[0]
    const seen = new Set([root])
    const queue = [root]
    while (queue.length > 0) {
      const node = queue.shift() as string
      const kids: string[] = []
      for (const next of adjacent.get(node) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        kids.push(next)
        queue.push(next)
      }
      children.set(node, kids)
    }
    return tidyTree(root, children)
  }
  const count = nodes.length
  const width = Math.max(320, Math.min(820, 130 * Math.sqrt(count) + 160))
  const height = Math.max(240, Math.min(520, 100 * Math.sqrt(count) + 120))
  const area = width * height
  const k = Math.sqrt(area / count) * 0.9
  const rand = random(count * 7919 + edges.length * 104_729)
  const pos = nodes.map((_, index) => {
    const angle = (2 * Math.PI * index) / count - Math.PI / 2
    return {
      x: width / 2 + (width / 2.6) * Math.cos(angle) + (rand() - 0.5) * 4,
      y: height / 2 + (height / 2.6) * Math.sin(angle) + (rand() - 0.5) * 4,
    }
  })
  const index = new Map(nodes.map((node, i) => [node, i]))
  const links = edges
    .map((edge) => [index.get(edge.from), index.get(edge.to)] as const)
    .filter(
      (pair): pair is readonly [number, number] =>
        pair[0] !== undefined && pair[1] !== undefined && pair[0] !== pair[1],
    )
  let temperature = width / 8
  for (let iteration = 0; iteration < 260; iteration += 1) {
    const shift = pos.map(() => ({ x: 0, y: 0 }))
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const a = pos[i]
        const b = pos[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let distance = Math.hypot(dx, dy)
        if (distance < 0.01) {
          dx = rand() - 0.5
          dy = rand() - 0.5
          distance = 0.01
        }
        const force = (k * k) / distance
        const fx = (dx / distance) * force
        const fy = (dy / distance) * force
        shift[i].x += fx
        shift[i].y += fy
        shift[j].x -= fx
        shift[j].y -= fy
      }
    }
    for (const [i, j] of links) {
      const a = pos[i]
      const b = pos[j]
      const dx = a.x - b.x
      const dy = a.y - b.y
      const distance = Math.max(0.01, Math.hypot(dx, dy))
      const force = (distance * distance) / k
      const fx = (dx / distance) * force
      const fy = (dy / distance) * force
      shift[i].x -= fx
      shift[i].y -= fy
      shift[j].x += fx
      shift[j].y += fy
    }
    for (let i = 0; i < count; i += 1) {
      const move = shift[i]
      const length = Math.max(0.01, Math.hypot(move.x, move.y))
      const point = pos[i]
      point.x += (move.x / length) * Math.min(length, temperature)
      point.y += (move.y / length) * Math.min(length, temperature)
      // A gentle pull to the centre keeps separate components close.
      point.x += (width / 2 - point.x) * 0.01
      point.y += (height / 2 - point.y) * 0.01
    }
    temperature = Math.max(1, temperature * 0.97)
  }
  // Fit into the box with padding.
  const xs = pos.map((point) => point.x)
  const ys = pos.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const positions = new Map<string, Point>()
  nodes.forEach((node, i) => {
    const point = pos[i]
    positions.set(node, {
      x: PADDING + ((point.x - minX) / spanX) * (width - 2 * PADDING),
      y: PADDING + ((point.y - minY) / spanY) * (height - 2 * PADDING),
    })
  })
  return { positions, width, height }
}
