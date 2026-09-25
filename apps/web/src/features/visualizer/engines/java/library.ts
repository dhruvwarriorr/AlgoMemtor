// The Java standard library subset: String, StringBuilder, collections,
// maps and sets (with Java's HashMap iteration order), PriorityQueue (with
// Java's heap layout), Scanner/BufferedReader/StringTokenizer input,
// System.out/PrintWriter output, Math, wrappers, Arrays, Collections,
// Comparator and a small Stream API.

import {
  commonType,
  compareArith,
  convertScalar,
  toJsNumber,
  truthy,
  type TV,
} from '../cpp/arith'
import type { Expr } from '../cpp/ast'
import { formatPrintf, type PrintfArg } from '../cpp/format'
import type { MethodResult } from '../cpp/interpreter'
import { tv } from '../cpp/runtime'
import { intRange, T, type CType } from '../cpp/types'
import {
  bound,
  bump,
  keyOf,
  type CHeap,
  type CMap,
  type CSeq,
  type CSet,
  type CStr,
  type CTuple,
  type JObj,
  type Ref,
  type Value,
} from '../cpp/values'
import { javaDouble, javaTypeName } from './format'
import {
  exceptionObject,
  isExceptionClass,
  type JavaInterpreter,
} from './interpreter'
import { JCHAR } from './parser'

type Call = Expr & { k: 'call' }

const VOID: TV = { t: T.void, v: null }
const INTEGER: CType = { ...T.int, boxed: true } as CType
const LONG: CType = { ...T.ll, boxed: true } as CType
const DOUBLE: CType = { k: 'float', name: 'double', boxed: true }
const CHARACTER: CType = { ...JCHAR, boxed: true } as CType

const int = (n: number): TV => tv(T.int, n | 0)
const long = (n: bigint): TV => tv(T.ll, BigInt.asIntN(64, n))
const double = (x: number): TV => tv(T.double, x)
const bool = (b: boolean): TV => tv(T.bool, b)
const char = (code: number): TV => tv(JCHAR, code & 0xffff)

function evalAll(it: JavaInterpreter, args: Expr[]): TV[] {
  return args.map((arg) => it.eval(arg))
}

function num(value: TV): number {
  return Number(toJsNumber(value.v))
}

function big(value: TV): bigint {
  const v = value.v
  if (typeof v === 'bigint') return v
  if (typeof v === 'number') return BigInt(Math.trunc(v))
  return truthy(v) ? 1n : 0n
}

function text(it: JavaInterpreter, value: TV | undefined): string {
  if (value === undefined) return ''
  return it.str(value)
}

function isIntType(type: CType) {
  return type.k === 'int' && type.char !== true
}

function isLongType(type: CType) {
  return type.k === 'int' && type.bits >= 64
}

function requireArg(
  it: JavaInterpreter,
  args: TV[],
  index: number,
  name: string,
): TV {
  const value = args[index]
  if (value === undefined)
    it.fail('Compile error', `${name} needs more arguments.`)
  return value
}

// ---- hashing and HashMap order ---------------------------------------------------

function stringHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i += 1)
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

function doubleHash(x: number): number {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, Number.isNaN(x) ? NaN : x)
  const bits = view.getBigUint64(0)
  return Number(BigInt.asIntN(32, bits ^ (bits >> 32n)))
}

export function javaHash(
  it: JavaInterpreter,
  value: Value,
  type?: CType,
): number {
  if (value === null) return 0
  if (typeof value === 'boolean') return value ? 1231 : 1237
  if (typeof value === 'bigint')
    return Number(BigInt.asIntN(32, value ^ (BigInt.asUintN(64, value) >> 32n)))
  if (typeof value === 'number') {
    if (type?.k === 'float') return doubleHash(value)
    return value | 0
  }
  switch (value.kind) {
    case 'str':
      return stringHash(value.s)
    case 'tuple':
      return (
        javaHash(it, value.items[0] ?? null, value.types[0]) ^
        javaHash(it, value.items[1] ?? null, value.types[1])
      )
    case 'seq':
      if (value.seq === 'carray') return Number.parseInt(it.hash(value), 16) | 0
      return value.items.reduce<number>(
        (h, item) =>
          (Math.imul(31, h) + javaHash(it, item, value.elemType)) | 0,
        1,
      )
    case 'struct':
      return it.structHash(value)
    default:
      return Number.parseInt(it.hash(value), 16) | 0
  }
}

// A HashMap/HashSet is simulated bucket by bucket so iteration follows
// Java exactly: buckets in index order, and inside a bucket the order nodes
// were linked (put appends; merge/compute/computeIfAbsent prepend). Resizing
// splits every bucket keeping relative order. LinkedHash* and Tree* keep
// their own order and are not simulated.
type Node = { key: string; hash: number }
type HashState = { capacity: number; buckets: Node[][]; size: number }
const hashStates = new WeakMap<object, HashState>()

function isHashed(container: CMap | CSet) {
  return container.jclass === 'HashMap' || container.jclass === 'HashSet'
}

function emptyBuckets(capacity: number): Node[][] {
  return Array.from({ length: capacity }, () => [])
}

function hashState(container: object, capacity = 16): HashState {
  let state = hashStates.get(container)
  if (state === undefined) {
    state = { capacity, buckets: emptyBuckets(capacity), size: 0 }
    hashStates.set(container, state)
  }
  return state
}

function spread(h: number): number {
  return (h ^ (h >>> 16)) | 0
}

function grow(state: HashState) {
  while (state.size > state.capacity * 0.75) {
    const capacity = state.capacity * 2
    const buckets = emptyBuckets(capacity)
    for (const bucket of state.buckets) {
      for (const node of bucket) buckets[node.hash & (capacity - 1)]?.push(node)
    }
    state.capacity = capacity
    state.buckets = buckets
  }
}

function hashInsert(
  it: JavaInterpreter,
  container: CMap | CSet,
  key: Value,
  keyType: CType,
  head: boolean,
) {
  if (!isHashed(container)) return
  const state = hashState(container)
  const hash = spread(javaHash(it, key, keyType))
  const bucket = state.buckets[hash & (state.capacity - 1)]
  const node = { key: keyOf(key), hash }
  if (head) bucket?.unshift(node)
  else bucket?.push(node)
  state.size += 1
  grow(state)
  applyHashOrder(container)
}

function hashRemove(container: CMap | CSet, key: Value) {
  if (!isHashed(container)) return
  const state = hashStates.get(container)
  if (state === undefined) return
  const wanted = keyOf(key)
  for (const bucket of state.buckets) {
    const index = bucket.findIndex((node) => node.key === wanted)
    if (index >= 0) {
      bucket.splice(index, 1)
      state.size -= 1
      break
    }
  }
  applyHashOrder(container)
}

function hashClear(container: CMap | CSet) {
  const state = hashStates.get(container)
  if (state === undefined) return
  state.buckets = emptyBuckets(state.capacity)
  state.size = 0
}

// Puts entries/items in the simulated iteration order.
function applyHashOrder(container: CMap | CSet) {
  const state = hashStates.get(container)
  if (state === undefined) return
  const order = new Map<string, number>()
  for (const bucket of state.buckets) {
    for (const node of bucket) order.set(node.key, order.size)
  }
  const rank = (key: string) => order.get(key) ?? Number.MAX_SAFE_INTEGER
  if (container.kind === 'map') {
    container.entries.sort(
      (a, b) =>
        rank(keyOf(a.items[0] ?? null)) - rank(keyOf(b.items[0] ?? null)),
    )
    return
  }
  container.items.sort((a, b) => rank(keyOf(a)) - rank(keyOf(b)))
  if (container.index !== null) {
    container.index.clear()
    container.items.forEach((item, position) =>
      container.index?.set(keyOf(item), position),
    )
  }
}

// HashMap(int), HashSet(Collection) and HashMap(Map) table sizes.
function presize(container: CMap | CSet, capacity: number) {
  if (!isHashed(container)) return
  hashState(container, tableSize(capacity))
}

// ---- construction ------------------------------------------------------------------

function newContainer(it: JavaInterpreter, type: CType, jclass: string): Value {
  const value = it.defaultValue(type)
  if (
    typeof value === 'object' &&
    value !== null &&
    'jclass' in (value as object)
  ) {
    ;(value as { jclass?: string }).jclass = jclass
  } else if (typeof value === 'object' && value !== null) {
    ;(value as { jclass?: string }).jclass = jclass
  }
  return value
}

function elemsOf(
  it: JavaInterpreter,
  value: Value,
): { items: Value[]; type: CType } {
  if (value === null) it.npe('A null collection was passed.')
  if (typeof value !== 'object')
    it.fail('Compile error', 'Expected a collection.')
  switch (value.kind) {
    case 'seq':
      return { items: [...value.items], type: value.elemType }
    case 'set':
      return { items: [...value.items], type: value.type.elem }
    case 'heap':
      return { items: [...value.items], type: value.elemType }
    case 'map':
      return {
        items: [...value.entries],
        type: { k: 'pair', first: value.type.key, second: value.type.value },
      }
    case 'jobj':
      if (value.cls === 'Stream')
        return {
          items: [...(value.state.items as Value[])],
          type: value.state.type as CType,
        }
      break
    default:
      break
  }
  return it.fail('Compile error', 'Expected a collection.')
}

function javaHeapCompare(it: JavaInterpreter, comparator: Value | null) {
  const order = it.comparatorFor(comparator)
  // CHeap keeps the greatest element on top; Java keeps the least.
  return (a: Value, b: Value) => -order(a, b)
}

function isComparatorValue(value: Value): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value.kind === 'func' ||
      value.kind === 'struct' ||
      (value.kind === 'jobj' && value.call !== undefined))
  )
}

const listClasses = new Set(['ArrayList', 'LinkedList', 'Vector', 'ArrayDeque'])
const mapClasses = new Set(['HashMap', 'LinkedHashMap', 'TreeMap'])
const setClasses = new Set(['HashSet', 'LinkedHashSet', 'TreeSet'])

export function constructJava(
  it: JavaInterpreter,
  type: CType,
  args: TV[],
  line: number,
  className?: string,
): TV {
  void line
  const first = args[0]
  switch (type.k) {
    case 'vector':
    case 'deque':
    case 'stack':
    case 'queue': {
      const jclass =
        type.k === 'stack'
          ? 'Stack'
          : className !== undefined && listClasses.has(className)
            ? className
            : type.k === 'vector'
              ? 'ArrayList'
              : 'ArrayDeque'
      const seq = newContainer(
        it,
        type.k === 'queue' ? { k: 'deque', elem: type.elem } : type,
        jclass,
      ) as CSeq
      if (
        first !== undefined &&
        typeof first.v === 'object' &&
        first.v !== null
      ) {
        seq.items = elemsOf(it, first.v).items
      }
      return tv(type, seq)
    }
    case 'pq': {
      const cmpArg = args.find((arg) => isComparatorValue(arg.v))
      const heap: CHeap = {
        kind: 'heap',
        elemType: type.elem,
        items: [],
        compare: javaHeapCompare(it, cmpArg?.v ?? null),
        ver: 0,
        jclass: 'PriorityQueue',
      }
      const source = args.find(
        (arg) =>
          typeof arg.v === 'object' &&
          arg.v !== null &&
          !isComparatorValue(arg.v),
      )
      if (source !== undefined) {
        heap.items = elemsOf(it, source.v).items
        for (let i = (heap.items.length >>> 1) - 1; i >= 0; i -= 1)
          siftDown(heap, i)
      }
      return tv(type, heap)
    }
    case 'map': {
      const cmpArg = args.find((arg) => isComparatorValue(arg.v))
      const map = newContainer(it, type, 'HashMap') as CMap
      map.jclass =
        className !== undefined && mapClasses.has(className)
          ? className
          : type.ordered
            ? 'TreeMap'
            : 'HashMap'
      if (cmpArg !== undefined) map.compare = it.comparatorFor(cmpArg.v)
      if (first !== undefined && typeof first.v === 'number')
        presize(map, first.v)
      if (
        first !== undefined &&
        typeof first.v === 'object' &&
        first.v !== null &&
        first.v.kind === 'map'
      ) {
        presize(map, Math.floor(first.v.entries.length / 0.75 + 1))
        for (const entry of first.v.entries)
          mapPut(
            it,
            map,
            tv(type.key, entry.items[0] ?? null),
            tv(type.value, entry.items[1] ?? null),
          )
      }
      return tv(type, map)
    }
    case 'set': {
      const cmpArg = args.find((arg) => isComparatorValue(arg.v))
      const set = newContainer(it, type, 'HashSet') as CSet
      set.jclass =
        className !== undefined && setClasses.has(className)
          ? className
          : type.ordered
            ? 'TreeSet'
            : 'HashSet'
      if (cmpArg !== undefined) set.compare = it.comparatorFor(cmpArg.v)
      if (first !== undefined && typeof first.v === 'number')
        presize(set, first.v)
      if (
        first !== undefined &&
        typeof first.v === 'object' &&
        first.v !== null &&
        !isComparatorValue(first.v)
      ) {
        const source = elemsOf(it, first.v).items
        presize(set, Math.max(Math.floor(source.length / 0.75) + 1, 16))
        for (const item of source) setAdd(it, set, item)
      }
      return tv(type, set)
    }
    case 'string': {
      if (first === undefined) return it.string('')
      const v = first.v
      if (typeof v === 'object' && v !== null && v.kind === 'seq') {
        const offset = args[1] === undefined ? 0 : num(args[1])
        const count =
          args[2] === undefined ? v.items.length - offset : num(args[2])
        return it.string(
          v.items
            .slice(offset, offset + count)
            .map((code) => String.fromCharCode(Number(code)))
            .join(''),
        )
      }
      return it.string(text(it, first))
    }
    case 'int':
    case 'float':
    case 'bool':
      return tv(
        type,
        first === undefined ? it.zeroValue(type) : it.coerce(first, type),
      )
    case 'pair':
      return tv(
        type,
        entry(
          it,
          type,
          requireArg(it, args, 0, 'SimpleEntry'),
          requireArg(it, args, 1, 'SimpleEntry'),
        ),
      )
    case 'auto':
      return tv(
        T.auto,
        jobject(
          'Object',
          {},
          () => `java.lang.Object@${Math.floor(Math.random() * 0) + 1}`,
        ),
      )
    case 'jclass':
      return constructLibraryClass(it, type.name, args)
    default:
      return it.fail(
        'Compile error',
        `Cannot create a ${javaTypeName(type)} here.`,
      )
  }
}

function tableSize(capacity: number): number {
  let n = 1
  while (n < capacity) n *= 2
  return Math.max(1, n)
}

function entry(
  it: JavaInterpreter,
  type: CType & { k: 'pair' },
  key: TV,
  value: TV,
): CTuple {
  return {
    kind: 'tuple',
    pair: true,
    items: [it.element(key, type.first), it.element(value, type.second)],
    types: [type.first, type.second],
    ver: 0,
  }
}

export function jobject(
  cls: string,
  state: Record<string, unknown>,
  describe: () => string,
  call?: (args: TV[]) => TV,
): JObj {
  const object: JObj = { kind: 'jobj', cls, ver: 0, state, describe }
  if (call !== undefined) object.call = call
  return object
}

