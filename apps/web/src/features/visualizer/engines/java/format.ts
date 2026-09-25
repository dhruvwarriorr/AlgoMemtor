// Java text formatting: Double.toString, type names shown in the trace.

import type { RecorderDialect } from '../cpp/snapshot'
import type { CType } from '../cpp/types'
import type { Value } from '../cpp/values'

// Double.toString: shortest digits that round-trip, "1.0E10" beyond the
// plain range [1e-3, 1e7).
export function javaDouble(x: number): string {
  if (Number.isNaN(x)) return 'NaN'
  if (x === Infinity) return 'Infinity'
  if (x === -Infinity) return '-Infinity'
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0'
  const magnitude = Math.abs(x)
  if (magnitude >= 1e-3 && magnitude < 1e7) {
    const text = String(x)
    return text.includes('.') || text.includes('e')
      ? plainFromJs(text)
      : `${text}.0`
  }
  const [mantissa = '0', exponent = '0'] = x.toExponential().split('e')
  const digits = mantissa.includes('.') ? mantissa : `${mantissa}.0`
  return `${digits}E${Number(exponent)}`
}

// Float.toString: the shortest decimal that rounds to the same float.
export function javaFloat(x: number): string {
  if (!Number.isFinite(x) || x === 0) return javaDouble(x)
  for (let precision = 1; precision <= 9; precision += 1) {
    const candidate = Number(x.toPrecision(precision))
    if (Math.fround(candidate) === x) return javaDouble(candidate)
  }
  return javaDouble(x)
}

function plainFromJs(text: string): string {
  // JS never uses exponent notation inside [1e-3, 1e7), but be safe.
  if (!text.includes('e')) return text
  return Number(text).toFixed(20).replace(/0+$/, '').replace(/\.$/, '.0')
}

const boxedNames: Record<string, string> = {
  int: 'Integer',
  long: 'Long',
  short: 'Short',
  byte: 'Byte',
  char: 'Character',
  boolean: 'Boolean',
  double: 'Double',
  float: 'Float',
}

export function javaTypeName(type: CType, value?: Value): string {
  const jclass =
    typeof value === 'object' && value !== null && 'jclass' in value
      ? (value as { jclass?: string }).jclass
      : undefined
  switch (type.k) {
    case 'int': {
      const base =
        type.char === true
          ? 'char'
          : type.bits === 8
            ? 'byte'
            : type.bits === 16
              ? 'short'
              : type.bits === 32
                ? 'int'
                : 'long'
      return type.boxed === true ? (boxedNames[base] ?? base) : base
    }
    case 'bool':
      return type.boxed === true ? 'Boolean' : 'boolean'
    case 'float':
      return type.boxed === true
        ? type.name === 'float'
          ? 'Float'
          : 'Double'
        : type.name === 'float'
          ? 'float'
          : 'double'
    case 'string':
      return jclass ?? 'String'
    case 'carray':
      return `${javaTypeName(type.elem)}[]`
    case 'vector':
      return `${jclass ?? 'ArrayList'}<${boxed(type.elem)}>`
    case 'deque':
    case 'list':
      return `${jclass ?? 'ArrayDeque'}<${boxed(type.elem)}>`
    case 'stack':
      return `Stack<${boxed(type.elem)}>`
    case 'queue':
      return `${jclass ?? 'LinkedList'}<${boxed(type.elem)}>`
    case 'pq':
      return `PriorityQueue<${boxed(type.elem)}>`
    case 'map':
      return `${jclass ?? (type.ordered ? 'TreeMap' : 'HashMap')}<${boxed(type.key)}, ${boxed(type.value)}>`
    case 'set':
      return `${jclass ?? (type.ordered ? 'TreeSet' : 'HashSet')}<${boxed(type.elem)}>`
    case 'pair':
      return `Map.Entry<${boxed(type.first)}, ${boxed(type.second)}>`
    case 'struct':
      return type.name.replace(/\$\d+$/, '')
    case 'jclass':
      return type.name
    case 'function':
      return 'lambda'
    case 'auto':
      return 'Object'
    case 'void':
      return 'void'
    default:
      return type.k
  }
}

function boxed(type: CType): string {
  if (type.k === 'int' || type.k === 'bool' || type.k === 'float') {
    return javaTypeName({ ...type, boxed: true })
  }
  return javaTypeName(type)
}

export const javaDialect: RecorderDialect = {
  nullText: 'null',
  typeName: javaTypeName,
  floatText: javaDouble,
  wideChars: true,
}
