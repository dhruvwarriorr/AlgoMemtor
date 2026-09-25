// Stable keys for the items of a container across steps, so an animation
// can follow a value when it moves: a swap in an array slides two cells, a
// pop removes the right item, a push adds one. Keys at a step are derived
// from the keys at the previous step, so they are computed along the trace
// and cached.

import type { ExecutionTrace, TraceValue } from '../trace'

export type KeyMode = 'positional' | 'ordered'

type Entry = { items: string[]; keys: string[] }

type StructureKeys = {
  counter: number
  byStep: Map<number, Entry>
}

const caches = new WeakMap<ExecutionTrace, Map<string, StructureKeys>>()

// How far back keys are followed before starting fresh. Long gaps only lose
// the slide animation, never correctness.
const MAX_WALK = 400
// Longest common subsequence is used when it stays cheap.
const LCS_LIMIT = 60_000

// Identity of an item: the object for objects, the value otherwise.
export function itemIdentity(trace: ExecutionTrace, id: number): string {
  const value: TraceValue | undefined = trace.values[id]
  if (value === undefined) return `?${id}`
  if (
    (value.kind === 'record' ||
      value.kind === 'sequence' ||
      value.kind === 'mapping') &&
    value.objectId !== undefined
  ) {
    return `@${value.objectId}`
  }
  if (value.kind === 'ref') return `@${value.objectId}`
  return `v${id}`
}

function fresh(state: StructureKeys, structure: string) {
  state.counter += 1
  return `${structure}#${state.counter}`
}

function positional(
  previous: Entry,
  items: string[],
  next: () => string,
): string[] {
  const keys: (string | null)[] = items.map((item, index) =>
    previous.items[index] === item ? (previous.keys[index] ?? null) : null,
  )
  const used = new Set<number>()
  keys.forEach((key, index) => {
    if (key !== null) used.add(index)
  })
  for (let j = 0; j < items.length; j += 1) {
    if (keys[j] !== null) continue
    // A value that moved: take the nearest unused previous slot with it.
    let best = -1
    for (let i = 0; i < previous.items.length; i += 1) {
      if (used.has(i) || previous.items[i] !== items[j]) continue
      if (best < 0 || Math.abs(i - j) < Math.abs(best - j)) best = i
    }
    // Only a value that left its old slot moves; an unchanged slot keeps it.
    if (best >= 0 && previous.items[best] !== items[best]) {
      used.add(best)
      keys[j] = previous.keys[best] ?? null
    }
  }
  return keys.map((key) => key ?? next())
}

function ordered(
  previous: Entry,
  items: string[],
  next: () => string,
): string[] {
  const a = previous.items
  const b = items
  const keys: (string | null)[] = b.map(() => null)
  if (a.length * b.length <= LCS_LIMIT) {
    const table: number[][] = Array.from({ length: a.length + 1 }, () =>
      new Array<number>(b.length + 1).fill(0),
    )
    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        const row = table[i]
        row[j] =
          a[i] === b[j]
            ? (table[i + 1]?.[j + 1] ?? 0) + 1
            : Math.max(table[i + 1]?.[j] ?? 0, row[j + 1] ?? 0)
      }
    }
    let i = 0
    let j = 0
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        keys[j] = previous.keys[i] ?? null
        i += 1
        j += 1
      } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
        i += 1
      } else {
        j += 1
      }
    }
  } else {
    let i = 0
    for (let j = 0; j < b.length && i < a.length; j += 1) {
      const found = a.indexOf(b[j], i)
      if (found >= 0) {
        keys[j] = previous.keys[found] ?? null
        i = found + 1
      }
    }
  }
  return keys.map((key) => key ?? next())
}

// Keys for the items of structure `structure` at step `index`. `itemsAt`
// returns the item identities at a step, or null when the structure does not
// exist there.
export function stableKeys(
  trace: ExecutionTrace,
  structure: string,
  index: number,
  itemsAt: (step: number) => string[] | null,
  mode: KeyMode,
): string[] {
  let cache = caches.get(trace)
  if (cache === undefined) {
    cache = new Map()
    caches.set(trace, cache)
  }
  let state = cache.get(structure)
  if (state === undefined) {
    state = { counter: 0, byStep: new Map() }
    cache.set(structure, state)
  }
  const known = state.byStep.get(index)
  if (known !== undefined) return known.keys
  // Walk back to a cached step or the start of this structure.
  const pending: { step: number; items: string[] }[] = []
  let base: Entry | null = null
  for (let step = index; step >= 0 && index - step <= MAX_WALK; step -= 1) {
    const cached = state.byStep.get(step)
    if (cached !== undefined) {
      base = cached
      break
    }
    const items = itemsAt(step)
    if (items === null) break
    pending.push({ step, items })
  }
  const owner = state
  const next = () => fresh(owner, structure)
  let previous = base
  for (let k = pending.length - 1; k >= 0; k -= 1) {
    const { step, items } = pending[k]
    const keys =
      previous === null
        ? items.map(() => next())
        : mode === 'positional'
          ? positional(previous, items, next)
          : ordered(previous, items, next)
    const entry = { items, keys }
    owner.byStep.set(step, entry)
    previous = entry
  }
  return owner.byStep.get(index)?.keys ?? []
}