function constructLibraryClass(
  it: JavaInterpreter,
  name: string,
  args: TV[],
): TV {
  const first = args[0]
  const type: CType = { k: 'jclass', name }
  switch (name) {
    case 'StringBuilder': {
      const initial =
        first === undefined || typeof first.v === 'number'
          ? ''
          : text(it, first)
      const builder: CStr = {
        kind: 'str',
        s: initial,
        ver: 0,
        jclass: 'StringBuilder',
      }
      return tv(type, builder)
    }
    case 'Scanner':
      return tv(
        type,
        jobject('Scanner', {}, () => 'java.util.Scanner'),
      )
    case 'InputStreamReader':
      return tv(
        type,
        jobject('InputStreamReader', {}, () => 'java.io.InputStreamReader'),
      )
    case 'BufferedReader':
      return tv(
        type,
        jobject('BufferedReader', {}, () => 'java.io.BufferedReader'),
      )
    case 'StringTokenizer': {
      const source = text(it, first)
      const delimiters = args[1] === undefined ? ' \t\n\r\f' : text(it, args[1])
      const tokens: string[] = []
      let current = ''
      for (const c of source) {
        if (delimiters.includes(c)) {
          if (current !== '') tokens.push(current)
          current = ''
        } else current += c
      }
      if (current !== '') tokens.push(current)
      return tv(
        type,
        jobject(
          'StringTokenizer',
          { tokens, index: 0 },
          () => 'java.util.StringTokenizer',
        ),
      )
    }
    case 'PrintWriter':
    case 'BufferedWriter':
    case 'OutputStreamWriter':
    case 'PrintStream': {
      const autoFlush = args[1] !== undefined && truthy(args[1].v)
      const target =
        first !== undefined &&
        typeof first.v === 'object' &&
        first.v !== null &&
        first.v.kind === 'stream'
          ? first.v.name
          : 'cout'
      return tv(
        type,
        jobject(
          name,
          { pending: 0, autoFlush, target },
          () => `java.io.${name}`,
        ),
      )
    }
    case 'Random': {
      const seed = first === undefined ? 42n : big(first)
      if (first === undefined) {
        it.note(
          'new Random() without a seed uses a fixed seed (42) here so runs repeat; real Java picks a different seed each run.',
        )
      }
      return tv(type, randomObject(seed))
    }
    default:
      if (isExceptionClass(name)) {
        return tv(
          type,
          exceptionObject(name, first === undefined ? '' : text(it, first)),
        )
      }
      return it.fail(
        'Not supported by the visualizer',
        `The Java class ${name} is not supported by the visualizer yet.`,
      )
  }
}

// java.util.Random, bit for bit.
function randomObject(seed: bigint): JObj {
  const mask = (1n << 48n) - 1n
  const state = { seed: (seed ^ 0x5deece66dn) & mask }
  const next = (bits: number): number => {
    state.seed = (state.seed * 0x5deece66dn + 0xbn) & mask
    return Number(BigInt.asIntN(32, state.seed >> BigInt(48 - bits)))
  }
  return jobject('Random', { next }, () => 'java.util.Random')
}

function randomNextInt(object: JObj, bound?: number): number {
  const next = object.state.next as (bits: number) => number
  if (bound === undefined) return next(32)
  if ((bound & -bound) === bound)
    return Number((BigInt(bound) * BigInt(next(31))) >> 31n)
  for (;;) {
    const bits = next(31)
    const value = bits % bound
    if (bits - value + (bound - 1) <= 2147483647) return value
  }
}

// ---- heap (PriorityQueue) ------------------------------------------------------------

function siftUp(heap: CHeap, index: number) {
  const items = heap.items
  let k = index
  const key = items[k] ?? null
  while (k > 0) {
    const parent = (k - 1) >>> 1
    const e = items[parent] ?? null
    if (heap.compare(key, e) <= 0) break
    items[k] = e
    k = parent
  }
  items[k] = key
}

function siftDown(heap: CHeap, index: number) {
  const items = heap.items
  const n = items.length
  let k = index
  const key = items[k] ?? null
  const half = n >>> 1
  while (k < half) {
    let child = 2 * k + 1
    let c = items[child] ?? null
    const right = child + 1
    if (right < n && heap.compare(c, items[right] ?? null) < 0) {
      child = right
      c = items[child] ?? null
    }
    if (heap.compare(key, c) >= 0) break
    items[k] = c
    k = child
  }
  items[k] = key
}

function heapOffer(heap: CHeap, value: Value) {
  heap.items.push(value)
  siftUp(heap, heap.items.length - 1)
  bump(heap)
}

function heapPoll(heap: CHeap): Value {
  const items = heap.items
  if (items.length === 0) return null
  const top = items[0] ?? null
  const last = items.pop() ?? null
  if (items.length > 0) {
    items[0] = last
    siftDown(heap, 0)
  }
  bump(heap)
  return top
}

function heapRemoveAt(heap: CHeap, index: number) {
  const items = heap.items
  const last = items.pop() ?? null
  if (index < items.length) {
    items[index] = last
    siftDown(heap, index)
    if (items[index] === last) siftUp(heap, index)
  }
  bump(heap)
}

// ---- map and set operations -------------------------------------------------------------

function mapFind(it: JavaInterpreter, map: CMap, key: TV): CTuple | undefined {
  return it.findMapEntry(map, it.element(key, map.type.key))
}

function mapPut(
  it: JavaInterpreter,
  map: CMap,
  key: TV,
  value: TV,
  head = false,
): Value {
  const keyValue = it.element(key, map.type.key)
  if (keyValue === null && map.jclass === 'TreeMap')
    it.npe('TreeMap keys cannot be null.')
  const existing = it.findMapEntry(map, keyValue)
  const stored = it.element(value, map.type.value)
  if (existing !== undefined) {
    const old = existing.items[1] ?? null
    existing.items[1] = stored
    bump(existing)
    bump(map)
    return old
  }
  const created: CTuple = {
    kind: 'tuple',
    pair: true,
    items: [keyValue, stored],
    types: [map.type.key, map.type.value],
    ver: 0,
    keyLocked: true,
  }
  it.insertMapEntry(map, created)
  hashInsert(it, map, keyValue, map.type.key, head)
  return null
}

function mapRemove(it: JavaInterpreter, map: CMap, key: TV): Value {
  const found = mapFind(it, map, key)
  if (found === undefined) return null
  const index = map.entries.indexOf(found)
  map.entries.splice(index, 1)
  map.index?.delete(keyOf(found.items[0] ?? null))
  hashRemove(map, found.items[0] ?? null)
  bump(map)
  return found.items[1] ?? null
}

function setAdd(it: JavaInterpreter, set: CSet, value: Value): boolean {
  if (value === null && set.jclass === 'TreeSet')
    it.npe('TreeSet elements cannot be null.')
  const { inserted } = it.setInsert(set, value)
  if (inserted) hashInsert(it, set, value, set.type.elem, false)
  return inserted
}

function setRemove(it: JavaInterpreter, set: CSet, value: Value): boolean {
  const index = it.setFind(set, value)
  if (index >= set.items.length) return false
  setEraseAt(it, set, index)
  return true
}

function setEraseAt(it: JavaInterpreter, set: CSet, index: number) {
  const item = set.items[index] ?? null
  it.setEraseAt(set, index)
  hashRemove(set, item)
}

function orderedKeys(
  map: CMap,
  key: Value,
  mode: 'floor' | 'ceiling' | 'lower' | 'higher',
): number {
  const entries = map.entries as Value[]
  const keyOfEntry = (item: Value) => (item as CTuple).items[0] ?? null
  if (mode === 'ceiling')
    return bound(entries, key, map.compare, false, keyOfEntry)
  if (mode === 'higher')
    return bound(entries, key, map.compare, true, keyOfEntry)
  if (mode === 'floor')
    return bound(entries, key, map.compare, true, keyOfEntry) - 1
  return bound(entries, key, map.compare, false, keyOfEntry) - 1
}

function orderedItems(
  set: CSet,
  key: Value,
  mode: 'floor' | 'ceiling' | 'lower' | 'higher',
): number {
  if (mode === 'ceiling') return bound(set.items, key, set.compare, false)
  if (mode === 'higher') return bound(set.items, key, set.compare, true)
  if (mode === 'floor') return bound(set.items, key, set.compare, true) - 1
  return bound(set.items, key, set.compare, false) - 1
}

// ---- method dispatch ---------------------------------------------------------------------

export function callJavaMethod(
  it: JavaInterpreter,
  ref: Ref,
  object: Value,
  name: string,
  argExprs: Expr[],
  call: Call,
): MethodResult {
  void call
  const args = evalAll(it, argExprs)
  if (
    typeof object === 'number' ||
    typeof object === 'bigint' ||
    typeof object === 'boolean'
  ) {
    return boxedMethod(it, tv(ref.type, object), name, args)
  }
  if (object === null) it.npe(`Cannot invoke "${name}()" on null.`)
  switch (object.kind) {
    case 'str':
      return object.jclass === 'StringBuilder'
        ? builderMethod(it, object, name, args)
        : stringMethod(it, object, name, args)
    case 'seq':
      if (object.seq === 'carray') {
        if (name === 'clone')
          return tv(ref.type, it.javaArray(object.elemType, [...object.items]))
        if (name === 'length')
          return it.fail(
            'Compile error',
            'Use a.length (a field) for arrays, not a.length().',
          )
        break
      }
      return listMethod(it, ref, object, name, args, argExprs)
    case 'map':
      return mapMethod(it, object, name, args)
    case 'set':
      return setMethod(it, object, name, args)
    case 'heap':
      return heapMethod(it, object, name, args)
    case 'tuple':
      return entryMethod(it, object, name, args)
    case 'stream':
      return printMethod(
        it,
        object.name === 'cerr' ? 'cerr' : 'cout',
        name,
        args,
        null,
      )
    case 'jobj':
      return objectMethod(it, object, name, args)
    case 'func':
      return functionMethod(it, object, name, args)
    case 'struct':
      if (name === 'equals')
        return bool(it.equalsValue(object, args[0]?.v ?? null))
      if (name === 'hashCode') return int(javaHash(it, object))
      if (name === 'toString') return it.string(it.str(tv(ref.type, object)))
      break
    default:
      break
  }
  return it.fail(
    'Compile error',
    `${javaTypeName(ref.type, object)} has no method ${name}() here.`,
  )
}

function boxedMethod(
  it: JavaInterpreter,
  value: TV,
  name: string,
  args: TV[],
): MethodResult {
  const other = args[0]
  switch (name) {
    case 'equals':
      return bool(
        other !== undefined &&
          other.v !== null &&
          compareArith('==', value, other) &&
          sameKind(value.t, other.t),
      )
    case 'compareTo':
    case 'compare':
      return int(
        compareArith('<', value, requireArg(it, args, 0, name))
          ? -1
          : compareArith('>', value, requireArg(it, args, 0, name))
            ? 1
            : 0,
      )
    case 'intValue':
      return int(num(value))
    case 'longValue':
      return long(big(value))
    case 'doubleValue':
      return double(num(value))
    case 'charValue':
      return char(num(value))
    case 'booleanValue':
      return bool(truthy(value.v))
    case 'toString':
      return it.string(it.str(value))
    case 'hashCode':
      return int(javaHash(it, value.v, value.t))
    default:
      return it.fail(
        'Compile error',
        `${javaTypeName(value.t)} has no method ${name}().`,
      )
  }
}

function sameKind(a: CType, b: CType) {
  const family = (t: CType) =>
    t.k === 'int'
      ? t.char === true
        ? 'char'
        : t.bits >= 64
          ? 'long'
          : 'int'
      : t.k
  return family(a) === family(b) || a.k === 'auto' || b.k === 'auto'
}

function stringIndex(
  it: JavaInterpreter,
  s: string,
  index: number,
  end = false,
) {
  if (index < 0 || (end ? index > s.length : index >= s.length)) {
    it.fail(
      'StringIndexOutOfBoundsException',
      `Index ${index} out of bounds for length ${s.length}`,
      [
        `The string has ${s.length} characters, so valid indexes are ${s.length === 0 ? 'none' : `0–${s.length - 1}`}.`,
      ],
    )
  }
}

function charOrString(it: JavaInterpreter, value: TV): string {
  if (value.t.k === 'int' && value.t.char === true)
    return String.fromCharCode(num(value))
  if (typeof value.v === 'number' && value.t.k === 'int')
    return String.fromCharCode(value.v)
  return text(it, value)
}

// String.compareTo: difference of the first unequal chars, else lengths.
function compareStrings(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i += 1) {
    const diff = a.charCodeAt(i) - b.charCodeAt(i)
    if (diff !== 0) return diff
  }
  return a.length - b.length
}

