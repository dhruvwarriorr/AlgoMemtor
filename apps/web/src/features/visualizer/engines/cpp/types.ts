// Static C++ types for the supported subset. Integer widths follow a 64-bit
// Linux judge (LP64): int is 32 bits, long and long long are 64 bits.

export type IntBits = 8 | 16 | 32 | 64 | 128

export type CType =
  | { k: 'void' }
  | { k: 'bool' }
  | { k: 'int'; bits: IntBits; unsigned: boolean; char?: boolean }
  | { k: 'float'; name: 'float' | 'double' | 'long double' }
  | { k: 'string' }
  // Character arrays used as C strings keep the carray type.
  | { k: 'vector'; elem: CType }
  | { k: 'stdarray'; elem: CType; size: number }
  | { k: 'carray'; elem: CType; size: number | null }
  | { k: 'deque'; elem: CType }
  | { k: 'list'; elem: CType }
  | { k: 'stack'; elem: CType }
  | { k: 'queue'; elem: CType }
  | { k: 'pq'; elem: CType; cmp: CType | null }
  | { k: 'pair'; first: CType; second: CType }
  | { k: 'tuple'; items: CType[] }
  | {
      k: 'map'
      key: CType
      value: CType
      ordered: boolean
      multi: boolean
      cmp: CType | null
    }
  | {
      k: 'set'
      elem: CType
      ordered: boolean
      multi: boolean
      cmp: CType | null
    }
  | { k: 'struct'; name: string }
  | { k: 'function' }
  | { k: 'functor'; name: 'less' | 'greater' | 'less_equal' | 'greater_equal' }
  | { k: 'iterator' }
  | { k: 'stream' }
  | { k: 'bitset'; size: number }
  // auto, template parameters and decltype: the type of the initializer.
  | { k: 'auto' }
  // Address of a variable, only for scanf("%d", &x).
  | { k: 'ptr' }

export const T = {
  void: { k: 'void' } as CType,
  bool: { k: 'bool' } as CType,
  char: { k: 'int', bits: 8, unsigned: false, char: true } as CType,
  uchar: { k: 'int', bits: 8, unsigned: true, char: true } as CType,
  short: { k: 'int', bits: 16, unsigned: false } as CType,
  int: { k: 'int', bits: 32, unsigned: false } as CType,
  uint: { k: 'int', bits: 32, unsigned: true } as CType,
  ll: { k: 'int', bits: 64, unsigned: false } as CType,
  ull: { k: 'int', bits: 64, unsigned: true } as CType,
  double: { k: 'float', name: 'double' } as CType,
  float: { k: 'float', name: 'float' } as CType,
  longDouble: { k: 'float', name: 'long double' } as CType,
  string: { k: 'string' } as CType,
  auto: { k: 'auto' } as CType,
  function: { k: 'function' } as CType,
  iterator: { k: 'iterator' } as CType,
  stream: { k: 'stream' } as CType,
  ptr: { k: 'ptr' } as CType,
} as const

export const isInt = (t: CType): t is Extract<CType, { k: 'int' }> =>
  t.k === 'int'

export const isArithmetic = (t: CType) =>
  t.k === 'int' || t.k === 'float' || t.k === 'bool'

export const isScalar = (t: CType) => isArithmetic(t) || t.k === 'ptr'

export const isWide = (t: CType) => t.k === 'int' && t.bits >= 64

export function typeName(t: CType): string {
  switch (t.k) {
    case 'void':
    case 'bool':
    case 'string':
    case 'auto':
    case 'function':
    case 'iterator':
      return t.k
    case 'int': {
      if (t.char) return t.unsigned ? 'unsigned char' : 'char'
      const base =
        t.bits === 8
          ? 'char'
          : t.bits === 16
            ? 'short'
            : t.bits === 32
              ? 'int'
              : t.bits === 64
                ? 'long long'
                : '__int128'
      return t.unsigned ? `unsigned ${base}` : base
    }
    case 'float':
      return t.name
    case 'vector':
      return `vector<${typeName(t.elem)}>`
    case 'stdarray':
      return `array<${typeName(t.elem)}, ${t.size}>`
    case 'carray':
      return `${typeName(baseOf(t))}${dims(t)}`
    case 'deque':
    case 'list':
    case 'stack':
    case 'queue':
      return `${t.k}<${typeName(t.elem)}>`
    case 'pq':
      return `priority_queue<${typeName(t.elem)}>`
    case 'pair':
      return `pair<${typeName(t.first)}, ${typeName(t.second)}>`
    case 'tuple':
      return `tuple<${t.items.map(typeName).join(', ')}>`
    case 'map': {
      const name = `${t.ordered ? '' : 'unordered_'}${t.multi ? 'multimap' : 'map'}`
      return `${name}<${typeName(t.key)}, ${typeName(t.value)}>`
    }
    case 'set': {
      const name = `${t.ordered ? '' : 'unordered_'}${t.multi ? 'multiset' : 'set'}`
      return `${name}<${typeName(t.elem)}>`
    }
    case 'struct':
      return t.name
    case 'functor':
      return `${t.name}<>`
    case 'stream':
      return 'stream'
    case 'bitset':
      return `bitset<${t.size}>`
    case 'ptr':
      return 'pointer'
  }
}

function baseOf(t: CType): CType {
  let current = t
  while (current.k === 'carray') current = current.elem
  return current
}

function dims(t: CType): string {
  let text = ''
  let current = t
  while (current.k === 'carray') {
    text += `[${current.size ?? ''}]`
    current = current.elem
  }
  return text
}

// sizeof for memset and `sizeof a / sizeof a[0]`.
export function sizeOf(t: CType): number {
  switch (t.k) {
    case 'bool':
      return 1
    case 'int':
      return t.bits / 8
    case 'float':
      return t.name === 'float' ? 4 : t.name === 'double' ? 8 : 16
    case 'carray':
      return (t.size ?? 0) * sizeOf(t.elem)
    case 'stdarray':
      return t.size * sizeOf(t.elem)
    case 'pair':
      return sizeOf(t.first) + sizeOf(t.second)
    case 'string':
      return 32
    case 'vector':
      return 24
    default:
      return 8
  }
}

export function intRange(t: Extract<CType, { k: 'int' }>): [bigint, bigint] {
  const bits = BigInt(t.bits)
  return t.unsigned
    ? [0n, (1n << bits) - 1n]
    : [-(1n << (bits - 1n)), (1n << (bits - 1n)) - 1n]
}

export function sameType(a: CType, b: CType): boolean {
  return typeName(a) === typeName(b)
}
