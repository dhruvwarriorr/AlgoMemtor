// Turns runtime values into interned TraceValues. Identical values share an
// id; flat containers are cached by version so unchanged data is not walked
// again. Heap objects get a stable object id so the UI can draw aliasing,
// linked lists and trees; an object met again inside the same value (a cycle
// or a shared node) becomes a `ref`.

import type { SequenceShape, TraceValue } from '../../trace'
import { formatFloat } from './format'
import { typeName, type CType } from './types'
import type { CSeq, Value } from './values'

const MAX_DEPTH = 4
// Linked structures (trees, lists) nest far deeper than containers do; they
// are bounded by a node budget per value instead.
const MAX_RECORD_DEPTH = 160
const RECORD_BUDGET = 240
const MAX_ITEMS = 256
const SMALL_SEQUENCE = 64
const MAX_ENTRIES = 128
const MAX_TEXT = 400

type Cached = { ver: number; id: number; touched?: number }

export type RecorderDialect = {
  nullText: string
  typeName: (type: CType, value?: Value) => string
  floatText: (value: number) => string
  // Characters are 8-bit in C++ and 16-bit in Java.
  wideChars: boolean
}

export const cppDialect: RecorderDialect = {
  nullText: 'nullptr',
  typeName: (type) => typeName(type),
  floatText: cppFloatText,
  wideChars: false,
}

export class Recorder {
  readonly values: TraceValue[] = []
  private readonly ids = new Map<string, number>()
  private readonly cache = new WeakMap<object, Cached>()
  private readonly objectIds = new WeakMap<object, number>()
  private nextObjectId = 1
  // Objects being serialized right now, for cycle detection.
  private readonly active = new Set<object>()
  private recordsLeft = RECORD_BUDGET

  private readonly heapOrder: (items: Value[], value: Value) => Value[]
  readonly dialect: RecorderDialect

  constructor(
    heapOrder: (items: Value[], value: Value) => Value[],
    dialect: RecorderDialect = cppDialect,
  ) {
    this.heapOrder = heapOrder
    this.dialect = dialect
  }

  private intern(key: string, value: TraceValue): number {
    const existing = this.ids.get(key)
    if (existing !== undefined) return existing
    const id = this.values.length
    this.values.push(value)
    this.ids.set(key, id)
    return id
  }

  objectId(object: object): number {
    const existing = this.objectIds.get(object)
    if (existing !== undefined) return existing
    const id = this.nextObjectId
    this.nextObjectId += 1
    this.objectIds.set(object, id)
    return id
  }

  unset(): number {
    return this.intern('u', { kind: 'unset' })
  }

  opaque(type: string, text: string): number {
    return this.intern(`o${type}|${text}`, { kind: 'opaque', type, text })
  }

  // Entry point for one variable: resets the per-value node budget.
  root(value: Value, type: CType): number {
    this.recordsLeft = RECORD_BUDGET
    this.active.clear()
    return this.id(value, type, 0, 0)
  }