function javaRegex(pattern: string, flags = 'g'): RegExp {
  try {
    return new RegExp(
      pattern
        .replace(/\\p\{Punct\}/g, '[!-/:-@[-`{-~]')
        .replace(/\(\?<([a-zA-Z])/g, '(?<$1'),
      flags,
    )
  } catch {
    throw new Error(`Invalid regular expression ${pattern}`)
  }
}

function split(s: string, pattern: string, limit = 0): string[] {
  if (s === '') return ['']
  const regex = javaRegex(pattern)
  const parts: string[] = []
  let last = 0
  for (let match = regex.exec(s); match !== null; match = regex.exec(s)) {
    if (match[0] === '') {
      regex.lastIndex += 1
      if (match.index === 0 || match.index >= s.length) continue
    }
    if (limit > 0 && parts.length === limit - 1) break
    // A zero-width or leading match at 0 does not produce an empty first part
    // for zero-width patterns (Java 8+).
    if (!(match.index === 0 && match[0].length === 0))
      parts.push(s.slice(last, match.index))
    last = match.index + match[0].length
  }
  parts.push(s.slice(last))
  if (limit === 0)
    while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop()
  if (limit === 0 && parts.length === 1 && parts[0] === '' && s !== '')
    return []
  return parts
}

function stringMethod(
  it: JavaInterpreter,
  str: CStr,
  name: string,
  args: TV[],
): MethodResult {
  const s = str.s
  const a0 = args[0]
  const a1 = args[1]
  switch (name) {
    case 'length':
      return int(s.length)
    case 'charAt': {
      const index = num(requireArg(it, args, 0, name))
      stringIndex(it, s, index)
      return char(s.charCodeAt(index))
    }
    case 'isEmpty':
      return bool(s.length === 0)
    case 'isBlank':
      return bool(s.trim().length === 0)
    case 'substring': {
      const begin = num(requireArg(it, args, 0, name))
      const end = a1 === undefined ? s.length : num(a1)
      if (begin < 0 || end > s.length || begin > end) {
        it.fail(
          'StringIndexOutOfBoundsException',
          `begin ${begin}, end ${end}, length ${s.length}`,
        )
      }
      return it.string(s.slice(begin, end))
    }
    case 'subSequence':
      return stringMethod(it, str, 'substring', args)
    case 'indexOf':
      return int(
        s.indexOf(
          charOrString(it, requireArg(it, args, 0, name)),
          a1 === undefined ? 0 : num(a1),
        ),
      )
    case 'lastIndexOf':
      return int(
        s.lastIndexOf(
          charOrString(it, requireArg(it, args, 0, name)),
          a1 === undefined ? Infinity : num(a1),
        ),
      )
    case 'contains':
      return bool(s.includes(text(it, a0)))
    case 'startsWith':
      return bool(s.startsWith(text(it, a0), a1 === undefined ? 0 : num(a1)))
    case 'endsWith':
      return bool(s.endsWith(text(it, a0)))
    case 'equals':
      return bool(
        a0 !== undefined &&
          typeof a0.v === 'object' &&
          a0.v !== null &&
          a0.v.kind === 'str' &&
          a0.v.jclass === undefined &&
          a0.v.s === s,
      )
    case 'equalsIgnoreCase':
      return bool(
        a0 !== undefined &&
          a0.v !== null &&
          text(it, a0).toLowerCase() === s.toLowerCase(),
      )
    case 'compareTo':
      return int(compareStrings(s, text(it, a0)))
    case 'compareToIgnoreCase':
      return int(compareStrings(s.toLowerCase(), text(it, a0).toLowerCase()))
    case 'toCharArray':
      return tv(
        { k: 'carray', elem: JCHAR, size: null },
        it.javaArray(
          JCHAR,
          [...s].map((c) => c.charCodeAt(0)),
        ),
      )
    case 'chars':
      return tv(
        { k: 'jclass', name: 'Stream' },
        streamOf(
          [...s].map((c) => c.charCodeAt(0)),
          T.int,
        ),
      )
    case 'split': {
      const parts = split(s, text(it, a0), a1 === undefined ? 0 : num(a1))
      return tv(
        { k: 'carray', elem: T.string, size: null },
        it.javaArray(
          T.string,
          parts.map((part) => it.string(part).v),
        ),
      )
    }
    case 'trim':
      return it.string(javaTrim(s))
    case 'strip':
      return it.string(s.trim())
    case 'toUpperCase':
      return it.string(s.toUpperCase())
    case 'toLowerCase':
      return it.string(s.toLowerCase())
    case 'replace':
      return it.string(
        s
          .split(charOrString(it, requireArg(it, args, 0, name)))
          .join(charOrString(it, requireArg(it, args, 1, name))),
      )
    case 'replaceAll':
      return it.string(s.replace(javaRegex(text(it, a0)), text(it, a1)))
    case 'replaceFirst':
      return it.string(s.replace(javaRegex(text(it, a0), ''), text(it, a1)))
    case 'matches':
      return bool(javaRegex(`^(?:${text(it, a0)})$`, '').test(s))
    case 'repeat': {
      const count = num(requireArg(it, args, 0, name))
      if (count < 0)
        it.fail('IllegalArgumentException', `count is negative: ${count}`)
      return it.string(s.repeat(count))
    }
    case 'concat':
      return it.string(s + text(it, a0))
    case 'hashCode':
      return int(stringHash(s))
    case 'toString':
    case 'intern':
      return tv(T.string, str)
    case 'codePointAt':
      stringIndex(it, s, num(requireArg(it, args, 0, name)))
      return int(s.charCodeAt(num(requireArg(it, args, 0, name))))
    default:
      return it.fail('Compile error', `String has no method ${name}().`)
  }
}

function builderMethod(
  it: JavaInterpreter,
  sb: CStr,
  name: string,
  args: TV[],
): MethodResult {
  const self = tv({ k: 'jclass', name: 'StringBuilder' }, sb)
  const set = (value: string) => {
    sb.s = value
    bump(sb)
  }
  const a0 = args[0]
  switch (name) {
    case 'append': {
      const value = requireArg(it, args, 0, name)
      const v = value.v
      if (
        typeof v === 'object' &&
        v !== null &&
        v.kind === 'seq' &&
        v.elemType.k === 'int' &&
        v.elemType.char === true
      ) {
        set(
          sb.s +
            v.items.map((code) => String.fromCharCode(Number(code))).join(''),
        )
      } else set(sb.s + it.str(value))
      return self
    }
    case 'insert': {
      const at = num(requireArg(it, args, 0, name))
      stringIndex(it, sb.s, at, true)
      set(
        sb.s.slice(0, at) +
          it.str(requireArg(it, args, 1, name)) +
          sb.s.slice(at),
      )
      return self
    }
    case 'reverse':
      set([...sb.s].reverse().join(''))
      return self
    case 'toString':
      return it.string(sb.s)
    case 'length':
      return int(sb.s.length)
    case 'isEmpty':
      return bool(sb.s.length === 0)
    case 'charAt': {
      const index = num(requireArg(it, args, 0, name))
      stringIndex(it, sb.s, index)
      return char(sb.s.charCodeAt(index))
    }
    case 'setCharAt': {
      const index = num(requireArg(it, args, 0, name))
      stringIndex(it, sb.s, index)
      set(
        sb.s.slice(0, index) +
          charOrString(it, requireArg(it, args, 1, name)) +
          sb.s.slice(index + 1),
      )
      return VOID
    }
    case 'deleteCharAt': {
      const index = num(requireArg(it, args, 0, name))
      stringIndex(it, sb.s, index)
      set(sb.s.slice(0, index) + sb.s.slice(index + 1))
      return self
    }
    case 'delete': {
      const start = num(requireArg(it, args, 0, name))
      const end = Math.min(sb.s.length, num(requireArg(it, args, 1, name)))
      if (start < 0 || start > end)
        it.fail(
          'StringIndexOutOfBoundsException',
          `start ${start}, end ${end}, length ${sb.s.length}`,
        )
      set(sb.s.slice(0, start) + sb.s.slice(end))
      return self
    }
    case 'replace': {
      const start = num(requireArg(it, args, 0, name))
      const end = Math.min(sb.s.length, num(requireArg(it, args, 1, name)))
      set(sb.s.slice(0, start) + text(it, args[2]) + sb.s.slice(end))
      return self
    }
    case 'setLength': {
      const length = num(requireArg(it, args, 0, name))
      set(
        sb.s.length >= length
          ? sb.s.slice(0, length)
          : sb.s + '\0'.repeat(length - sb.s.length),
      )
      return VOID
    }
    case 'indexOf':
      return int(
        sb.s.indexOf(text(it, a0), args[1] === undefined ? 0 : num(args[1])),
      )
    case 'lastIndexOf':
      return int(sb.s.lastIndexOf(text(it, a0)))
    case 'substring':
      return it.string(
        sb.s.slice(
          num(requireArg(it, args, 0, name)),
          args[1] === undefined ? undefined : num(args[1]),
        ),
      )
    case 'compareTo':
      return int(compareStrings(sb.s, text(it, a0)))
    case 'equals':
      return bool(a0?.v === sb)
    case 'capacity':
      return int(Math.max(16, sb.s.length))
    case 'chars':
      return tv(
        { k: 'jclass', name: 'Stream' },
        streamOf(
          [...sb.s].map((c) => c.charCodeAt(0)),
          T.int,
        ),
      )
    default:
      return it.fail('Compile error', `StringBuilder has no method ${name}().`)
  }
}

function listIndex(
  it: JavaInterpreter,
  seq: CSeq,
  index: number,
  allowEnd = false,
) {
  if (
    index < 0 ||
    (allowEnd ? index > seq.items.length : index >= seq.items.length)
  ) {
    it.fail(
      'IndexOutOfBoundsException',
      `Index ${index} out of bounds for length ${seq.items.length}`,
      [
        `The ${seq.jclass ?? 'list'} has ${seq.items.length} element${seq.items.length === 1 ? '' : 's'}${seq.items.length === 0 ? '' : `, so valid indexes are 0–${seq.items.length - 1}`}.`,
      ],
    )
  }
}

function emptyError(it: JavaInterpreter, seq: CSeq, method: string): never {
  if (seq.seq === 'stack')
    it.fail('EmptyStackException', `${method}() was called on an empty Stack.`)
  return it.fail(
    'NoSuchElementException',
    `${method}() was called on an empty ${seq.jclass ?? 'collection'}.`,
  )
}

function listMethod(
  it: JavaInterpreter,
  ref: Ref,
  seq: CSeq,
  name: string,
  args: TV[],
  argExprs: Expr[],
): MethodResult {
  const elem = seq.elemType
  const items = seq.items
  const changed = () => bump(seq)
  const value = (index: number) => tv(elem, items[index] ?? null)
  const stack = seq.seq === 'stack'
  const a0 = args[0]
  switch (name) {
    case 'add':
    case 'addLast':
    case 'offer':
    case 'offerLast': {
      if (args.length === 2 && name === 'add') {
        const index = num(requireArg(it, args, 0, name))
        listIndex(it, seq, index, true)
        items.splice(index, 0, it.element(requireArg(it, args, 1, name), elem))
        changed()
        return VOID
      }
      items.push(it.element(requireArg(it, args, 0, name), elem))
      changed()
      it.trackWrite(
        ref.origin === undefined
          ? undefined
          : { ...ref.origin, path: [...ref.origin.path, items.length - 1] },
      )
      return name === 'addLast' ? VOID : bool(true)
    }
    case 'addFirst':
    case 'offerFirst':
      items.unshift(it.element(requireArg(it, args, 0, name), elem))
      changed()
      return name === 'offerFirst' ? bool(true) : VOID
    case 'push':
      if (stack) {
        items.push(it.element(requireArg(it, args, 0, name), elem))
        changed()
        return tv(elem, items[items.length - 1] ?? null)
      }
      items.unshift(it.element(requireArg(it, args, 0, name), elem))
      changed()
      return VOID
    case 'pop':
      if (items.length === 0) emptyError(it, seq, name)
      if (stack) {
        const top = items.pop() ?? null
        changed()
        return tv(elem, top)
      }
      {
        const first = items.shift() ?? null
        changed()
        return tv(elem, first)
      }
    case 'peek':
      if (stack) {
        if (items.length === 0) emptyError(it, seq, name)
        return value(items.length - 1)
      }
      return items.length === 0 ? tv(elem, null) : value(0)
    case 'peekFirst':
      return items.length === 0 ? tv(elem, null) : value(0)
    case 'peekLast':
      return items.length === 0 ? tv(elem, null) : value(items.length - 1)
    case 'poll':
    case 'pollFirst': {
      if (items.length === 0) return tv(elem, null)
      const first = items.shift() ?? null
      changed()
      return tv(elem, first)
    }
    case 'pollLast': {
      if (items.length === 0) return tv(elem, null)
      const last = items.pop() ?? null
      changed()
      return tv(elem, last)
    }
    case 'element':
    case 'getFirst':
    case 'firstElement':
      if (items.length === 0) emptyError(it, seq, name)
      return value(0)
    case 'getLast':
    case 'lastElement':
      if (items.length === 0) emptyError(it, seq, name)
      return value(items.length - 1)
    case 'removeFirst': {
      if (items.length === 0) emptyError(it, seq, name)
      const first = items.shift() ?? null
      changed()
      return tv(elem, first)
    }
    case 'removeLast': {
      if (items.length === 0) emptyError(it, seq, name)
      const last = items.pop() ?? null
      changed()
      return tv(elem, last)
    }
    case 'remove': {
      if (a0 === undefined) {
        if (items.length === 0) emptyError(it, seq, name)
        const first = items.shift() ?? null
        changed()
        return tv(elem, first)
      }
      // remove(int index) on a List, remove(Object) otherwise.
      const byIndex =
        seq.seq === 'vector' || seq.jclass === 'LinkedList'
          ? isIntType(a0.t) &&
            a0.t.k === 'int' &&
            a0.t.boxed !== true &&
            !isLongType(a0.t)
          : false
      if (byIndex) {
        const index = num(a0)
        listIndex(it, seq, index)
        const [removed] = items.splice(index, 1)
        changed()
        return tv(elem, removed ?? null)
      }
      void argExprs
      const position = items.findIndex((item) => it.equalsValue(item, a0.v))
      if (position >= 0) {
        items.splice(position, 1)
        changed()
      }
      return bool(position >= 0)
    }
    case 'get': {
      const index = num(requireArg(it, args, 0, name))
      listIndex(it, seq, index)
      return { ref: it.seqRef(seq, index, ref.origin) }
    }
    case 'set': {
      const index = num(requireArg(it, args, 0, name))
      listIndex(it, seq, index)
      const old = items[index] ?? null
      it.seqRef(seq, index, ref.origin).set(
        it.element(requireArg(it, args, 1, name), elem),
      )
      return tv(elem, old)
    }
    case 'size':
      return int(items.length)
    case 'isEmpty':
      return bool(items.length === 0)
    case 'empty':
      return bool(items.length === 0)
    case 'contains':
      return bool(items.some((item) => it.equalsValue(item, a0?.v ?? null)))
    case 'indexOf':
      return int(items.findIndex((item) => it.equalsValue(item, a0?.v ?? null)))
    case 'lastIndexOf': {
      for (let i = items.length - 1; i >= 0; i -= 1) {
        if (it.equalsValue(items[i] ?? null, a0?.v ?? null)) return int(i)
      }
      return int(-1)
    }
    case 'search': {
      for (let i = items.length - 1; i >= 0; i -= 1) {
        if (it.equalsValue(items[i] ?? null, a0?.v ?? null))
          return int(items.length - i)
      }
      return int(-1)
    }
    case 'clear':
      seq.items = []
      changed()
      return VOID
    case 'addAll': {
      if (args.length === 2) {
        const index = num(requireArg(it, args, 0, name))
        items.splice(
          index,
          0,
          ...elemsOf(it, requireArg(it, args, 1, name).v).items,
        )
      } else items.push(...elemsOf(it, requireArg(it, args, 0, name).v).items)
      changed()
      return bool(true)
    }
    case 'removeAll':
    case 'retainAll': {
      const other = elemsOf(it, requireArg(it, args, 0, name).v).items
      const keep = name === 'retainAll'
      seq.items = items.filter(
        (item) => other.some((x) => it.equalsValue(x, item)) === keep,
      )
      changed()
      return bool(true)
    }
    case 'containsAll':
      return bool(
        elemsOf(it, requireArg(it, args, 0, name).v).items.every((x) =>
          items.some((item) => it.equalsValue(item, x)),
        ),
      )
    case 'sort':
      items.sort(it.comparatorFor(a0?.v ?? null))
      changed()
      return VOID
    case 'forEach':
      for (const item of [...items])
        it.callValue(requireArg(it, args, 0, name).v, [tv(elem, item)])
      return VOID
    case 'removeIf': {
      const test = requireArg(it, args, 0, name).v
      const before = items.length
      seq.items = items.filter(
        (item) =>
          !it.truth(it.quietly(() => it.callValue(test, [tv(elem, item)]))),
      )
      changed()
      return bool(seq.items.length !== before)
    }
    case 'replaceAll': {
      const fn = requireArg(it, args, 0, name).v
      seq.items = items.map((item) =>
        it.element(
          it.quietly(() => it.callValue(fn, [tv(elem, item)])),
          elem,
        ),
      )
      changed()
      return VOID
    }
    case 'subList': {
      const from = num(requireArg(it, args, 0, name))
      const to = num(requireArg(it, args, 1, name))
      if (from < 0 || to > items.length || from > to) {
        it.fail(
          'IndexOutOfBoundsException',
          `fromIndex ${from}, toIndex ${to}, size ${items.length}`,
        )
      }
      return tv(ref.type, { ...seq, items: items.slice(from, to), ver: 0 })
    }
    case 'reversed':
      return tv(ref.type, { ...seq, items: [...items].reverse(), ver: 0 })
    case 'toArray':
      return tv(
        { k: 'carray', elem, size: null },
        it.javaArray(elem, [...items]),
      )
    case 'stream':
      return tv({ k: 'jclass', name: 'Stream' }, streamOf([...items], elem))
    case 'iterator':
    case 'listIterator':
      return tv({ k: 'jclass', name: 'Iterator' }, iteratorOf(it, seq))
    case 'descendingIterator':
      return tv(
        { k: 'jclass', name: 'Iterator' },
        iteratorOf(it, { ...seq, items: [...items].reverse() }),
      )
    case 'equals': {
      const other = a0?.v
      if (typeof other !== 'object' || other === null || other.kind !== 'seq')
        return bool(false)
      return bool(
        other.items.length === items.length &&
          items.every((item, index) =>
            it.equalsValue(item, other.items[index] ?? null),
          ),
      )
    }
    case 'hashCode':
      return int(javaHash(it, seq))
    case 'toString':
      return it.string(it.str(tv(ref.type, seq)))
    case 'ensureCapacity':
    case 'trimToSize':
      return VOID
    default:
      return it.fail(
        'Compile error',
        `${seq.jclass ?? 'List'} has no method ${name}() here.`,
      )
  }
}

function iteratorOf(it: JavaInterpreter, seq: CSeq | CSet): JObj {
  const state = { index: 0, last: -1 }
  const items = () => seq.items
  const object = jobject('Iterator', state, () => 'java.util.Iterator')
  object.state.methods = {
    hasNext: () => bool(state.index < items().length),
    next: () => {
      if (state.index >= items().length)
        it.fail(
          'NoSuchElementException',
          'next() was called with no elements left.',
        )
      state.last = state.index
      state.index += 1
      const elemType = seq.kind === 'seq' ? seq.elemType : seq.type.elem
      return tv(elemType, items()[state.last] ?? null)
    },
    remove: () => {
      if (state.last < 0)
        it.fail('IllegalStateException', 'remove() was called before next().')
      if (seq.kind === 'set') setEraseAt(it, seq, state.last)
      else items().splice(state.last, 1)
      state.index = state.last
      state.last = -1
      bump(seq)
      return VOID
    },
  }
  return object
}

function mapMethod(
  it: JavaInterpreter,
  map: CMap,
  name: string,
  args: TV[],
): MethodResult {
  const keyType = map.type.key
  const valueType = map.type.value
  const a0 = args[0]
  const ordered = map.jclass === 'TreeMap'
  const entryType: CType = { k: 'pair', first: keyType, second: valueType }
  const keyAt = (index: number) =>
    tv(keyType, map.entries[index]?.items[0] ?? null)
  const entryAt = (index: number) => tv(entryType, map.entries[index] ?? null)
  const requireNonEmpty = () => {
    if (map.entries.length === 0)
      it.fail(
        'NoSuchElementException',
        `${name}() was called on an empty TreeMap.`,
      )
  }
  const nav = (mode: 'floor' | 'ceiling' | 'lower' | 'higher') => {
    if (!ordered) it.fail('Compile error', `${name} needs a TreeMap.`)
    const index = orderedKeys(
      map,
      it.element(requireArg(it, args, 0, name), keyType),
      mode,
    )
    return index >= 0 && index < map.entries.length ? index : -1
  }
  switch (name) {
    case 'put':
      return tv(
        valueType,
        mapPut(
          it,
          map,
          requireArg(it, args, 0, name),
          requireArg(it, args, 1, name),
        ),
      )
    case 'get': {
      const found = mapFind(it, map, requireArg(it, args, 0, name))
      return tv(
        valueType,
        found === undefined ? null : (found.items[1] ?? null),
      )
    }
    case 'getOrDefault': {
      const found = mapFind(it, map, requireArg(it, args, 0, name))
      return found === undefined
        ? tv(valueType, it.element(requireArg(it, args, 1, name), valueType))
        : tv(valueType, found.items[1] ?? null)
    }
    case 'containsKey':
      return bool(mapFind(it, map, requireArg(it, args, 0, name)) !== undefined)
    case 'containsValue':
      return bool(
        map.entries.some((item) =>
          it.equalsValue(item.items[1] ?? null, a0?.v ?? null),
        ),
      )
    case 'remove':
      return tv(valueType, mapRemove(it, map, requireArg(it, args, 0, name)))
    case 'size':
      return int(map.entries.length)
    case 'isEmpty':
      return bool(map.entries.length === 0)
    case 'clear':
      hashClear(map)
      map.entries = []
      map.index?.clear()
      bump(map)
      return VOID
    case 'putIfAbsent': {
      const found = mapFind(it, map, requireArg(it, args, 0, name))
      if (found !== undefined && found.items[1] !== null)
        return tv(valueType, found.items[1] ?? null)
      mapPut(
        it,
        map,
        requireArg(it, args, 0, name),
        requireArg(it, args, 1, name),
      )
      return tv(valueType, null)
    }
    case 'putAll': {
      const other = requireArg(it, args, 0, name).v
      if (typeof other === 'object' && other !== null && other.kind === 'map') {
        for (const item of other.entries)
          mapPut(
            it,
            map,
            tv(other.type.key, item.items[0] ?? null),
            tv(other.type.value, item.items[1] ?? null),
          )
      }
      return VOID
    }
    case 'merge': {
      const key = requireArg(it, args, 0, name)
      const value = requireArg(it, args, 1, name)
      const fn = requireArg(it, args, 2, name).v
      const found = mapFind(it, map, key)
      if (found === undefined || found.items[1] === null) {
        mapPut(it, map, key, value, true)
        return value
      }
      const merged = it.quietly(() =>
        it.callValue(fn, [tv(valueType, found.items[1] ?? null), value]),
      )
      if (merged.v === null) {
        mapRemove(it, map, key)
        return tv(valueType, null)
      }
      mapPut(it, map, key, merged)
      return merged
    }
    case 'computeIfAbsent': {
      const key = requireArg(it, args, 0, name)
      const found = mapFind(it, map, key)
      if (found !== undefined && found.items[1] !== null)
        return tv(valueType, found.items[1] ?? null)
      const created = it.quietly(() =>
        it.callValue(requireArg(it, args, 1, name).v, [key]),
      )
      if (created.v !== null) mapPut(it, map, key, created, true)
      return tv(valueType, it.element(created, valueType))
    }
    case 'computeIfPresent':
    case 'compute': {
      const key = requireArg(it, args, 0, name)
      const found = mapFind(it, map, key)
      if (
        name === 'computeIfPresent' &&
        (found === undefined || found.items[1] === null)
      )
        return tv(valueType, null)
      const current = tv(
        valueType,
        found === undefined ? null : (found.items[1] ?? null),
      )
      const result = it.quietly(() =>
        it.callValue(requireArg(it, args, 1, name).v, [key, current]),
      )
      if (result.v === null) mapRemove(it, map, key)
      else mapPut(it, map, key, result, true)
      return result
    }
    case 'forEach':
      for (const item of [...map.entries]) {
        it.callValue(requireArg(it, args, 0, name).v, [
          tv(keyType, item.items[0] ?? null),
          tv(valueType, item.items[1] ?? null),
        ])
      }
      return VOID
    case 'keySet':
    case 'navigableKeySet':
    case 'descendingKeySet': {
      const keys: CSet = {
        kind: 'set',
        type: { k: 'set', elem: keyType, ordered, multi: false, cmp: null },
        items: map.entries.map((item) => item.items[0] ?? null),
        index: ordered ? null : new Map(),
        compare: map.compare,
        ver: 0,
        jclass: ordered
          ? 'TreeSet'
          : map.jclass === 'LinkedHashMap'
            ? 'LinkedHashSet'
            : 'KeySet',
      }
      if (name === 'descendingKeySet') keys.items.reverse()
      keys.index?.clear()
      keys.items.forEach((item, position) =>
        keys.index?.set(keyOf(item), position),
      )
      return tv(keys.type, keys)
    }
    case 'values': {
      const list: CSeq = {
        kind: 'seq',
        seq: 'vector',
        elemType: valueType,
        items: map.entries.map((item) => item.items[1] ?? null),
        ver: 0,
        touched: 0,
        fixed: false,
        jclass: 'ArrayList',
      }
      return tv({ k: 'vector', elem: valueType }, list)
    }
    case 'entrySet': {
      const list: CSeq = {
        kind: 'seq',
        seq: 'vector',
        elemType: entryType,
        items: [...map.entries],
        ver: 0,
        touched: 0,
        fixed: false,
        jclass: 'EntrySet',
      }
      return tv({ k: 'vector', elem: entryType }, list)
    }
    case 'firstKey':
    case 'lastKey':
      requireNonEmpty()
      return keyAt(name === 'firstKey' ? 0 : map.entries.length - 1)
    case 'firstEntry':
    case 'lastEntry':
      if (map.entries.length === 0) return tv(entryType, null)
      return entryAt(name === 'firstEntry' ? 0 : map.entries.length - 1)
    case 'pollFirstEntry':
    case 'pollLastEntry': {
      if (map.entries.length === 0) return tv(entryType, null)
      const index = name === 'pollFirstEntry' ? 0 : map.entries.length - 1
      const [removed] = map.entries.splice(index, 1)
      bump(map)
      return tv(entryType, removed ?? null)
    }
    case 'floorKey':
    case 'ceilingKey':
    case 'lowerKey':
    case 'higherKey': {
      const index = nav(name.replace('Key', '') as 'floor')
      return index < 0 ? tv(keyType, null) : keyAt(index)
    }
    case 'floorEntry':
    case 'ceilingEntry':
    case 'lowerEntry':
    case 'higherEntry': {
      const index = nav(name.replace('Entry', '') as 'floor')
      return index < 0 ? tv(entryType, null) : entryAt(index)
    }
    case 'headMap':
    case 'tailMap': {
      const key = it.element(requireArg(it, args, 0, name), keyType)
      const inclusive =
        args[1] === undefined ? name === 'tailMap' : truthy(args[1].v)
      const copy: CMap = {
        ...map,
        entries: map.entries.filter((item) => {
          const order = map.compare(item.items[0] ?? null, key)
          return name === 'headMap'
            ? order < 0 || (inclusive && order === 0)
            : order > 0 || (inclusive && order === 0)
        }),
        ver: 0,
        index: null,
      }
      return tv(map.type, copy)
    }
    case 'descendingMap': {
      const copy: CMap = {
        ...map,
        entries: [...map.entries].reverse(),
        ver: 0,
        index: null,
        compare: (a, b) => -map.compare(a, b),
      }
      return tv(map.type, copy)
    }
    case 'equals': {
      const other = a0?.v
      if (typeof other !== 'object' || other === null || other.kind !== 'map')
        return bool(false)
      return bool(
        other.entries.length === map.entries.length &&
          map.entries.every((item) => {
            const found = it.findMapEntry(other, item.items[0] ?? null)
            return (
              found !== undefined &&
              it.equalsValue(found.items[1] ?? null, item.items[1] ?? null)
            )
          }),
      )
    }
    case 'toString':
      return it.string(it.str(tv(map.type, map)))
    case 'hashCode':
      return int(
        map.entries.reduce((h, item) => (h + javaHash(it, item)) | 0, 0),
      )
    default:
      return it.fail(
        'Compile error',
        `${map.jclass ?? 'Map'} has no method ${name}() here.`,
      )
  }
}

function setMethod(
  it: JavaInterpreter,
  set: CSet,
  name: string,
  args: TV[],
): MethodResult {
  const elem = set.type.elem
  const a0 = args[0]
  const ordered = set.jclass === 'TreeSet'
  const at = (index: number) => tv(elem, set.items[index] ?? null)
  const nav = (mode: 'floor' | 'ceiling' | 'lower' | 'higher') => {
    if (!ordered) it.fail('Compile error', `${name} needs a TreeSet.`)
    const index = orderedItems(
      set,
      it.element(requireArg(it, args, 0, name), elem),
      mode,
    )
    return index >= 0 && index < set.items.length ? at(index) : tv(elem, null)
  }
  switch (name) {
    case 'add':
      return bool(
        setAdd(it, set, it.element(requireArg(it, args, 0, name), elem)),
      )
    case 'remove':
      return bool(
        setRemove(it, set, it.element(requireArg(it, args, 0, name), elem)),
      )
    case 'contains':
      return bool(
        it.setFind(set, it.element(requireArg(it, args, 0, name), elem)) <
          set.items.length,
      )
    case 'size':
      return int(set.items.length)
    case 'isEmpty':
      return bool(set.items.length === 0)
    case 'clear':
      hashClear(set)
      set.items = []
      set.index?.clear()
      bump(set)
      return VOID
    case 'addAll': {
      let changed = false
      for (const item of elemsOf(it, requireArg(it, args, 0, name).v).items) {
        changed = setAdd(it, set, it.element(tv(elem, item), elem)) || changed
      }
      return bool(changed)
    }
    case 'removeAll':
    case 'retainAll': {
      const other = elemsOf(it, requireArg(it, args, 0, name).v).items
      const keep = name === 'retainAll'
      for (let i = set.items.length - 1; i >= 0; i -= 1) {
        const present = other.some((x) =>
          it.equalsValue(x, set.items[i] ?? null),
        )
        if (present !== keep) setEraseAt(it, set, i)
      }
      return bool(true)
    }
    case 'containsAll':
      return bool(
        elemsOf(it, requireArg(it, args, 0, name).v).items.every(
          (x) => it.setFind(set, x) < set.items.length,
        ),
      )
    case 'first':
    case 'last':
      if (set.items.length === 0)
        it.fail(
          'NoSuchElementException',
          `${name}() was called on an empty TreeSet.`,
        )
      return at(name === 'first' ? 0 : set.items.length - 1)
    case 'pollFirst':
    case 'pollLast': {
      if (set.items.length === 0) return tv(elem, null)
      const index = name === 'pollFirst' ? 0 : set.items.length - 1
      const item = set.items[index] ?? null
      setEraseAt(it, set, index)
      return tv(elem, item)
    }
    case 'floor':
    case 'ceiling':
    case 'lower':
    case 'higher':
      return nav(name)
    case 'headSet':
    case 'tailSet': {
      const key = it.element(requireArg(it, args, 0, name), elem)
      const inclusive =
        args[1] === undefined ? name === 'tailSet' : truthy(args[1].v)
      const copy: CSet = {
        ...set,
        items: set.items.filter((item) => {
          const order = set.compare(item, key)
          return name === 'headSet'
            ? order < 0 || (inclusive && order === 0)
            : order > 0 || (inclusive && order === 0)
        }),
        ver: 0,
        index: null,
      }
      return tv(set.type, copy)
    }
    case 'descendingSet':
      return tv(set.type, {
        ...set,
        items: [...set.items].reverse(),
        ver: 0,
        index: null,
        compare: (a, b) => -set.compare(a, b),
      })
    case 'forEach':
      for (const item of [...set.items])
        it.callValue(requireArg(it, args, 0, name).v, [tv(elem, item)])
      return VOID
    case 'stream':
      return tv({ k: 'jclass', name: 'Stream' }, streamOf([...set.items], elem))
    case 'iterator':
      return tv({ k: 'jclass', name: 'Iterator' }, iteratorOf(it, set))
    case 'toArray':
      return tv(
        { k: 'carray', elem, size: null },
        it.javaArray(elem, [...set.items]),
      )
    case 'equals': {
      const other = a0?.v
      if (typeof other !== 'object' || other === null || other.kind !== 'set')
        return bool(false)
      return bool(
        other.items.length === set.items.length &&
          set.items.every(
            (item) => it.setFind(other, item) < other.items.length,
          ),
      )
    }
    case 'toString':
      return it.string(it.str(tv(set.type, set)))
    case 'hashCode':
      return int(
        set.items.reduce<number>(
          (h, item) => (h + javaHash(it, item, elem)) | 0,
          0,
        ),
      )
    default:
      return it.fail(
        'Compile error',
        `${set.jclass ?? 'Set'} has no method ${name}() here.`,
      )
  }
}

function heapMethod(
  it: JavaInterpreter,
  heap: CHeap,
  name: string,
  args: TV[],
): MethodResult {
  const elem = heap.elemType
  switch (name) {
    case 'add':
    case 'offer': {
      const value = it.element(requireArg(it, args, 0, name), elem)
      if (value === null) it.npe('A PriorityQueue cannot hold null.')
      heapOffer(heap, value)
      return bool(true)
    }
    case 'poll':
      return tv(elem, heapPoll(heap))
    case 'remove': {
      if (args.length === 0) {
        if (heap.items.length === 0)
          it.fail(
            'NoSuchElementException',
            'remove() was called on an empty PriorityQueue.',
          )
        return tv(elem, heapPoll(heap))
      }
      const index = heap.items.findIndex((item) =>
        it.equalsValue(item, args[0]?.v ?? null),
      )
      if (index >= 0) heapRemoveAt(heap, index)
      return bool(index >= 0)
    }
    case 'peek':
      return tv(elem, heap.items[0] ?? null)
    case 'element':
      if (heap.items.length === 0)
        it.fail(
          'NoSuchElementException',
          'element() was called on an empty PriorityQueue.',
        )
      return tv(elem, heap.items[0] ?? null)
    case 'size':
      return int(heap.items.length)
    case 'isEmpty':
      return bool(heap.items.length === 0)
    case 'clear':
      heap.items = []
      bump(heap)
      return VOID
    case 'contains':
      return bool(
        heap.items.some((item) => it.equalsValue(item, args[0]?.v ?? null)),
      )
    case 'addAll':
      for (const item of elemsOf(it, requireArg(it, args, 0, name).v).items)
        heapOffer(heap, item)
      return bool(true)
    case 'toString':
      return it.string(it.str(tv({ k: 'pq', elem, cmp: null }, heap)))
    case 'stream':
      return tv(
        { k: 'jclass', name: 'Stream' },
        streamOf([...heap.items], elem),
      )
    case 'toArray':
      return tv(
        { k: 'carray', elem, size: null },
        it.javaArray(elem, [...heap.items]),
      )
    default:
      return it.fail(
        'Compile error',
        `PriorityQueue has no method ${name}() here.`,
      )
  }
}

function entryMethod(
  it: JavaInterpreter,
  tuple: CTuple,
  name: string,
  args: TV[],
): MethodResult {
  switch (name) {
    case 'getKey':
      return { ref: it.tupleRef(tuple, 0) }
    case 'getValue':
      return { ref: it.tupleRef(tuple, 1) }
    case 'setValue': {
      const old = tuple.items[1] ?? null
      tuple.items[1] = it.element(
        requireArg(it, args, 0, name),
        tuple.types[1] ?? T.auto,
      )
      bump(tuple)
      return tv(tuple.types[1] ?? T.auto, old)
    }
    case 'toString':
      return it.string(
        it.str(
          tv(
            {
              k: 'pair',
              first: tuple.types[0] ?? T.auto,
              second: tuple.types[1] ?? T.auto,
            },
            tuple,
          ),
        ),
      )
    case 'equals':
      return bool(it.equalsValue(tuple, args[0]?.v ?? null))
    case 'hashCode':
      return int(javaHash(it, tuple))
    default:
      return it.fail('Compile error', `Map.Entry has no method ${name}().`)
  }
}

function functionMethod(
  it: JavaInterpreter,
  fn: Value,
  name: string,
  args: TV[],
): MethodResult {
  if (name === 'reversed')
    return tv(
      T.function,
      comparatorObject(it, (a, b) => compareWith(it, fn, b, a)),
    )
  if (
    name === 'thenComparing' ||
    name === 'thenComparingInt' ||
    name === 'thenComparingLong' ||
    name === 'thenComparingDouble'
  ) {
    const next = keyComparator(
      it,
      requireArg(it, args, 0, name).v,
      name !== 'thenComparing' ||
        isKeyExtractor(requireArg(it, args, 0, name).v),
    )
    return tv(
      T.function,
      comparatorObject(it, (a, b) => compareWith(it, fn, a, b) || next(a, b)),
    )
  }
  if (name === 'andThen' || name === 'compose') {
    const other = requireArg(it, args, 0, name).v
    return tv(
      T.function,
      jobject(
        'Function',
        {},
        () => 'lambda',
        (inner) => {
          const first = name === 'andThen' ? fn : other
          const second = name === 'andThen' ? other : fn
          return it.callValue(second, [it.callValue(first, inner)])
        },
      ),
    )
  }
  if (name === 'negate') {
    return tv(
      T.function,
      jobject(
        'Predicate',
        {},
        () => 'lambda',
        (inner) => bool(!it.truth(it.callValue(fn, inner))),
      ),
    )
  }
  return it.callValue(fn, args)
}

function compareWith(
  it: JavaInterpreter,
  fn: Value,
  a: Value,
  b: Value,
): number {
  return it.comparatorFor(fn)(a, b)
}

function isKeyExtractor(fn: Value): boolean {
  if (typeof fn === 'object' && fn !== null && fn.kind === 'func')
    return fn.fn.params.length === 1
  if (typeof fn === 'object' && fn !== null && fn.kind === 'jobj')
    return fn.cls === 'KeyExtractor'
  return false
}

// Comparator from a key extractor (x -> x[0]) or from a comparator.
function keyComparator(it: JavaInterpreter, fn: Value, extractor: boolean) {
  if (!extractor) return it.comparatorFor(fn)
  return (a: Value, b: Value) => {
    const ka = it.quietly(() => it.callValue(fn, [it.valueTV(a)]))
    const kb = it.quietly(() => it.callValue(fn, [it.valueTV(b)]))
    return it.compareValues(ka.v, kb.v)
  }
}

function comparatorObject(
  it: JavaInterpreter,
  order: (a: Value, b: Value) => number,
): JObj {
  void it
  return jobject(
    'Comparator',
    {},
    () => 'Comparator',
    (args) => {
      const [a, b] = args
      return int(Math.sign(order(a?.v ?? null, b?.v ?? null)))
    },
  )
}

function printMethod(
  it: JavaInterpreter,
  target: 'cout' | 'cerr',
  name: string,
  args: TV[],
  writer: JObj | null,
): MethodResult {
  const write = (text: string) => {
    it.writeText(target, text)
    if (writer !== null && writer.state.autoFlush !== true) {
      writer.state.pending = Number(writer.state.pending) + text.length
      it.unflushed.length += text.length
    }
  }
  const printable = (value: TV) => {
    const v = value.v
    if (
      typeof v === 'object' &&
      v !== null &&
      v.kind === 'seq' &&
      v.seq === 'carray' &&
      v.elemType.k === 'int' &&
      v.elemType.char === true
    ) {
      return v.items.map((code) => String.fromCharCode(Number(code))).join('')
    }
    if (
      typeof v === 'object' &&
      v !== null &&
      v.kind === 'seq' &&
      v.seq === 'carray'
    ) {
      it.note(
        'Printing an array shows its type and address, not its contents. Use Arrays.toString(a).',
      )
    }
    return it.str(value)
  }
  switch (name) {
    case 'println':
      write(`${args[0] === undefined ? '' : printable(args[0])}\n`)
      return VOID
    case 'print':
    case 'append':
      write(printable(requireArg(it, args, 0, name)))
      return writer === null
        ? VOID
        : tv({ k: 'jclass', name: writer.cls }, writer)
    case 'write': {
      const value = requireArg(it, args, 0, name)
      write(
        value.t.k === 'int' && value.t.char !== true
          ? String.fromCharCode(num(value))
          : printable(value),
      )
      return VOID
    }
    case 'newLine':
      write('\n')
      return VOID
    case 'printf':
    case 'format':
      write(javaFormat(it, args))
      return VOID
    case 'flush':
    case 'close':
      if (writer !== null) {
        it.unflushed.length -= Number(writer.state.pending)
        writer.state.pending = 0
      }
      return VOID
    case 'checkError':
      return bool(false)
    default:
      return it.fail(
        'Compile error',
        `${writer?.cls ?? 'PrintStream'} has no method ${name}() here.`,
      )
  }
}

// String.format / printf with Java's %n, %b, %s (any value) and %,d.
export function javaFormat(it: JavaInterpreter, args: TV[]): string {
  const template = text(it, args[0])
  const values = args.slice(1)
  let output = ''
  let argIndex = 0
  const pattern = /%([-#+ 0,(]*)(\d+)?(?:\.(\d+))?([a-zA-Z%])/g
  let last = 0
  for (
    let match = pattern.exec(template);
    match !== null;
    match = pattern.exec(template)
  ) {
    output += template.slice(last, match.index)
    last = match.index + match[0].length
    const [, flags = '', width, precision, conversion = ''] = match
    if (conversion === 'n') {
      output += '\n'
      continue
    }
    if (conversion === '%') {
      output += '%'
      continue
    }
    const value = values[argIndex]
    argIndex += 1
    if (value === undefined) {
      it.fail(
        'MissingFormatArgumentException',
        `Format specifier '${match[0]}' has no argument.`,
      )
    }
    const pad = (body: string) => {
      const size = width === undefined ? 0 : Number(width)
      if (body.length >= size) return body
      return flags.includes('-') ? body.padEnd(size) : body.padStart(size)
    }
    switch (conversion) {
      case 's':
      case 'S': {
        let body = it.str(value)
        if (precision !== undefined) body = body.slice(0, Number(precision))
        output += pad(conversion === 'S' ? body.toUpperCase() : body)
        break
      }
      case 'b':
      case 'B':
        output += pad(
          value.v === null
            ? 'false'
            : value.t.k === 'bool'
              ? String(truthy(value.v))
              : 'true',
        )
        break
      case 'c':
        output += pad(String.fromCharCode(num(value)))
        break
      case 'd': {
        if (value.t.k === 'float')
          it.fail('IllegalFormatConversionException', `d != java.lang.Double`)
        let digits = big(value).toString()
        if (flags.includes(',')) {
          const negative = digits.startsWith('-')
          const body = negative ? digits.slice(1) : digits
          digits =
            (negative ? '-' : '') + body.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        }
        const arg: PrintfArg = { kind: 'string', value: digits }
        const spec = `%${flags.replace(',', '').replace('(', '')}${width ?? ''}s`
        output +=
          flags.includes('0') && !flags.includes('-') && width !== undefined
            ? formatPrintf(`%${flags.replace(',', '')}${width}d`, [
                { kind: 'int', value: big(value) },
              ]).replace(/\d+/, (m) =>
                flags.includes(',') ? digits.replace('-', '') : m,
              )
            : formatPrintf(
                flags.includes('+') && !digits.startsWith('-')
                  ? `+${spec.replace('+', '')}`
                  : spec,
                [arg],
              ).replace(/^\+%/, '')
        if (
          flags.includes('+') &&
          !digits.startsWith('-') &&
          !output.endsWith(digits)
        )
          output = output.replace(/(\s*)(\d)/, '$1+$2')
        break
      }
      case 'x':
      case 'X':
      case 'o': {
        const bits = value.t.k === 'int' && value.t.bits >= 64 ? 64 : 32
        const unsigned = BigInt.asUintN(bits, big(value))
        const body = unsigned.toString(conversion === 'o' ? 8 : 16)
        output += pad(conversion === 'X' ? body.toUpperCase() : body)
        break
      }
      case 'f':
      case 'e':
      case 'E':
      case 'g':
      case 'G': {
        if (value.t.k === 'int')
          it.fail(
            'IllegalFormatConversionException',
            `${conversion} != java.lang.Integer`,
          )
        let body = formatPrintf(
          `%${flags.replace(',', '')}${width ?? ''}${precision === undefined ? '' : `.${precision}`}${conversion}`,
          [{ kind: 'float', value: num(value) }],
        )
        if (flags.includes(','))
          body = body.replace(
            /^(\s*-?)(\d+)/,
            (_m, sign: string, whole: string) =>
              sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ','),
          )
        output += body
        break
      }
      default:
        it.fail(
          'UnknownFormatConversionException',
          `Conversion = '${conversion}'`,
        )
    }
  }
  output += template.slice(last)
  return output
}

// ---- library objects -----------------------------------------------------------------------

function readTokenOrFail(it: JavaInterpreter, method: string): string {
  it.skipSpaces()
  if (it.inPos >= it.stdin.length) {
    it.fail('NoSuchElementException', `${method}() found no more input.`, [
      'The program tried to read more values than the test input contains.',
    ])
  }
  return it.readToken()
}

function peekToken(it: JavaInterpreter): string | null {
  const saved = it.inPos
  it.skipSpaces()
  if (it.inPos >= it.stdin.length) {
    it.inPos = saved
    return null
  }
  const token = it.readToken()
  it.inPos = saved
  return token
}

function parseIntToken(
  it: JavaInterpreter,
  token: string,
  type: CType,
  method: string,
): TV {
  if (!/^[+-]?\d+$/.test(token)) {
    it.fail(
      method.startsWith('parse')
        ? 'NumberFormatException'
        : 'InputMismatchException',
      `For input string: "${token}"`,
    )
  }
  const value = BigInt(token)
  const [lo, hi] = intRange(type as CType & { k: 'int' })
  if (value < lo || value > hi) {
    it.fail(
      method.startsWith('parse')
        ? 'NumberFormatException'
        : 'InputMismatchException',
      `For input string: "${token}"${method.startsWith('parse') ? '' : ` (out of range for ${javaTypeName(type)})`}`,
    )
  }
  return type.k === 'int' && type.bits >= 64 ? long(value) : int(Number(value))
}

function objectMethod(
  it: JavaInterpreter,
  object: JObj,
  name: string,
  args: TV[],
): MethodResult {
  const methods = object.state.methods as
    Record<string, (args: TV[]) => TV> | undefined
  const custom = methods?.[name]
  if (custom !== undefined) return custom(args)
  if (object.call !== undefined) return functionMethod(it, object, name, args)
  switch (object.cls) {
    case 'Scanner':
      return scannerMethod(it, name)
    case 'BufferedReader':
      switch (name) {
        case 'readLine': {
          const line = it.readLine()
          return line === null ? tv(T.string, null) : it.string(line)
        }
        case 'read': {
          if (it.inPos >= it.stdin.length) return int(-1)
          const code = it.stdin.charCodeAt(it.inPos)
          it.inPos += 1
          return int(code)
        }
        case 'ready':
          return bool(it.inPos < it.stdin.length)
        case 'close':
          return VOID
        default:
          break
      }
      break
    case 'StringTokenizer': {
      const tokens = object.state.tokens as string[]
      const index = object.state.index as number
      switch (name) {
        case 'nextToken':
        case 'nextElement':
          if (index >= tokens.length)
            it.fail(
              'NoSuchElementException',
              'nextToken() was called with no tokens left.',
            )
          object.state.index = index + 1
          return it.string(tokens[index] ?? '')
        case 'hasMoreTokens':
        case 'hasMoreElements':
          return bool(index < tokens.length)
        case 'countTokens':
          return int(tokens.length - index)
        default:
          break
      }
      break
    }
    case 'PrintWriter':
    case 'BufferedWriter':
    case 'OutputStreamWriter':
    case 'PrintStream':
      return printMethod(
        it,
        object.state.target === 'cerr' ? 'cerr' : 'cout',
        name,
        args,
        object,
      )
    case 'Random':
      switch (name) {
        case 'nextInt': {
          if (args.length === 2) {
            const lo = num(requireArg(it, args, 0, name))
            const hi = num(requireArg(it, args, 1, name))
            return int(lo + randomNextInt(object, hi - lo))
          }
          if (args[0] !== undefined) {
            const limit = num(args[0])
            if (limit <= 0)
              it.fail('IllegalArgumentException', 'bound must be positive')
            return int(randomNextInt(object, limit))
          }
          return int(randomNextInt(object))
        }
        case 'nextLong': {
          const next = object.state.next as (bits: number) => number
          return long((BigInt(next(32)) << 32n) + BigInt(next(32)))
        }
        case 'nextDouble': {
          const next = object.state.next as (bits: number) => number
          return double(
            ((next(26) >>> 0) * 2 ** 27 + (next(27) >>> 0)) * 2 ** -53,
          )
        }
        case 'nextBoolean': {
          const next = object.state.next as (bits: number) => number
          return bool(next(1) !== 0)
        }
        default:
          break
      }
      break
    case 'Stream':
      return streamMethod(it, object, name, args)
    case 'Optional':
      return optionalMethod(it, object, name, args)
    default:
      if (isExceptionClass(object.cls)) {
        switch (name) {
          case 'getMessage':
          case 'getLocalizedMessage':
            return object.state.message === ''
              ? tv(T.string, null)
              : it.string(String(object.state.message))
          case 'toString':
            return it.string(object.describe())
          case 'printStackTrace':
            it.writeText('cerr', `${object.describe()}\n`)
            return VOID
          default:
            break
        }
      }
  }
  return it.fail('Compile error', `${object.cls} has no method ${name}() here.`)
}

function scannerMethod(it: JavaInterpreter, name: string): MethodResult {
  switch (name) {
    case 'nextInt':
      return parseIntToken(it, readTokenOrFail(it, name), T.int, name)
    case 'nextLong':
      return parseIntToken(it, readTokenOrFail(it, name), T.ll, name)
    case 'nextShort':
      return parseIntToken(it, readTokenOrFail(it, name), T.short, name)
    case 'nextByte':
      return parseIntToken(
        it,
        readTokenOrFail(it, name),
        { k: 'int', bits: 8, unsigned: false },
        name,
      )
    case 'nextDouble':
    case 'nextFloat': {
      const token = readTokenOrFail(it, name)
      const value = Number(token)
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(token))
        it.fail('InputMismatchException', `For input string: "${token}"`)
      return double(value)
    }
    case 'nextBoolean': {
      const token = readTokenOrFail(it, name).toLowerCase()
      if (token !== 'true' && token !== 'false')
        it.fail('InputMismatchException', `For input string: "${token}"`)
      return bool(token === 'true')
    }
    case 'next':
      return it.string(readTokenOrFail(it, name))
    case 'nextLine': {
      const line = it.readLine()
      if (line === null)
        it.fail('NoSuchElementException', 'No line found', [
          'nextLine() was called after the input ended.',
        ])
      return it.string(line)
    }
    case 'hasNext':
      return bool(peekToken(it) !== null)
    case 'hasNextInt':
    case 'hasNextLong': {
      const token = peekToken(it)
      return bool(token !== null && /^[+-]?\d+$/.test(token))
    }
    case 'hasNextDouble': {
      const token = peekToken(it)
      return bool(token !== null && !Number.isNaN(Number(token)))
    }
    case 'hasNextLine':
      return bool(it.inPos < it.stdin.length)
    case 'close':
      return VOID
    default:
      return it.fail('Compile error', `Scanner has no method ${name}().`)
  }
}

// ---- streams (a small subset) -------------------------------------------------------------

function streamOf(items: Value[], type: CType): JObj {
  return jobject('Stream', { items, type }, () => 'java.util.stream.Stream')
}

function optional(
  it: JavaInterpreter,
  value: Value,
  type: CType,
  present: boolean,
): JObj {
  return jobject('Optional', { value, type, present }, () =>
    present ? `Optional[${it.str(tv(type, value))}]` : 'Optional.empty',
  )
}

// String.trim removes characters up to and including the space (U+0020).
function javaTrim(s: string): string {
  let start = 0
  let end = s.length
  while (start < end && s.charCodeAt(start) <= 32) start += 1
  while (end > start && s.charCodeAt(end - 1) <= 32) end -= 1
  return s.slice(start, end)
}

function optionalMethod(
  it: JavaInterpreter,
  object: JObj,
  name: string,
  args: TV[],
): MethodResult {
  const present = object.state.present === true
  const value = tv(object.state.type as CType, object.state.value as Value)
  switch (name) {
    case 'getAsInt':
    case 'getAsLong':
    case 'getAsDouble':
    case 'get':
    case 'orElseThrow':
      if (!present) it.fail('NoSuchElementException', 'No value present')
      return value
    case 'orElse':
      return present ? value : requireArg(it, args, 0, name)
    case 'isPresent':
      return bool(present)
    case 'isEmpty':
      return bool(!present)
    default:
      return it.fail('Compile error', `Optional has no method ${name}().`)
  }
}

function streamMethod(
  it: JavaInterpreter,
  stream: JObj,
  name: string,
  args: TV[],
): MethodResult {
  const items = stream.state.items as Value[]
  const type = stream.state.type as CType
  const fn = () => requireArg(it, args, 0, name).v
  const apply = (value: Value) =>
    it.quietly(() => it.callValue(fn(), [tv(type, value)]))
  const numeric = type.k === 'int' || type.k === 'float'
  switch (name) {
    case 'map':
    case 'mapToInt':
    case 'mapToLong':
    case 'mapToDouble':
    case 'mapToObj': {
      const mapped = items.map((item) => apply(item))
      const mappedType =
        name === 'mapToInt'
          ? T.int
          : name === 'mapToLong'
            ? T.ll
            : name === 'mapToDouble'
              ? T.double
              : (mapped[0]?.t ?? type)
      return tv(
        stream.state.type as CType,
        streamOf(
          mapped.map((value) => it.coerce(value, mappedType)),
          mappedType,
        ),
      )
    }
    case 'filter':
      return tv(
        type,
        streamOf(
          items.filter((item) => it.truth(apply(item))),
          type,
        ),
      )
    case 'boxed':
    case 'parallel':
    case 'sequential':
      return tv(type, stream)
    case 'sorted':
      return tv(
        type,
        streamOf([...items].sort(it.comparatorFor(args[0]?.v ?? null)), type),
      )
    case 'distinct': {
      const seen: Value[] = []
      for (const item of items)
        if (!seen.some((x) => it.equalsValue(x, item))) seen.push(item)
      return tv(type, streamOf(seen, type))
    }
    case 'limit':
      return tv(
        type,
        streamOf(items.slice(0, num(requireArg(it, args, 0, name))), type),
      )
    case 'skip':
      return tv(
        type,
        streamOf(items.slice(num(requireArg(it, args, 0, name))), type),
      )
    case 'sum': {
      if (type.k === 'float')
        return double(
          items.reduce<number>((sum, item) => sum + Number(item), 0),
        )
      if (type.k === 'int' && type.bits >= 64)
        return long(
          items.reduce<bigint>(
            (sum, item) => sum + BigInt(item as number | bigint),
            0n,
          ),
        )
      return int(
        items.reduce<number>((sum, item) => (sum + Number(item)) | 0, 0),
      )
    }
    case 'count':
      return long(BigInt(items.length))
    case 'average': {
      if (items.length === 0)
        return tv(
          { k: 'jclass', name: 'Optional' },
          optional(it, null, T.double, false),
        )
      return tv(
        { k: 'jclass', name: 'Optional' },
        optional(
          it,
          items.reduce<number>((sum, item) => sum + Number(item), 0) /
            items.length,
          T.double,
          true,
        ),
      )
    }
    case 'max':
    case 'min': {
      if (items.length === 0)
        return tv(
          { k: 'jclass', name: 'Optional' },
          optional(it, null, type, false),
        )
      const order = it.comparatorFor(args[0]?.v ?? null)
      let best = items[0] ?? null
      for (const item of items.slice(1)) {
        const diff = order(item, best)
        if (name === 'max' ? diff > 0 : diff < 0) best = item
      }
      return tv(
        { k: 'jclass', name: 'Optional' },
        optional(it, best, type, true),
      )
    }
    case 'findFirst':
    case 'findAny':
      return tv(
        { k: 'jclass', name: 'Optional' },
        optional(it, items[0] ?? null, type, items.length > 0),
      )
    case 'anyMatch':
      return bool(items.some((item) => it.truth(apply(item))))
    case 'allMatch':
      return bool(items.every((item) => it.truth(apply(item))))
    case 'noneMatch':
      return bool(!items.some((item) => it.truth(apply(item))))
    case 'forEach':
    case 'forEachOrdered':
      for (const item of items) apply(item)
      return VOID
    case 'reduce': {
      if (args.length === 2) {
        let total = requireArg(it, args, 0, name)
        for (const item of items)
          total = it.quietly(() =>
            it.callValue(requireArg(it, args, 1, name).v, [
              total,
              tv(type, item),
            ]),
          )
        return total
      }
      if (items.length === 0)
        return tv(
          { k: 'jclass', name: 'Optional' },
          optional(it, null, type, false),
        )
      let total = tv(type, items[0] ?? null)
      for (const item of items.slice(1))
        total = it.quietly(() => it.callValue(fn(), [total, tv(type, item)]))
      return tv(
        { k: 'jclass', name: 'Optional' },
        optional(it, total.v, type, true),
      )
    }
    case 'toArray':
      return tv(
        { k: 'carray', elem: type, size: null },
        it.javaArray(type, [...items]),
      )
    case 'toList':
      return tv(
        { k: 'vector', elem: type },
        {
          kind: 'seq',
          seq: 'vector',
          elemType: type,
          items: [...items],
          ver: 0,
          touched: 0,
          fixed: false,
          jclass: 'ArrayList',
        },
      )
    case 'collect': {
      const collector = requireArg(it, args, 0, name).v
      if (
        typeof collector === 'object' &&
        collector !== null &&
        collector.kind === 'jobj' &&
        collector.cls === 'Collector'
      ) {
        const collect = collector.state.collect as (
          items: Value[],
          type: CType,
        ) => TV
        return collect(items, type)
      }
      return it.fail(
        'Compile error',
        'collect() needs a Collectors.* collector.',
      )
    }
    default:
      if (!numeric) void numeric
      return it.fail(
        'Not supported by the visualizer',
        `Stream.${name}() is not supported by the visualizer yet.`,
      )
  }
}

function collector(collect: (items: Value[], type: CType) => TV): JObj {
  return jobject('Collector', { collect }, () => 'Collector')
}

// ---- static members -------------------------------------------------------------------------

export function javaStaticValue(
  it: JavaInterpreter,
  scope: string,
  name: string,
): TV {
  const key = `${scope}.${name}`
  switch (key) {
    case 'System.out':
      return tv(T.stream, { kind: 'stream', name: 'cout' })
    case 'System.err':
      return tv(T.stream, { kind: 'stream', name: 'cerr' })
    case 'System.in':
      return tv(T.stream, { kind: 'stream', name: 'cin' })
    case 'Integer.MAX_VALUE':
      return int(2147483647)
    case 'Integer.MIN_VALUE':
      return int(-2147483648)
    case 'Long.MAX_VALUE':
      return long(9223372036854775807n)
    case 'Long.MIN_VALUE':
      return long(-9223372036854775808n)
    case 'Short.MAX_VALUE':
      return tv(T.short, 32767)
    case 'Short.MIN_VALUE':
      return tv(T.short, -32768)
    case 'Byte.MAX_VALUE':
      return tv({ k: 'int', bits: 8, unsigned: false }, 127)
    case 'Byte.MIN_VALUE':
      return tv({ k: 'int', bits: 8, unsigned: false }, -128)
    case 'Character.MAX_VALUE':
      return char(0xffff)
    case 'Character.MIN_VALUE':
      return char(0)
    case 'Double.MAX_VALUE':
      return double(Number.MAX_VALUE)
    case 'Double.MIN_VALUE':
      return double(Number.MIN_VALUE)
    case 'Double.POSITIVE_INFINITY':
      return double(Infinity)
    case 'Double.NEGATIVE_INFINITY':
      return double(-Infinity)
    case 'Double.NaN':
      return double(NaN)
    case 'Float.MAX_VALUE':
      return tv(T.float, 3.4028234663852886e38)
    case 'Math.PI':
      return double(Math.PI)
    case 'Math.E':
      return double(Math.E)
    case 'Boolean.TRUE':
      return tv({ k: 'bool', boxed: true }, true)
    case 'Boolean.FALSE':
      return tv({ k: 'bool', boxed: true }, false)
    default:
      return it.fail(
        'Compile error',
        `${key} is not supported by the visualizer yet.`,
      )
  }
}

let mathRandom: JObj | null = null

function mathMinMax(it: JavaInterpreter, args: TV[], name: 'max' | 'min'): TV {
  const a = requireArg(it, args, 0, name)
  const b = requireArg(it, args, 1, name)
  const type = commonType(plain(a.t), plain(b.t))
  if (type.k === 'float') {
    const x = num(a)
    const y = num(b)
    if (Number.isNaN(x) || Number.isNaN(y)) return double(NaN)
    return tv(type, name === 'max' ? Math.max(x, y) : Math.min(x, y))
  }
  const winner = compareArith(name === 'max' ? '>=' : '<=', a, b) ? a : b
  return tv(type, convertScalar(winner.v, winner.t, type))
}

function plain(type: CType): CType {
  if (
    (type.k === 'int' || type.k === 'float' || type.k === 'bool') &&
    type.boxed === true
  ) {
    const rest = { ...type } as CType & { boxed?: boolean }
    delete rest.boxed
    return rest
  }
  if (type.k === 'int' && type.char === true) return T.int
  return type
}

function exact(
  it: JavaInterpreter,
  args: TV[],
  op: '+' | '-' | '*',
  name: string,
): TV {
  const a = requireArg(it, args, 0, name)
  const b = requireArg(it, args, 1, name)
  const wide = isLongType(a.t) || isLongType(b.t)
  const x = big(a)
  const y = big(b)
  const result = op === '+' ? x + y : op === '-' ? x - y : x * y
  const bits = wide ? 64 : 32
  if (BigInt.asIntN(bits, result) !== result)
    it.fail('ArithmeticException', `${wide ? 'long' : 'integer'} overflow`)
  return wide ? long(result) : int(Number(result))
}

function arraysSort(it: JavaInterpreter, args: TV[]) {
  const array = requireArg(it, args, 0, 'Arrays.sort').v
  if (array === null) it.npe('Arrays.sort was given a null array.')
  if (typeof array !== 'object' || array.kind !== 'seq')
    return it.fail('Compile error', 'Arrays.sort needs an array.')
  let from = 0
  let to = array.items.length
  let comparator: Value
  if (args.length >= 3 && typeof args[1]?.v === 'number') {
    from = num(requireArg(it, args, 1, 'Arrays.sort'))
    to = num(requireArg(it, args, 2, 'Arrays.sort'))
    comparator = args[3]?.v ?? null
  } else comparator = args[1]?.v ?? null
  if (from < 0 || to > array.items.length || from > to) {
    it.fail('ArrayIndexOutOfBoundsException', `Array index out of range: ${to}`)
  }
  const part = array.items.slice(from, to)
  if (comparator === null && array.elemType.k === 'float') {
    part.sort(
      (a, b) => Number(a) - Number(b) || (Object.is(a, -0) && b === 0 ? -1 : 0),
    )
  } else {
    if (
      comparator !== null &&
      (array.elemType.k === 'int' || array.elemType.k === 'float') &&
      array.elemType.boxed !== true
    ) {
      it.fail(
        'Compile error',
        'Arrays.sort with a comparator needs an array of objects (Integer[], int[][]), not a primitive array.',
      )
    }
    part.sort(it.comparatorFor(comparator))
  }
  array.items.splice(from, part.length, ...part)
  bump(array)
}

function sequenceText(it: JavaInterpreter, value: TV, deep: boolean): string {
  const v = value.v
  if (v === null) return 'null'
  if (typeof v !== 'object' || v.kind !== 'seq') return it.str(value)
  return `[${v.items
    .map((item) => {
      if (
        deep &&
        typeof item === 'object' &&
        item !== null &&
        item.kind === 'seq' &&
        item.seq === 'carray'
      ) {
        return sequenceText(it, tv(v.elemType, item), true)
      }
      return it.str(tv(v.elemType, item))
    })
    .join(', ')}]`
}

function listOf(
  it: JavaInterpreter,
  values: TV[],
  jclass = 'ImmutableList',
): TV {
  const elem = values[0]?.t ?? T.auto
  const seq: CSeq = {
    kind: 'seq',
    seq: 'vector',
    elemType: elem,
    items: values.map((value) => value.v),
    ver: 0,
    touched: 0,
    fixed: false,
    jclass,
  }
  void it
  return tv({ k: 'vector', elem }, seq)
}

export function callJavaStatic(
  it: JavaInterpreter,
  scope: string,
  name: string,
  argExprs: Expr[],
  call: Call,
): MethodResult {
  void call
  const args = evalAll(it, argExprs)
  const a0 = args[0]
  const a1 = args[1]
  const key = `${scope}.${name}`
  switch (scope) {
    case 'Math':
    case 'StrictMath':
      switch (name) {
        case 'max':
        case 'min':
          return mathMinMax(it, args, name)
        case 'abs': {
          const value = requireArg(it, args, 0, key)
          const type = plain(value.t)
          if (type.k === 'float') return tv(type, Math.abs(num(value)))
          const bits = type.k === 'int' && type.bits >= 64 ? 64 : 32
          const x = big(value)
          const result = BigInt.asIntN(bits, x < 0n ? -x : x)
          return bits >= 64 ? long(result) : int(Number(result))
        }
        case 'pow':
          return double(
            Math.pow(
              num(requireArg(it, args, 0, key)),
              num(requireArg(it, args, 1, key)),
            ),
          )
        case 'sqrt':
          return double(Math.sqrt(num(requireArg(it, args, 0, key))))
        case 'cbrt':
          return double(Math.cbrt(num(requireArg(it, args, 0, key))))
        case 'floor':
          return double(Math.floor(num(requireArg(it, args, 0, key))))
        case 'ceil':
          return double(Math.ceil(num(requireArg(it, args, 0, key))))
        case 'rint': {
          const x = num(requireArg(it, args, 0, key))
          const r = Math.round(x)
          return double(
            Math.abs(x - Math.trunc(x)) === 0.5 && r % 2 !== 0 ? r - 1 : r,
          )
        }
        case 'round': {
          const value = requireArg(it, args, 0, key)
          const rounded = Math.floor(num(value) + 0.5)
          return value.t.k === 'float' && value.t.name === 'float'
            ? int(rounded)
            : long(BigInt(Number.isFinite(rounded) ? rounded : 0))
        }
        case 'log':
          return double(Math.log(num(requireArg(it, args, 0, key))))
        case 'log10':
          return double(Math.log10(num(requireArg(it, args, 0, key))))
        case 'exp':
          return double(Math.exp(num(requireArg(it, args, 0, key))))
        case 'sin':
        case 'cos':
        case 'tan':
        case 'asin':
        case 'acos':
        case 'atan':
          return double(Math[name](num(requireArg(it, args, 0, key))))
        case 'atan2':
          return double(
            Math.atan2(
              num(requireArg(it, args, 0, key)),
              num(requireArg(it, args, 1, key)),
            ),
          )
        case 'hypot':
          return double(
            Math.hypot(
              num(requireArg(it, args, 0, key)),
              num(requireArg(it, args, 1, key)),
            ),
          )
        case 'signum':
          return double(Math.sign(num(requireArg(it, args, 0, key))))
        case 'toRadians':
          return double((num(requireArg(it, args, 0, key)) * Math.PI) / 180)
        case 'toDegrees':
          return double((num(requireArg(it, args, 0, key)) * 180) / Math.PI)
        case 'floorDiv':
        case 'floorMod': {
          const a = requireArg(it, args, 0, key)
          const b = requireArg(it, args, 1, key)
          const wide = isLongType(a.t) || isLongType(b.t)
          const x = big(a)
          const y = big(b)
          if (y === 0n) it.fail('ArithmeticException', '/ by zero')
          let q = x / y
          if (x % y !== 0n && x < 0n !== y < 0n) q -= 1n
          const result = name === 'floorDiv' ? q : x - q * y
          return wide ? long(result) : int(Number(result))
        }
        case 'addExact':
          return exact(it, args, '+', key)
        case 'subtractExact':
          return exact(it, args, '-', key)
        case 'multiplyExact':
          return exact(it, args, '*', key)
        case 'random':
          mathRandom ??= randomObject(42n)
          return double(
            num(objectMethod(it, mathRandom, 'nextDouble', []) as TV),
          )
        default:
          break
      }
      break
    case 'Integer':
    case 'Long':
    case 'Short':
    case 'Byte': {
      const type =
        scope === 'Long'
          ? T.ll
          : scope === 'Short'
            ? T.short
            : scope === 'Byte'
              ? ({ k: 'int', bits: 8, unsigned: false } as CType)
              : T.int
      const bits = scope === 'Long' ? 64 : 32
      const boxedType = scope === 'Long' ? LONG : INTEGER
      switch (name) {
        case 'parseInt':
        case 'parseLong':
        case 'parseShort':
        case 'parseByte':
        case 'valueOf': {
          const value = requireArg(it, args, 0, key)
          if (typeof value.v === 'number' || typeof value.v === 'bigint')
            return tv(boxedType, convertScalar(value.v, value.t, type))
          const radix = a1 === undefined ? 10 : num(a1)
          const source = text(it, value)
          if (radix !== 10) {
            if (!/^[+-]?[0-9a-zA-Z]+$/.test(source))
              it.fail('NumberFormatException', `For input string: "${source}"`)
            const parsed = Number.parseInt(source, radix)
            if (Number.isNaN(parsed))
              it.fail('NumberFormatException', `For input string: "${source}"`)
            return scope === 'Long' ? long(BigInt(parsed)) : int(parsed)
          }
          const parsed = parseIntToken(it, source, type, 'parse')
          return name === 'valueOf' ? tv(boxedType, parsed.v) : parsed
        }
        case 'toString': {
          const value = requireArg(it, args, 0, key)
          return it.string(
            a1 === undefined
              ? String(big(value))
              : big(value).toString(num(a1)),
          )
        }
        case 'toBinaryString':
          return it.string(
            BigInt.asUintN(bits, big(requireArg(it, args, 0, key))).toString(2),
          )
        case 'toHexString':
          return it.string(
            BigInt.asUintN(bits, big(requireArg(it, args, 0, key))).toString(
              16,
            ),
          )
        case 'toOctalString':
          return it.string(
            BigInt.asUintN(bits, big(requireArg(it, args, 0, key))).toString(8),
          )
        case 'bitCount':
          return int(
            [
              ...BigInt.asUintN(
                bits,
                big(requireArg(it, args, 0, key)),
              ).toString(2),
            ].filter((c) => c === '1').length,
          )
        case 'numberOfTrailingZeros': {
          const x = BigInt.asUintN(bits, big(requireArg(it, args, 0, key)))
          if (x === 0n) return int(bits)
          const binary = x.toString(2)
          return int(binary.length - 1 - binary.lastIndexOf('1'))
        }
        case 'numberOfLeadingZeros': {
          const x = BigInt.asUintN(bits, big(requireArg(it, args, 0, key)))
          return int(x === 0n ? bits : bits - x.toString(2).length)
        }
        case 'highestOneBit': {
          const x = BigInt.asUintN(bits, big(requireArg(it, args, 0, key)))
          const result = x === 0n ? 0n : 1n << BigInt(x.toString(2).length - 1)
          return bits >= 64
            ? long(result)
            : int(Number(BigInt.asIntN(32, result)))
        }
        case 'lowestOneBit': {
          const x = big(requireArg(it, args, 0, key))
          const result = BigInt.asIntN(bits, x & -x)
          return bits >= 64 ? long(result) : int(Number(result))
        }
        case 'compare':
          return int(
            compareArith(
              '<',
              requireArg(it, args, 0, key),
              requireArg(it, args, 1, key),
            )
              ? -1
              : compareArith(
                    '>',
                    requireArg(it, args, 0, key),
                    requireArg(it, args, 1, key),
                  )
                ? 1
                : 0,
          )
        case 'signum':
          return int(Math.sign(num(requireArg(it, args, 0, key))))
        case 'sum':
          return exactWrap(
            requireArg(it, args, 0, key),
            requireArg(it, args, 1, key),
            bits,
          )
        case 'max':
        case 'min':
          return mathMinMax(it, args, name)
        case 'reverse': {
          const x = BigInt.asUintN(bits, big(requireArg(it, args, 0, key)))
            .toString(2)
            .padStart(bits, '0')
          const result = BigInt.asIntN(
            bits,
            BigInt(`0b${[...x].reverse().join('')}`),
          )
          return bits >= 64 ? long(result) : int(Number(result))
        }
        case 'hashCode':
          return int(javaHash(it, requireArg(it, args, 0, key).v, type))
        default:
          break
      }
      break
    }
    case 'Double':
    case 'Float':
      switch (name) {
        case 'parseDouble':
        case 'parseFloat':
        case 'valueOf': {
          const value = requireArg(it, args, 0, key)
          if (typeof value.v === 'number' || typeof value.v === 'bigint')
            return tv(DOUBLE, num(value))
          const source = text(it, value).trim()
          const parsed = Number(source)
          if (source === '' || (Number.isNaN(parsed) && source !== 'NaN'))
            it.fail('NumberFormatException', `For input string: "${source}"`)
          return double(parsed)
        }
        case 'compare': {
          const x = num(requireArg(it, args, 0, key))
          const y = num(requireArg(it, args, 1, key))
          return int(x < y ? -1 : x > y ? 1 : 0)
        }
        case 'isNaN':
          return bool(Number.isNaN(num(requireArg(it, args, 0, key))))
        case 'isInfinite':
          return bool(
            !Number.isFinite(num(requireArg(it, args, 0, key))) &&
              !Number.isNaN(num(requireArg(it, args, 0, key))),
          )
        case 'toString':
          return it.string(javaDouble(num(requireArg(it, args, 0, key))))
        case 'max':
        case 'min':
          return mathMinMax(it, args, name)
        case 'sum':
          return double(
            num(requireArg(it, args, 0, key)) +
              num(requireArg(it, args, 1, key)),
          )
        default:
          break
      }
      break
    case 'Character': {
      const code = a0 === undefined ? 0 : num(a0)
      const c = String.fromCharCode(code)
      switch (name) {
        case 'isDigit':
          return bool(/\p{Nd}/u.test(c))
        case 'isLetter':
        case 'isAlphabetic':
          return bool(/\p{L}/u.test(c))
        case 'isLetterOrDigit':
          return bool(/[\p{L}\p{Nd}]/u.test(c))
        case 'isUpperCase':
          return bool(/\p{Lu}/u.test(c))
        case 'isLowerCase':
          return bool(/\p{Ll}/u.test(c))
        case 'isWhitespace':
          return bool(
            code === 32 ||
              (code >= 9 && code <= 13) ||
              (code >= 28 && code <= 31),
          )
        case 'isSpaceChar':
          return bool(/\p{Zs}/u.test(c))
        case 'toUpperCase':
          return a0 !== undefined && a0.t.k === 'int' && a0.t.char !== true
            ? int(c.toUpperCase().charCodeAt(0))
            : char(c.toUpperCase().charCodeAt(0))
        case 'toLowerCase':
          return a0 !== undefined && a0.t.k === 'int' && a0.t.char !== true
            ? int(c.toLowerCase().charCodeAt(0))
            : char(c.toLowerCase().charCodeAt(0))
        case 'getNumericValue': {
          if (/[0-9]/.test(c)) return int(code - 48)
          if (/[a-z]/i.test(c)) return int(c.toLowerCase().charCodeAt(0) - 87)
          return int(-1)
        }
        case 'digit': {
          const radix = num(requireArg(it, args, 1, key))
          const value = Number.parseInt(c, radix)
          return int(Number.isNaN(value) ? -1 : value)
        }
        case 'forDigit': {
          const radix = num(requireArg(it, args, 1, key))
          return char(
            code >= 0 && code < radix ? code.toString(radix).charCodeAt(0) : 0,
          )
        }
        case 'valueOf':
          return tv(CHARACTER, code)
        case 'toString':
          return it.string(c)
        case 'compare':
          return int(code - num(requireArg(it, args, 1, key)))
        case 'isAlphabetic_':
          break
        default:
          break
      }
      break
    }
    case 'Boolean':
      switch (name) {
        case 'parseBoolean':
          return bool(text(it, a0).toLowerCase() === 'true')
        case 'valueOf':
          return tv(
            { k: 'bool', boxed: true },
            a0 !== undefined &&
              (a0.t.k === 'bool'
                ? truthy(a0.v)
                : text(it, a0).toLowerCase() === 'true'),
          )
        case 'toString':
          return it.string(truthy(a0?.v ?? false) ? 'true' : 'false')
        case 'compare':
          return int(
            Number(truthy(a0?.v ?? false)) - Number(truthy(a1?.v ?? false)),
          )
        default:
          break
      }
      break
    case 'String':
      switch (name) {
        case 'valueOf':
        case 'copyValueOf': {
          const value = requireArg(it, args, 0, key)
          const v = value.v
          if (
            typeof v === 'object' &&
            v !== null &&
            v.kind === 'seq' &&
            v.elemType.k === 'int' &&
            v.elemType.char === true
          ) {
            const offset = a1 === undefined ? 0 : num(a1)
            const count =
              args[2] === undefined ? v.items.length - offset : num(args[2])
            return it.string(
              v.items
                .slice(offset, offset + count)
                .map((code) => String.fromCharCode(Number(code)))
                .join(''),
            )
          }
          return it.string(it.str(value))
        }
        case 'join': {
          const separator = text(it, a0)
          const rest = args.slice(1)
          const first = rest[0]
          const parts =
            rest.length === 1 &&
            first !== undefined &&
            typeof first.v === 'object' &&
            first.v !== null &&
            first.v.kind !== 'str'
              ? elemsOf(it, first.v).items.map((item) =>
                  it.str(it.valueTV(item)),
                )
              : rest.map((value) => it.str(value))
          return it.string(parts.join(separator))
        }
        case 'format':
          return it.string(javaFormat(it, args))
        default:
          break
      }
      break
    case 'System':
      switch (name) {
        case 'currentTimeMillis':
        case 'nanoTime':
          return long(0n)
        case 'exit':
          return it.exit(a0 === undefined ? 0 : num(a0))
        case 'lineSeparator':
          return it.string('\n')
        case 'arraycopy': {
          const source = requireArg(it, args, 0, key).v
          const sourcePos = num(requireArg(it, args, 1, key))
          const dest = requireArg(it, args, 2, key).v
          const destPos = num(requireArg(it, args, 3, key))
          const length = num(requireArg(it, args, 4, key))
          if (source === null || dest === null)
            it.npe('System.arraycopy was given a null array.')
          if (
            typeof source !== 'object' ||
            source.kind !== 'seq' ||
            typeof dest !== 'object' ||
            dest.kind !== 'seq'
          ) {
            return it.fail('Compile error', 'System.arraycopy needs arrays.')
          }
          if (
            sourcePos < 0 ||
            destPos < 0 ||
            length < 0 ||
            sourcePos + length > source.items.length ||
            destPos + length > dest.items.length
          ) {
            it.fail(
              'ArrayIndexOutOfBoundsException',
              `arraycopy: last source index ${sourcePos + length} out of bounds for length ${source.items.length}`,
            )
          }
          const copy = source.items.slice(sourcePos, sourcePos + length)
          dest.items.splice(destPos, length, ...copy)
          bump(dest)
          return VOID
        }
        case 'getProperty':
        case 'getenv':
          return tv(T.string, null)
        case 'identityHashCode':
          return int(
            Number.parseInt(
              it.hash(requireArg(it, args, 0, key).v as object),
              16,
            ) | 0,
          )
        default:
          break
      }
      break
    case 'Arrays':
      switch (name) {
        case 'sort':
        case 'parallelSort':
          arraysSort(it, args)
          return VOID
        case 'fill': {
          const array = requireArg(it, args, 0, key).v
          if (
            typeof array !== 'object' ||
            array === null ||
            array.kind !== 'seq'
          )
            return it.npe('Arrays.fill was given a null array.')
          const from = args.length === 4 ? num(requireArg(it, args, 1, key)) : 0
          const to =
            args.length === 4
              ? num(requireArg(it, args, 2, key))
              : array.items.length
          const value = args[args.length - 1]
          for (let i = from; i < to; i += 1)
            array.items[i] = it.element(value, array.elemType)
          bump(array)
          return VOID
        }
        case 'asList': {
          const first = args[0]
          if (
            args.length === 1 &&
            first !== undefined &&
            typeof first.v === 'object' &&
            first.v !== null &&
            first.v.kind === 'seq' &&
            first.v.seq === 'carray' &&
            !(first.v.elemType.k === 'int' && first.v.elemType.boxed !== true)
          ) {
            return listOf(
              it,
              first.v.items.map((item) => tv((first.v as CSeq).elemType, item)),
              'ArrayList',
            )
          }
          return listOf(it, args, 'ArrayList')
        }
        case 'toString':
          return it.string(
            sequenceText(it, requireArg(it, args, 0, key), false),
          )
        case 'deepToString':
          return it.string(sequenceText(it, requireArg(it, args, 0, key), true))
        case 'copyOf':
        case 'copyOfRange': {
          const array = requireArg(it, args, 0, key).v
          if (
            typeof array !== 'object' ||
            array === null ||
            array.kind !== 'seq'
          )
            return it.npe('Arrays.copyOf was given a null array.')
          const from = name === 'copyOf' ? 0 : num(requireArg(it, args, 1, key))
          const to =
            name === 'copyOf'
              ? num(requireArg(it, args, 1, key))
              : num(requireArg(it, args, 2, key))
          const items: Value[] = []
          for (let i = from; i < to; i += 1)
            items.push(
              i < array.items.length
                ? (array.items[i] ?? null)
                : it.zeroValue(array.elemType),
            )
          return tv(
            { k: 'carray', elem: array.elemType, size: null },
            it.javaArray(array.elemType, items),
          )
        }
        case 'equals': {
          const a = requireArg(it, args, 0, key).v
          const b = requireArg(it, args, 1, key).v
          if (a === null || b === null) return bool(a === b)
          if (
            typeof a !== 'object' ||
            typeof b !== 'object' ||
            a.kind !== 'seq' ||
            b.kind !== 'seq'
          )
            return bool(false)
          return bool(
            a.items.length === b.items.length &&
              a.items.every((item, index) =>
                it.equalsValue(item, b.items[index] ?? null),
              ),
          )
        }
        case 'binarySearch': {
          const array = requireArg(it, args, 0, key).v
          if (
            typeof array !== 'object' ||
            array === null ||
            array.kind !== 'seq'
          )
            return it.npe('Arrays.binarySearch was given a null array.')
          const target = requireArg(it, args, 1, key)
          let lo = 0
          let hi = array.items.length - 1
          while (lo <= hi) {
            const mid = (lo + hi) >>> 1
            const order = it.compareValues(array.items[mid] ?? null, target.v)
            if (order < 0) lo = mid + 1
            else if (order > 0) hi = mid - 1
            else return int(mid)
          }
          return int(-(lo + 1))
        }
        case 'stream': {
          const array = requireArg(it, args, 0, key).v
          if (
            typeof array !== 'object' ||
            array === null ||
            array.kind !== 'seq'
          )
            return it.npe('Arrays.stream was given a null array.')
          return tv(
            { k: 'jclass', name: 'Stream' },
            streamOf([...array.items], array.elemType),
          )
        }
        case 'hashCode':
          return int(
            javaHash(it, {
              ...(requireArg(it, args, 0, key).v as CSeq),
              seq: 'vector',
            }),
          )
        default:
          break
      }
      break
    case 'Collections':
      switch (name) {
        case 'sort': {
          const list = requireArg(it, args, 0, key).v
          if (typeof list !== 'object' || list === null || list.kind !== 'seq')
            return it.npe('Collections.sort was given a null list.')
          list.items.sort(it.comparatorFor(a1?.v ?? null))
          bump(list)
          return VOID
        }
        case 'reverse': {
          const list = requireArg(it, args, 0, key).v
          if (typeof list !== 'object' || list === null || list.kind !== 'seq')
            return it.npe('Collections.reverse was given a null list.')
          list.items.reverse()
          bump(list)
          return VOID
        }
        case 'swap': {
          const list = requireArg(it, args, 0, key).v
          if (typeof list !== 'object' || list === null || list.kind !== 'seq')
            return it.npe('Collections.swap was given a null list.')
          const i = num(requireArg(it, args, 1, key))
          const j = num(requireArg(it, args, 2, key))
          listIndex(it, list, i)
          listIndex(it, list, j)
          ;[list.items[i], list.items[j]] = [
            list.items[j] ?? null,
            list.items[i] ?? null,
          ]
          bump(list)
          return VOID
        }
        case 'max':
        case 'min': {
          const { items, type } = elemsOf(it, requireArg(it, args, 0, key).v)
          if (items.length === 0)
            it.fail(
              'NoSuchElementException',
              `Collections.${name} was given an empty collection.`,
            )
          const order = it.comparatorFor(a1?.v ?? null)
          let best = items[0] ?? null
          for (const item of items.slice(1)) {
            const diff = order(item, best)
            if (name === 'max' ? diff > 0 : diff < 0) best = item
          }
          return tv(type, best)
        }
        case 'frequency': {
          const { items } = elemsOf(it, requireArg(it, args, 0, key).v)
          return int(
            items.filter((item) => it.equalsValue(item, a1?.v ?? null)).length,
          )
        }
        case 'reverseOrder': {
          const base = a0 === undefined ? null : a0.v
          const order = it.comparatorFor(base)
          return tv(
            T.function,
            comparatorObject(it, (a, b) => order(b, a)),
          )
        }
        case 'nCopies':
          return listOf(
            it,
            Array.from({ length: num(requireArg(it, args, 0, key)) }, () =>
              requireArg(it, args, 1, key),
            ),
            'ArrayList',
          )
        case 'emptyList':
          return listOf(it, [], 'ArrayList')
        case 'addAll': {
          const list = requireArg(it, args, 0, key)
          for (const value of args.slice(1))
            callJavaMethod(
              it,
              it.tempRef(list),
              list.v,
              'add',
              [{ k: 'preval', line: 0, ref: it.tempRef(value) }],
              call,
            )
          return bool(true)
        }
        case 'fill': {
          const list = requireArg(it, args, 0, key).v
          if (
            typeof list === 'object' &&
            list !== null &&
            list.kind === 'seq'
          ) {
            list.items = list.items.map(() =>
              it.element(requireArg(it, args, 1, key), list.elemType),
            )
            bump(list)
          }
          return VOID
        }
        case 'unmodifiableList':
        case 'unmodifiableSet':
        case 'unmodifiableMap':
        case 'synchronizedList':
          return requireArg(it, args, 0, key)
        case 'shuffle':
          it.note(
            'Collections.shuffle is skipped so runs repeat; the list keeps its order.',
          )
          return VOID
        default:
          break
      }
      break
    case 'Objects':
      switch (name) {
        case 'equals':
          return bool(it.equalsValue(a0?.v ?? null, a1?.v ?? null))
        case 'hash':
          return int(
            args.reduce(
              (h, value) =>
                (Math.imul(31, h) + javaHash(it, value.v, value.t)) | 0,
              1,
            ),
          )
        case 'hashCode':
          return int(
            a0 === undefined || a0.v === null ? 0 : javaHash(it, a0.v, a0.t),
          )
        case 'isNull':
          return bool(a0?.v === null)
        case 'nonNull':
          return bool(a0 !== undefined && a0.v !== null)
        case 'requireNonNull':
          if (a0 === undefined || a0.v === null)
            it.npe(
              a1 === undefined ? 'A required value was null.' : text(it, a1),
            )
          return a0
        case 'toString':
          return it.string(a0 === undefined ? 'null' : it.str(a0))
        default:
          break
      }
      break
    case 'List':
      if (name === 'of' || name === 'copyOf') {
        const first = args[0]
        if (name === 'copyOf' && first !== undefined)
          return listOf(
            it,
            elemsOf(it, first.v).items.map((item) => it.valueTV(item)),
          )
        return listOf(it, args)
      }
      break
    case 'Set':
      if (name === 'of') {
        const type: CType = {
          k: 'set',
          elem: args[0]?.t ?? T.auto,
          ordered: false,
          multi: false,
          cmp: null,
        }
        const set = newContainer(it, type, 'HashSet') as CSet
        for (const value of args) setAdd(it, set, value.v)
        return tv(type, set)
      }
      break
    case 'Map':
      if (name === 'of') {
        const type: CType = {
          k: 'map',
          key: args[0]?.t ?? T.auto,
          value: args[1]?.t ?? T.auto,
          ordered: false,
          multi: false,
          cmp: null,
        }
        const map = newContainer(it, type, 'HashMap') as CMap
        for (let i = 0; i + 1 < args.length; i += 2)
          mapPut(it, map, args[i], args[i + 1])
        return tv(type, map)
      }
      if (name === 'entry') {
        const type: CType & { k: 'pair' } = {
          k: 'pair',
          first: args[0]?.t ?? T.auto,
          second: args[1]?.t ?? T.auto,
        }
        return tv(
          type,
          entry(
            it,
            type,
            requireArg(it, args, 0, key),
            requireArg(it, args, 1, key),
          ),
        )
      }
      break
    case 'Comparator':
      switch (name) {
        case 'naturalOrder':
          return tv(
            T.function,
            comparatorObject(it, (a, b) => it.compareValues(a, b)),
          )
        case 'reverseOrder':
          return tv(
            T.function,
            comparatorObject(it, (a, b) => it.compareValues(b, a)),
          )
        case 'comparingInt':
        case 'comparingLong':
        case 'comparingDouble':
        case 'comparing': {
          const byKey = keyComparator(it, requireArg(it, args, 0, key).v, true)
          const then = a1 === undefined ? null : it.comparatorFor(a1.v)
          if (then === null) return tv(T.function, comparatorObject(it, byKey))
          const extractor = requireArg(it, args, 0, key).v
          return tv(
            T.function,
            comparatorObject(it, (a, b) => {
              const ka = it.quietly(() =>
                it.callValue(extractor, [it.valueTV(a)]),
              )
              const kb = it.quietly(() =>
                it.callValue(extractor, [it.valueTV(b)]),
              )
              return then(ka.v, kb.v)
            }),
          )
        }
        default:
          break
      }
      break
    case 'IntStream':
    case 'LongStream':
      if (name === 'range' || name === 'rangeClosed') {
        const from = num(requireArg(it, args, 0, key))
        const to =
          num(requireArg(it, args, 1, key)) + (name === 'rangeClosed' ? 1 : 0)
        const items: Value[] = []
        for (let i = from; i < to; i += 1)
          items.push(scope === 'LongStream' ? BigInt(i) : i)
        return tv(
          { k: 'jclass', name: 'Stream' },
          streamOf(items, scope === 'LongStream' ? T.ll : T.int),
        )
      }
      if (name === 'of')
        return tv(
          { k: 'jclass', name: 'Stream' },
          streamOf(
            args.map((value) => value.v),
            T.int,
          ),
        )
      break
    case 'Collectors':
      switch (name) {
        case 'toList':
        case 'toCollection':
          return tv(
            T.auto,
            collector((items, type) =>
              listOf(
                it,
                items.map((item) => tv(type, item)),
                'ArrayList',
              ),
            ),
          )
        case 'toSet':
          return tv(
            T.auto,
            collector((items, type) => {
              const setType: CType = {
                k: 'set',
                elem: type,
                ordered: false,
                multi: false,
                cmp: null,
              }
              const set = newContainer(it, setType, 'HashSet') as CSet
              for (const item of items) setAdd(it, set, item)
              return tv(setType, set)
            }),
          )
        case 'joining': {
          const separator = a0 === undefined ? '' : text(it, a0)
          return tv(
            T.auto,
            collector((items, type) =>
              it.string(
                items.map((item) => it.str(tv(type, item))).join(separator),
              ),
            ),
          )
        }
        default:
          break
      }
      break
    case 'Thread':
      if (name === 'sleep') return VOID
      break
    default:
      break
  }
  return it.fail(
    'Not supported by the visualizer',
    `${key}() is not supported by the visualizer yet.`,
  )
}

function exactWrap(a: TV, b: TV, bits: number): TV {
  const result = BigInt.asIntN(bits, big(a) + big(b))
  return bits >= 64 ? long(result) : int(Number(result))
}

// Method references on these names call the method on the first argument
// (String::length, Integer::intValue) rather than a static method.
const instanceOnly = new Set([
  'intValue',
  'longValue',
  'doubleValue',
  'charValue',
  'booleanValue',
  'length',
  'isEmpty',
  'isBlank',
  'toUpperCase',
  'toLowerCase',
  'trim',
  'strip',
  'charAt',
  'toCharArray',
  'chars',
  'compareTo',
  'compareToIgnoreCase',
  'equals',
  'equalsIgnoreCase',
  'concat',
  'getKey',
  'getValue',
  'size',
])

// Integer::compare, Math::max, String::length, ArrayList::new, this::helper
export function methodReference(
  it: JavaInterpreter,
  expr: Expr & { k: 'methodref' },
): TV {
  const { target, name } = expr
  const scope = it.current.scope
  const self = it.current.self
  const call = (args: TV[]): TV => {
    const fakeCall: Call = {
      k: 'call',
      line: expr.line,
      callee: { k: 'ident', line: expr.line, name },
      args: [],
    }
    const prevals = args.map((arg): Expr => ({
      k: 'preval',
      line: expr.line,
      ref: it.tempRef(arg),
    }))
    if (name === 'new') {
      return constructJava(it, namedCollection(target), [], expr.line)
    }
    if (target === 'this' && self !== null) {
      const method = self.def.methods
        .get(name)
        ?.find((fn) => fn.params.length === args.length)
      if (method !== undefined)
        return it.invoke(method, args, self, null, `${self.def.name}.${name}`)
    }
    const userStatic = it.program.functions
      .get(name)
      ?.find((fn) => fn.params.length === args.length)
    if (
      userStatic !== undefined &&
      (it.program.structs.has(target) || target === 'this')
    ) {
      return it.invoke(userStatic, args, null, null, `${target}.${name}`)
    }
    const staticClass = [
      'Math',
      'Integer',
      'Long',
      'Double',
      'Character',
      'String',
      'Boolean',
      'Objects',
      'Arrays',
      'Collections',
    ].includes(target)
    if (staticClass && !instanceOnly.has(name)) {
      const result = callJavaStatic(it, target, name, prevals, {
        ...fakeCall,
        args: prevals,
      })
      return 'ref' in result ? tv(result.ref.type, result.ref.get()) : result
    }
    // Instance method of the first argument: String::length, Integer::intValue
    const [receiver, ...rest] = args
    if (receiver === undefined)
      it.fail('Compile error', `${target}::${name} needs an argument.`)
    const restPrevals = rest.map((arg): Expr => ({
      k: 'preval',
      line: expr.line,
      ref: it.tempRef(arg),
    }))
    const result = callJavaMethod(
      it,
      it.tempRef(receiver),
      receiver.v,
      name,
      restPrevals,
      fakeCall,
    )
    return 'ref' in result ? tv(result.ref.type, result.ref.get()) : result
  }
  void scope
  return tv(
    T.function,
    jobject(
      target === 'this' ? 'MethodRef' : 'KeyExtractor',
      {},
      () => `${target}::${name}`,
      call,
    ),
  )
}

function namedCollection(name: string): CType {
  switch (name) {
    case 'ArrayList':
    case 'LinkedList':
      return { k: 'vector', elem: T.auto }
    case 'HashSet':
    case 'TreeSet':
      return {
        k: 'set',
        elem: T.auto,
        ordered: name === 'TreeSet',
        multi: false,
        cmp: null,
      }
    case 'HashMap':
    case 'TreeMap':
      return {
        k: 'map',
        key: T.auto,
        value: T.auto,
        ordered: name === 'TreeMap',
        multi: false,
        cmp: null,
      }
    case 'StringBuilder':
      return { k: 'jclass', name: 'StringBuilder' }
    default:
      return { k: 'vector', elem: T.auto }
  }
}
