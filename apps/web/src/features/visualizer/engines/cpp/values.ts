// Runtime values for the C++ interpreter. Integers up to 32 bits are JS
// numbers; 64- and 128-bit integers are bigints. Containers are mutable
// objects with a version counter that snapshots use to skip unchanged data.

import type { FunctionDef, StructDef } from './ast'
import type { CType } from './types'

export type Scalar = number | bigint | boolean

export type SeqKind =
  'vector' | 'carray' | 'stdarray' | 'deque' | 'list' | 'stack' | 'queue'

export type CSeq = {
  kind: 'seq'
  seq: SeqKind
  elemType: CType
  items: Value[]
  ver: number
  // Highest index touched + 1, so big global arrays show only what the
  // program used.
  touched: number
  // C arrays have a fixed size; lazily created rows of int a[1000][1000].
  fixed: boolean
  lazyRows?: { rowType: CType; make: () => CSeq }
  // Scalar locals and arrays not yet written.
  uninit?: boolean
}

export type CStr = { kind: 'str'; s: string; ver: number }

export type CTuple = {
  kind: 'tuple'
  // pair: two items; tuple: any number.
  pair: boolean
  items: Value[]
  types: CType[]
  ver: number
  // Map entries: the key (first) cannot be assigned.
  keyLocked?: boolean
}

export type CStruct = {
  kind: 'struct'
  def: StructDef
  fields: Map<string, Value>
  fieldTypes: Map<string, CType>
  ver: number
}

export type CMap = {
  kind: 'map'
  type: Extract<CType, { k: 'map' }>
  // Entries are pairs (key, value). Ordered maps keep them sorted by key;
  // unordered ones keep insertion order with a hash index.
  entries: CTuple[]
  index: Map<string, CTuple> | null
  compare: Comparator
  ver: number
}

export type CSet = {
  kind: 'set'
  type: Extract<CType, { k: 'set' }>
  items: Value[]
  index: Map<string, number> | null
  compare: Comparator
  ver: number
}

export type CHeap = {
  kind: 'heap'
  elemType: CType
  // Binary max-heap by `compare` (the top compares greatest).
  items: Value[]
  compare: Comparator
  ver: number
}

export type CBitset = { kind: 'bitset'; bits: boolean[]; ver: number }

export type Closure = {
  kind: 'func'
  name: string
  fn: FunctionDef
  // Captured scope chain for lambdas.
  env: Scope | null
  self: CStruct | null
}

export type Builtin = {
  kind: 'builtin'
  name: string
  // Bound receiver for methods like v.push_back.
  receiver?: Value
}

export type Functor = {
  kind: 'functor'
  name: 'less' | 'greater' | 'less_equal' | 'greater_equal'
}

export type Iter = {
  kind: 'iter'
  target: CSeq | CStr | CMap | CSet
  index: number
  reverse: boolean
}

export type Stream = { kind: 'stream'; name: 'cin' | 'cout' | 'cerr' }

// A pointer only for scanf("%d", &x).
export type Pointer = { kind: 'ptr'; ref: Ref }

// A braced list such as {a, b} before it is converted to its target type.
export type InitList = { kind: 'initlist'; items: { t: CType; v: Value }[] }

export type Manipulator = {
  kind: 'manip'
  name: string
  arg?: number
}

export type Aggregate =
  CSeq | CStr | CTuple | CStruct | CMap | CSet | CHeap | CBitset

export type Value =
  | Scalar
  | Aggregate
  | Closure
  | Builtin
  | Functor
  | Iter
  | Stream
  | Pointer
  | Manipulator
  | InitList
  | null

export type Comparator = (a: Value, b: Value) => number

// Where an lvalue lives: for tracking a[i][j] reads and writes.
export type Origin = { frame: number; name: string; path: (number | string)[] }

export type Ref = {
  // get() records element reads; peek() does not.
  get(): Value
  peek(): Value
  set(value: Value): void
  type: CType
  origin?: Origin
  // Const refs: set elements and map keys.
  readonly?: boolean
}

export type Slot = {
  name: string
  type: CType
  value: Value
  ref?: Ref
  uninit?: boolean
  frame: number
}

export type Scope = {
  vars: Map<string, Slot>
  parent: Scope | null
  // The function activation this scope belongs to (0 for globals).
  frame: number
}

export const isAggregate = (value: Value): value is Aggregate =>
  typeof value === 'object' &&
  value !== null &&
  (value.kind === 'seq' ||
    value.kind === 'str' ||
    value.kind === 'tuple' ||
    value.kind === 'struct' ||
    value.kind === 'map' ||
    value.kind === 'set' ||
    value.kind === 'heap' ||
    value.kind === 'bitset')

export function bump(value: Aggregate) {
  value.ver += 1
}