  id(value: Value, type: CType, depth = 0, recordDepth = 0): number {
    if (typeof value === 'boolean') {
      return this.intern(value ? 'b1' : 'b0', { kind: 'bool', value })
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      if (type.k === 'bool') {
        const truth = value !== 0 && value !== 0n
        return this.intern(truth ? 'b1' : 'b0', { kind: 'bool', value: truth })
      }
      if (type.k === 'int' && type.char === true) {
        const code = Number(value)
        return this.intern(`c${code}`, {
          kind: 'char',
          text: charText(code, this.dialect.wideChars),
          code,
        })
      }
      if (type.k === 'float') {
        const text = this.dialect.floatText(Number(value))
        return this.intern(`f${text}`, { kind: 'number', text })
      }
      const text = String(value)
      return this.intern(`n${text}`, { kind: 'number', text })
    }
    if (value === null) {
      const text = this.dialect.nullText
      return this.intern(`null${text}`, { kind: 'none', text })
    }
    if (value.kind !== 'struct' && depth > MAX_DEPTH) {
      return this.opaque(value.kind, '…')
    }
    switch (value.kind) {
      case 'str': {
        const cached = this.cache.get(value)
        if (cached !== undefined && cached.ver === value.ver) return cached.id
        const text =
          value.s.length > MAX_TEXT ? `${value.s.slice(0, MAX_TEXT)}…` : value.s
        const id = this.intern(`s${value.s.length}|${text}`, {
          kind: 'string',
          text,
          length: value.s.length,
        })
        this.cache.set(value, { ver: value.ver, id })
        return id
      }
      case 'seq':
        return this.sequence(value, depth, recordDepth)
      case 'tuple': {
        const fields: [string, number][] = value.items.map((item, index) => [
          value.pair ? (index === 0 ? 'first' : 'second') : String(index),
          this.id(
            item,
            value.types[index] ?? { k: 'auto' },
            depth + 1,
            recordDepth,
          ),
        ])
        const type = value.pair ? 'pair' : 'tuple'
        return this.intern(`r${type}|${fields.map((f) => f[1]).join(',')}`, {
          kind: 'record',
          type,
          fields,
        })
      }
      case 'struct': {
        const objectId = this.objectId(value)
        const typeLabel = value.def.name
        if (this.active.has(value)) {
          return this.intern(`R${objectId}`, {
            kind: 'ref',
            type: typeLabel,
            objectId,
          })
        }
        if (this.recordsLeft <= 0 || recordDepth > MAX_RECORD_DEPTH) {
          return this.opaque(typeLabel, '…')
        }
        this.recordsLeft -= 1
        this.active.add(value)
        const fields: [string, number][] = []
        for (const [name, field] of value.fields) {
          fields.push([
            name,
            this.id(
              field,
              value.fieldTypes.get(name) ?? { k: 'auto' },
              0,
              recordDepth + 1,
            ),
          ])
        }
        this.active.delete(value)
        return this.intern(
          `r${typeLabel}#${objectId}|${fields.map((f) => `${f[0]}=${f[1]}`).join(',')}`,
          { kind: 'record', type: typeLabel, fields, objectId },
        )
      }
      case 'map': {
        const entries: [number, number][] = value.entries
          .slice(0, MAX_ENTRIES)
          .map((entry) => [
            this.id(
              entry.items[0] ?? null,
              value.type.key,
              depth + 1,
              recordDepth,
            ),
            this.id(
              entry.items[1] ?? null,
              value.type.value,
              depth + 1,
              recordDepth,
            ),
          ])
        const type = this.dialect.typeName(value.type, value)
        const objectId = this.objectId(value)
        return this.intern(
          `m${type}#${objectId}|${value.entries.length}|${entries.map((e) => `${e[0]}:${e[1]}`).join(',')}`,
          {
            kind: 'mapping',
            type,
            entries,
            length: value.entries.length,
            objectId,
          },
        )
      }
      case 'set':
        return this.flatSequence(
          value,
          value.items,
          value.type.elem,
          'set',
          this.dialect.typeName(value.type, value),
          depth,
          recordDepth,
        )
      case 'heap': {
        const ordered = this.heapOrder(value.items, value)
        return this.flatSequence(
          value,
          ordered,
          value.elemType,
          'heap',
          this.dialect.typeName(
            { k: 'pq', elem: value.elemType, cmp: null },
            value,
          ),
          depth,
          recordDepth,
        )
      }
      case 'bitset': {
        const text = [...value.bits]
          .reverse()
          .map((bit) => (bit ? '1' : '0'))
          .join('')
        return this.opaque(`bitset<${value.bits.length}>`, text)
      }
      case 'func':
        return this.opaque(
          'function',
          value.name === 'lambda' ? 'lambda' : `${value.name}()`,
        )
      case 'builtin':
        return this.opaque('function', `${value.name}()`)
      case 'functor':
        return this.opaque('comparator', `${value.name}<>`)
      case 'iter': {
        const length =
          value.target.kind === 'str'
            ? value.target.s.length
            : value.target.kind === 'map'
              ? value.target.entries.length
              : value.target.items.length
        const position = value.reverse ? length - 1 - value.index : value.index
        const text =
          value.index >= length || value.index < 0
            ? value.reverse
              ? 'rend()'
              : 'end()'
            : `→ index ${position}`
        return this.opaque('iterator', text)
      }
      case 'stream':
        return this.opaque('stream', value.name)
      case 'ptr':
        return this.opaque('pointer', '&')
      case 'manip':
        return this.opaque('manipulator', value.name)
      case 'jobj':
        return this.opaque(value.cls, value.describe())
      default:
        return this.opaque('value', '…')
    }
  }

