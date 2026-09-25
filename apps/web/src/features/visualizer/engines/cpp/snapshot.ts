// Turns runtime values into interned TraceValues. Identical values share an
// id; containers are cached by version so unchanged data is not walked again.

import type { SequenceShape, TraceValue } from '../../trace'
import { formatFloat } from './format'
import { typeName, type CType } from './types'
import type { CSeq, Value } from './values'

const MAX_DEPTH = 4
const MAX_ITEMS = 256
const SMALL_SEQUENCE = 64
const MAX_ENTRIES = 128
const MAX_TEXT = 400

type Cached = { ver: number; id: number; touched?: number }

export class Recorder {
  readonly values: TraceValue[] = []
  private readonly ids = new Map<string, number>()
  private readonly cache = new WeakMap<object, Cached>()

  private readonly heapOrder: (items: Value[], value: Value) => Value[]

  constructor(heapOrder: (items: Value[], value: Value) => Value[]) {
    this.heapOrder = heapOrder
  }

  private intern(key: string, value: TraceValue): number {
    const existing = this.ids.get(key)
    if (existing !== undefined) return existing
    const id = this.values.length
    this.values.push(value)
    this.ids.set(key, id)
    return id
  }

  unset(): number {
    return this.intern('u', { kind: 'unset' })
  }

  opaque(type: string, text: string): number {
    return this.intern(`o${type}|${text}`, { kind: 'opaque', type, text })
  }

  id(value: Value, type: CType, depth = 0): number {
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
          text: charText(code),
          code,
        })
      }
      if (type.k === 'float') {
        const text = floatText(Number(value))
        return this.intern(`f${text}`, { kind: 'number', text })
      }
      const text = String(value)
      return this.intern(`n${text}`, { kind: 'number', text })
    }
    if (value === null)
      return this.intern('null', { kind: 'none', text: 'null' })
    if (depth > MAX_DEPTH) return this.opaque(value.kind, '…')
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
        return this.sequence(value, depth)
      case 'tuple': {
        const fields: [string, number][] = value.items.map((item, index) => [
          value.pair ? (index === 0 ? 'first' : 'second') : String(index),
          this.id(item, value.types[index] ?? { k: 'auto' }, depth + 1),
        ])
        const type = value.pair ? 'pair' : 'tuple'
        return this.intern(`r${type}|${fields.map((f) => f[1]).join(',')}`, {
          kind: 'record',
          type,
          fields,
        })
      }
      case 'struct': {
        const fields: [string, number][] = []
        for (const [name, field] of value.fields) {
          fields.push([
            name,
            this.id(
              field,
              value.fieldTypes.get(name) ?? { k: 'auto' },
              depth + 1,
            ),
          ])
        }
        return this.intern(
          `r${value.def.name}|${fields.map((f) => `${f[0]}=${f[1]}`).join(',')}`,
          { kind: 'record', type: value.def.name, fields },
        )
      }
      case 'map': {
        const entries: [number, number][] = value.entries
          .slice(0, MAX_ENTRIES)
          .map((entry) => [
            this.id(entry.items[0] ?? null, value.type.key, depth + 1),
            this.id(entry.items[1] ?? null, value.type.value, depth + 1),
          ])
        const type = typeName(value.type)
        return this.intern(
          `m${type}|${value.entries.length}|${entries.map((e) => `${e[0]}:${e[1]}`).join(',')}`,
          { kind: 'mapping', type, entries, length: value.entries.length },
        )
      }
      case 'set':
        return this.flatSequence(
          value,
          value.items,
          value.type.elem,
          'set',
          typeName(value.type),
          depth,
        )
      case 'heap': {
        const ordered = this.heapOrder(value.items, value)
        return this.flatSequence(
          value,
          ordered,
          value.elemType,
          'heap',
          `priority_queue<${typeName(value.elemType)}>`,
          depth,
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
      default:
        return this.opaque('value', '…')
    }
  }

  private sequence(value: CSeq, depth: number): number {
    // Character arrays are C strings.
    if (
      value.seq === 'carray' &&
      value.elemType.k === 'int' &&
      value.elemType.char === true
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
          : value.seq === 'deque'
            ? 'deque'
            : 'array'
    const type =
      value.seq === 'carray'
        ? `${typeName(value.elemType)}[${value.items.length}]`
        : `${value.seq === 'stdarray' ? 'array' : value.seq}<${typeName(value.elemType)}>`
    return this.flatSequence(
      value,
      value.items,
      value.elemType,
      shape,
      type,
      depth,
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
      ids.push(this.id(item ?? null, elemType, depth + 1))
    }
    const id = this.intern(`q${shape}|${type}|${length}|${ids.join(',')}`, {
      kind: 'sequence',
      type,
      shape,
      items: ids,
      length,
    })
    if (flat) {
      const entry: Cached = { ver: owner.ver, id }
      if (seq !== undefined) entry.touched = seq.touched
      this.cache.set(owner, entry)
    }
    return id
  }
}

function isFlat(type: CType) {
  return type.k === 'int' || type.k === 'float' || type.k === 'bool'
}

export function charText(code: number): string {
  const c = ((code % 256) + 256) % 256
  if (c === 10) return '\\n'
  if (c === 9) return '\\t'
  if (c === 32) return '␣'
  if (c === 0) return '\\0'
  if (c < 32 || c === 127) return `\\x${c.toString(16).padStart(2, '0')}`
  return String.fromCharCode(c)
}

function floatText(x: number): string {
  if (Number.isInteger(x) && Math.abs(x) < 1e15) return `${x}.0`
  const text = formatFloat(x, 'general', 12)
  return text
}