// Deep copy for value semantics (assignment, pass by value).
export function copyValue(value: Value): Value {
  if (typeof value !== 'object' || value === null) return value
  switch (value.kind) {
    case 'seq': {
      const copy: CSeq = {
        kind: 'seq',
        seq: value.seq,
        elemType: value.elemType,
        items: value.items.map(copyValue),
        ver: 0,
        touched: value.touched,
        fixed: value.fixed,
      }
      if (value.lazyRows !== undefined) copy.lazyRows = value.lazyRows
      return copy
    }
    case 'str':
      return { kind: 'str', s: value.s, ver: 0 }
    case 'tuple': {
      const copy: CTuple = {
        kind: 'tuple',
        pair: value.pair,
        items: value.items.map(copyValue),
        types: value.types,
        ver: 0,
      }
      if (value.keyLocked === true) copy.keyLocked = true
      return copy
    }
    case 'struct': {
      const fields = new Map<string, Value>()
      for (const [name, field] of value.fields)
        fields.set(name, copyValue(field))
      return {
        kind: 'struct',
        def: value.def,
        fields,
        fieldTypes: value.fieldTypes,
        ver: 0,
      }
    }
    case 'map': {
      const entries = value.entries.map((entry) => copyValue(entry) as CTuple)
      let index: Map<string, CTuple> | null = null
      if (value.index !== null) {
        index = new Map()
        for (const entry of entries)
          index.set(keyOf(entry.items[0] ?? null), entry)
      }
      return { ...value, entries, index, ver: 0 }
    }
    case 'set': {
      const items = value.items.map(copyValue)
      return {
        ...value,
        items,
        index: value.index === null ? null : new Map(value.index),
        ver: 0,
      }
    }
    case 'heap':
      return { ...value, items: value.items.map(copyValue), ver: 0 }
    case 'bitset':
      return { kind: 'bitset', bits: [...value.bits], ver: 0 }
    default:
      return value
  }
}

// Canonical text used for hashing keys of unordered containers.
export function keyOf(value: Value): string {
  if (typeof value === 'bigint' || typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value === null) return 'null'
  switch (value.kind) {
    case 'str':
      return `"${value.s}`
    case 'tuple':
      return `(${value.items.map(keyOf).join(',')})`
    case 'seq':
      return `[${value.items.map(keyOf).join(',')}]`
    case 'struct':
      return `{${[...value.fields.values()].map(keyOf).join(',')}}`
    default:
      return `#${value.kind}`
  }
}

export function numeric(value: Value): number | bigint {
  if (typeof value === 'number' || typeof value === 'bigint') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  return 0
}

// Default ordering (operator<) for built-in types. Structs use their own
// operator< through the interpreter, passed in as `structLess`.
export function defaultCompare(
  a: Value,
  b: Value,
  structLess?: (a: CStruct, b: CStruct) => boolean,
): number {
  if (
    (typeof a === 'number' ||
      typeof a === 'bigint' ||
      typeof a === 'boolean') &&
    (typeof b === 'number' || typeof b === 'bigint' || typeof b === 'boolean')
  ) {
    const x = numeric(a)
    const y = numeric(b)
    return x < y ? -1 : x > y ? 1 : 0
  }
  if (
    typeof a === 'object' &&
    a !== null &&
    typeof b === 'object' &&
    b !== null
  ) {
    if (a.kind === 'str' && b.kind === 'str') {
      return a.s < b.s ? -1 : a.s > b.s ? 1 : 0
    }
    if (
      (a.kind === 'tuple' && b.kind === 'tuple') ||
      (a.kind === 'seq' && b.kind === 'seq')
    ) {
      const length = Math.min(a.items.length, b.items.length)
      for (let i = 0; i < length; i += 1) {
        const order = defaultCompare(
          a.items[i] ?? null,
          b.items[i] ?? null,
          structLess,
        )
        if (order !== 0) return order
      }
      return a.items.length - b.items.length
    }
    if (
      a.kind === 'struct' &&
      b.kind === 'struct' &&
      structLess !== undefined
    ) {
      if (structLess(a, b)) return -1
      if (structLess(b, a)) return 1
      return 0
    }
  }
  return 0
}

export function valuesEqual(a: Value, b: Value): boolean {
  if (
    (typeof a === 'number' ||
      typeof a === 'bigint' ||
      typeof a === 'boolean') &&
    (typeof b === 'number' || typeof b === 'bigint' || typeof b === 'boolean')
  ) {
    return numeric(a) == numeric(b)
  }
  return keyOf(a) === keyOf(b)
}

// Binary search for the first position whose item is not less than `value`
// (lower) or greater than `value` (upper).
export function bound(
  items: readonly Value[],
  value: Value,
  compare: Comparator,
  upper: boolean,
  key: (item: Value) => Value = (item) => item,
): number {
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const order = compare(key(items[mid] ?? null), value)
    if (upper ? order <= 0 : order < 0) lo = mid + 1
    else hi = mid
  }
  return lo
}