  private sequence(value: CSeq, depth: number, recordDepth: number): number {
    // Character arrays are C strings.
    if (
      value.seq === 'carray' &&
      value.elemType.k === 'int' &&
      value.elemType.char === true &&
      !this.dialect.wideChars
    ) {
      let text = ''
      for (const item of value.items) {
        if (item === 0 || item === null) break
        text += String.fromCharCode(Number(item) & 0xff)
      }
      return this.intern(`s${text.length}|${text}`, {
        kind: 'string',
        text,
        length: text.length,
      })
    }
    const shape: SequenceShape =
      value.seq === 'stack'
        ? 'stack'
        : value.seq === 'queue'
          ? 'queue'
          : value.seq === 'deque' || value.seq === 'list'
            ? 'deque'
            : 'array'
    const type = this.dialect.typeName(sequenceType(value), value)
    return this.flatSequence(
      value,
      value.items,
      value.elemType,
      shape,
      type,
      depth,
      recordDepth,
      value,
    )
  }

  private flatSequence(
    owner: { ver: number },
    items: readonly Value[],
    elemType: CType,
    shape: SequenceShape,
    type: string,
    depth: number,
    recordDepth: number,
    seq?: CSeq,
  ): number {
    const flat = isFlat(elemType)
    const cached = this.cache.get(owner)
    if (
      flat &&
      cached !== undefined &&
      cached.ver === owner.ver &&
      cached.touched === seq?.touched
    ) {
      return cached.id
    }
    const length = items.length
    let visible = length
    if (length > SMALL_SEQUENCE) {
      const touched = seq?.touched ?? length
      visible = Math.min(length, Math.max(touched, 16), MAX_ITEMS)
    }
    const ids: number[] = []
    for (let i = 0; i < visible; i += 1) {
      const item = items[i]
      if (item === null && seq?.lazyRows !== undefined) {
        ids.push(this.unset())
        continue
      }
      ids.push(this.id(item ?? null, elemType, depth + 1, recordDepth))
    }
    const objectId = this.objectId(owner)
    const id = this.intern(
      `q${shape}|${type}#${objectId}|${length}|${ids.join(',')}`,
      {
        kind: 'sequence',
        type,
        shape,
        items: ids,
        length,
        objectId,
      },
    )
    if (flat) {
      const entry: Cached = { ver: owner.ver, id }
      if (seq !== undefined) entry.touched = seq.touched
      this.cache.set(owner, entry)
    }
    return id
  }
}

function sequenceType(value: CSeq): CType {
  switch (value.seq) {
    case 'carray':
      return { k: 'carray', elem: value.elemType, size: value.items.length }
    case 'stdarray':
      return {
        k: 'stdarray',
        elem: value.elemType,
        size: value.items.length,
      }
    default:
      return { k: value.seq, elem: value.elemType }
  }
}

function isFlat(type: CType) {
  return type.k === 'int' || type.k === 'float' || type.k === 'bool'
}

export function charText(code: number, wide = false): string {
  const c = wide ? code & 0xffff : ((code % 256) + 256) % 256
  if (c === 10) return '\\n'
  if (c === 9) return '\\t'
  if (c === 32) return '␣'
  if (c === 0) return '\\0'
  if (c < 32 || c === 127) return `\\x${c.toString(16).padStart(2, '0')}`
  return String.fromCharCode(c)
}

function cppFloatText(x: number): string {
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return `${x}.0`
  return formatFloat(x, 'general', 12)
}
