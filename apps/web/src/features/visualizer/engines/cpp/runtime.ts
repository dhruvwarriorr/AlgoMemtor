// Small helpers shared by the interpreter and the library.

import type { TV } from './arith'
import type { CType } from './types'
import { keyOf, type CSeq, type Iter, type Value } from './values'

export const tv = (t: CType, v: Value): TV => ({ t, v })

type Failer = {
  fail(title: string, message: string, details?: string[]): never
}

export function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export function cString(seq: CSeq): string {
  let text = ''
  for (const item of seq.items) {
    if (item === 0 || item === null) break
    text += String.fromCharCode(Number(item) & 0xff)
  }
  return text
}

export function asIter(value: Value): Iter | null {
  if (typeof value !== 'object' || value === null) return null
  if (value.kind === 'iter') return value
  if (value.kind === 'seq' && value.seq === 'carray') {
    return { kind: 'iter', target: value, index: 0, reverse: false }
  }
  return null
}

export function targetLength(target: Iter['target']): number {
  if (target.kind === 'str') return target.s.length
  if (target.kind === 'map') return target.entries.length
  return target.items.length
}

// The values in [first, last).
export function rangeValues(interpreter: Failer, first: TV, last: TV): Value[] {
  const a = asIter(first.v)
  const b = asIter(last.v)
  if (a === null || b === null || a.target !== b.target) {
    interpreter.fail(
      'Invalid range',
      'Both ends of a range must be iterators into the same container.',
    )
  }
  const values: Value[] = []
  const length = targetLength(a.target)
  for (let i = a.index; i < b.index; i += 1) {
    const position = a.reverse ? length - 1 - i : i
    values.push(targetGet(a.target, position))
  }
  return values
}

export function targetGet(target: Iter['target'], position: number): Value {
  if (target.kind === 'str') return target.s.charCodeAt(position)
  if (target.kind === 'map') return target.entries[position] ?? null
  return target.items[position] ?? null
}

export function accessKey(value: Value): string {
  if (typeof value === 'number' || typeof value === 'bigint')
    return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object' && value !== null && value.kind === 'str')
    return `"${value.s}"`
  return keyOf(value)
}
