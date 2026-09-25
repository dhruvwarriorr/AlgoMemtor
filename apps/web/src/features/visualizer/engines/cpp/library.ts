// The standard library subset: <algorithm>, <cmath>, <cstdio>, <string>,
// container methods and iostream helpers.

import type { Expr } from './ast'
import {
  binaryArith,
  commonType,
  compareArith,
  convertScalar,
  toJsNumber,
  truthy,
  type TV,
} from './arith'
import { formatFloat, formatPrintf, type PrintfArg } from './format'
import type { Interpreter, MethodResult } from './interpreter'
import {
  accessKey,
  asIter,
  cString,
  rangeValues,
  targetLength,
  tv,
} from './runtime'
import { intRange, sizeOf, T, typeName, type CType } from './types'
import {
  bump,
  copyValue,
  keyOf,
  bound,
  valuesEqual,
  type CHeap,
  type CMap,
  type CSeq,
  type CSet,
  type CStr,
  type CTuple,
  type Iter,
  type Ref,
  type Value,
} from './values'

type CallExpr = Expr & { k: 'call' }
type LibraryFunction = (
  it: Interpreter,
  args: Expr[],
  call: CallExpr,
) => MethodResult

const VOID: TV = { t: T.void, v: null }
const NPOS = 18446744073709551615n

const evalAll = (it: Interpreter, args: Expr[]) =>
  args.map((arg) => it.eval(arg))

function arg(it: Interpreter, args: Expr[], index: number, name: string): TV {
  const expr = args[index]
  if (expr === undefined)
    it.fail('Missing argument', `${name} needs more arguments.`)
  return it.eval(expr)
}

function argRef(
  it: Interpreter,
  args: Expr[],
  index: number,
  name: string,
): Ref {
  const expr = args[index]
  if (expr === undefined)
    it.fail('Missing argument', `${name} needs more arguments.`)
  return it.evalRef(expr)
}

const num = (value: TV) => toJsNumber(value.v)
const double = (x: number): TV => tv(T.double, x)
const int = (x: number): TV => tv(T.int, x)
const size = (x: number): TV => tv(T.ull, BigInt(x))
const bool = (x: boolean): TV => tv(T.bool, x)

function iterator(target: Iter['target'], index: number, reverse = false): TV {
  return tv(T.iterator, { kind: 'iter', target, index, reverse })
}

// ---- iterator ranges ----------------------------------------------------------------

type Range = {
  first: Iter
  count: number
  get(k: number): Value
  set(k: number, value: Value): void
  elemType: CType
  done(): void
}

function range(it: Interpreter, firstTV: TV, lastTV: TV): Range {
  const first = asIter(firstTV.v)
  const last = asIter(lastTV.v)
  if (first === null || last === null) {
    it.fail(
      'Invalid range',
      'Expected two iterators, such as v.begin() and v.end().',
    )
  }
  if (first.target !== last.target || first.reverse !== last.reverse) {
    it.fail(
      'Invalid range',
      'Both iterators must point into the same container.',
    )
  }
  const target = first.target
  const length = targetLength(target)
  if (first.index < 0 || last.index > length || first.index > last.index) {
    it.fail(
      'Invalid range',
      `The range [${first.index}, ${last.index}) is outside the container (size ${length}).`,
      [
        'In real C++ this reads or writes outside the container: undefined behaviour.',
      ],
    )
  }
  const position = (k: number) =>
    first.reverse ? length - 1 - (first.index + k) : first.index + k
  let text = target.kind === 'str' ? target.s : ''
  const elemType =
    target.kind === 'seq'
      ? target.elemType
      : target.kind === 'str'
        ? T.char
        : target.kind === 'set'
          ? target.type.elem
          : {
              k: 'pair' as const,
              first: target.type.key,
              second: target.type.value,
            }
  return {
    first,
    count: last.index - first.index,
    elemType,
    get(k) {
      const p = position(k)
      if (target.kind === 'str') return text.charCodeAt(p)
      if (target.kind === 'map') return target.entries[p] ?? null
      return target.items[p] ?? null
    },
    set(k, value) {
      const p = position(k)
      if (target.kind === 'str') {
        text =
          text.slice(0, p) +
          String.fromCharCode(Number(toJsNumber(value)) & 0xff) +
          text.slice(p + 1)
        return
      }
      if (target.kind === 'seq') {
        target.items[p] = value
        return
      }
      it.fail('Read-only range', 'Sets and maps cannot be rearranged.')
    },
    done() {
      if (target.kind === 'str') target.s = text
      bump(target)
    },
  }
}

function rangeResult(r: Range, k: number): TV {
  return iterator(r.first.target, r.first.index + k, r.first.reverse)
}

function comparatorArg(it: Interpreter, args: Expr[], index: number) {
  const expr = args[index]
  return it.comparatorFor(expr === undefined ? null : it.eval(expr).v)
}

function predicate(it: Interpreter, args: Expr[], index: number, name: string) {
  const fn = arg(it, args, index, name).v
  return (value: Value, type: CType) =>
    it.quietly(() => it.truth(it.callValue(fn, [tv(type, value)])))
}

// ---- number helpers -------------------------------------------------------------------

function toBig(value: TV): bigint {
  const v = value.v
  if (typeof v === 'bigint') return v
  if (typeof v === 'number') return BigInt(Math.trunc(v))
  return truthy(v) ? 1n : 0n
}

function fromBig(value: bigint, type: CType): TV {
  if (type.k === 'int' && type.bits >= 64) return tv(type, value)
  return tv(type.k === 'int' ? type : T.int, Number(value))
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) [x, y] = [y, x % y]
  return x
}

function bitLength(x: bigint): number {
  return x <= 0n ? 0 : x.toString(2).length
}

function popcount(x: bigint): number {
  let count = 0
  for (const c of x.toString(2)) if (c === '1') count += 1
  return count
}

function charCode(value: TV): number {
  return ((Number(toJsNumber(value.v)) % 256) + 256) % 256
}

function charClass(test: (c: string) => boolean): LibraryFunction {
  return (it, args) =>
    int(
      test(String.fromCharCode(charCode(arg(it, args, 0, 'isdigit')))) ? 1 : 0,
    )
}

function mathFunction(fn: (...values: number[]) => number): LibraryFunction {
  return (it, args) => double(fn(...evalAll(it, args).map(num)))
}

function minMax(sign: 1 | -1): LibraryFunction {
  const name = sign > 0 ? 'max' : 'min'
  return (it, args, call) => {
    const values = evalAll(it, args)
    let items: TV[]
    let cmp: Value
    const firstValue = values[0]?.v
    if (
      typeof firstValue === 'object' &&
      firstValue !== null &&
      firstValue.kind === 'initlist'
    ) {
      items = firstValue.items
      cmp = values[1]?.v ?? null
    } else {
      items = values.slice(0, 2)
      cmp = values[2]?.v ?? null
    }
    if (items.length === 0) it.fail('Missing argument', `${name} needs values.`)
    const explicit = call.templateArgs?.[0]
    const explicitType =
      explicit !== undefined && !('line' in explicit) ? explicit : null
    const arithmetic = items.every(
      (item) =>
        typeof item.v === 'number' ||
        typeof item.v === 'bigint' ||
        typeof item.v === 'boolean',
    )
    if (arithmetic && cmp === null) {
      const type =
        explicitType ??
        items
          .slice(1)
          .reduce((acc, item) => commonType(acc, item.t), items[0]?.t ?? T.int)
      let best = items[0]
      for (const item of items.slice(1)) {
        if (compareArith(sign > 0 ? '<' : '>', best, item)) best = item
      }
      return tv(type, convertScalar(best.v, best.t, type))
    }
    const order = it.comparatorFor(cmp)
    let best = items[0]
    for (const item of items.slice(1)) {
      if (sign > 0 ? order(best.v, item.v) < 0 : order(item.v, best.v) < 0)
        best = item
    }
    return tv(best.t, copyValue(best.v))
  }
}

function parseInteger(
  it: Interpreter,
  text: string,
  name: string,
  type: CType,
): TV {
  const match = /^\s*([+-]?\d+)/.exec(text)
  if (match === null) {
    it.fail(
      'Invalid number',
      `${name}("${text.slice(0, 20)}") found no digits (std::invalid_argument).`,
    )
  }
  const value = BigInt(match[1] ?? '0')
  if (type.k === 'int') {
    const [lo, hi] = intRange(type)
    if (value < lo || value > hi) {
      it.fail(
        'Number out of range',
        `${name}("${text.slice(0, 24)}") does not fit in ${typeName(type)} (std::out_of_range).`,
      )
    }
  }
  return fromBig(value, type)
}

function memsetValue(type: CType, byte: number): Value {
  const b = byte & 0xff
  if (type.k === 'bool') return b !== 0
  if (type.k === 'int') {
    let value = 0n
    for (let i = 0; i < type.bits / 8; i += 1) value = (value << 8n) | BigInt(b)
    const wrapped = type.unsigned
      ? BigInt.asUintN(type.bits, value)
      : BigInt.asIntN(type.bits, value)
    return type.bits >= 64 ? wrapped : Number(wrapped)
  }
  if (type.k === 'float') {
    const bytes = type.name === 'float' ? 4 : 8
    const view = new DataView(new ArrayBuffer(bytes))
    for (let i = 0; i < bytes; i += 1) view.setUint8(i, b)
    return bytes === 4 ? view.getFloat32(0) : view.getFloat64(0)
  }
  return null
}

function memset(it: Interpreter, args: Expr[]): MethodResult {
  const target = arg(it, args, 0, 'memset')
  const byte = num(arg(it, args, 1, 'memset'))
  const bytes = num(arg(it, args, 2, 'memset'))
  let seq: CSeq | null = null
  let start = 0
  const v = target.v
  if (typeof v === 'object' && v !== null && v.kind === 'seq') seq = v
  else if (
    typeof v === 'object' &&
    v !== null &&
    v.kind === 'iter' &&
    v.target.kind === 'seq'
  ) {
    seq = v.target
    start = v.index
  } else if (typeof v === 'object' && v !== null && v.kind === 'ptr') {
    const pointed = v.ref.get()
    if (
      typeof pointed === 'object' &&
      pointed !== null &&
      pointed.kind === 'seq'
    )
      seq = pointed
  }
  if (seq === null) it.unsupported('memset works on arrays and vectors here.')
  let remaining = Math.floor(bytes)
  const fill = (s: CSeq, from: number) => {
    for (let i = from; i < s.items.length && remaining > 0; i += 1) {
      let item = s.items[i] ?? null
      if (item === null && s.lazyRows !== undefined)
        item = it.materializeRow(s, i)
      if (typeof item === 'object' && item !== null && item.kind === 'seq') {
        fill(item, 0)
        continue
      }
      const width = sizeOf(s.elemType)
      if (remaining < width) {
        remaining = 0
        break
      }
      s.items[i] = memsetValue(s.elemType, byte)
      remaining -= width
    }
    bump(s)
  }
  fill(seq, start)
  return VOID
}

function printfArgs(it: Interpreter, values: TV[]): PrintfArg[] {
  return values.map((value) => {
    const v = value.v
    if (typeof v === 'object' && v !== null) {
      if (v.kind === 'str') return { kind: 'string', value: v.s }
      if (v.kind === 'seq' && v.seq === 'carray')
        return { kind: 'string', value: cString(v) }
      if (v.kind === 'ptr') {
        const pointed = v.ref.get()
        if (
          typeof pointed === 'object' &&
          pointed !== null &&
          pointed.kind === 'str'
        ) {
          return { kind: 'string', value: pointed.s }
        }
      }
      it.fail(
        'Invalid printf argument',
        `printf cannot print a ${typeName(value.t)}.`,
      )
    }
    if (value.t.k === 'float') return { kind: 'float', value: Number(v) }
    if (typeof v === 'boolean') return { kind: 'int', value: v ? 1 : 0 }
    return {
      kind: 'int',
      value: v ?? 0,
      unsigned: value.t.k === 'int' && value.t.unsigned,
    }
  })
}

function scanf(it: Interpreter, args: Expr[]): MethodResult {
  const format = it.stringOf(arg(it, args, 0, 'scanf'))
  const targets = args.slice(1).map((expr) => it.eval(expr))
  let assigned = 0
  let targetIndex = 0
  const input = it.stdin
  for (let i = 0; i < format.length; i += 1) {
    const c = format[i] ?? ''
    if (/\s/.test(c)) {
      it.skipSpaces()
      continue
    }
    if (c !== '%') {
      if (input[it.inPos] === c) it.inPos += 1
      else break
      continue
    }
    const match = /^%(\*)?(\d+)?(hh|h|ll|l|L|z|j)?([dicsfegxuoFEG%])/.exec(
      format.slice(i),
    )
    if (match === null) break
    i += match[0].length - 1
    const conversion = match[4] ?? ''
    if (conversion === '%') {
      it.skipSpaces()
      if (input[it.inPos] === '%') it.inPos += 1
      continue
    }
    if (conversion !== 'c') it.skipSpaces()
    if (it.inPos >= input.length) {
      if (assigned === 0) return int(-1)
      break
    }
    const skip = match[1] === '*'
    const target = skip ? null : targets[targetIndex++]
    const pointed =
      target === undefined || target === null ? null : scanTarget(it, target)
    if (conversion === 'c') {
      const code = input.charCodeAt(it.inPos)
      it.inPos += 1
      pointed?.set(code)
    } else if (conversion === 's') {
      const token = it.readToken()
      if (pointed !== null) {
        const current = pointed.peek()
        if (
          typeof current === 'object' &&
          current !== null &&
          current.kind === 'seq'
        ) {
          if (token.length + 1 > current.items.length) {
            it.fail(
              'Buffer overflow',
              `"${token.slice(0, 20)}" does not fit in a char array of size ${current.items.length}.`,
            )
          }
          for (let k = 0; k < current.items.length; k += 1)
            current.items[k] = k < token.length ? token.charCodeAt(k) : 0
          bump(current)
        } else {
          pointed.set({ kind: 'str', s: token, ver: 0 })
        }
      }
    } else {
      const before = it.inPos
      const failed = it.inFail
      if (pointed !== null) {
        it.readInto(pointed)
      } else {
        it.readToken()
      }
      if (it.inPos === before) {
        it.inFail = failed
        break
      }
    }
    if (!skip) assigned += 1
  }
  return int(assigned)
}

function scanTarget(it: Interpreter, target: TV): Ref {
  const v = target.v
  if (typeof v === 'object' && v !== null) {
    if (v.kind === 'ptr') return v.ref
    if (v.kind === 'seq' && v.seq === 'carray') return it.tempRef(target)
    if (v.kind === 'iter' && v.target.kind === 'seq')
      return it.seqRef(v.target, v.index)
  }
  it.fail(
    'Invalid scanf argument',
    'scanf needs the address of a variable, like &x.',
  )
}

// ---- free functions -------------------------------------------------------------------

const functions: Record<string, LibraryFunction> = {
  max: minMax(1),
  min: minMax(-1),
  swap(it, args) {
    const a = argRef(it, args, 0, 'swap')
    const b = argRef(it, args, 1, 'swap')
    const x = a.get()
    const y = b.get()
    a.set(y)
    b.set(x)
    return VOID
  },
  abs(it, args) {
    const value = arg(it, args, 0, 'abs')
    if (value.t.k === 'float') return tv(value.t, Math.abs(num(value)))
    const type = value.t.k === 'int' && value.t.bits >= 32 ? value.t : T.int
    const big = toBig(value)
    if (big >= 0n) return fromBig(big, type)
    const result = binaryArith(
      '-',
      tv(type, type.k === 'int' && type.bits >= 64 ? 0n : 0),
      value,
    )
    if (result.note !== undefined) it.note(result.note)
    return result.value
  },
  fabs: mathFunction(Math.abs),
  sqrt: mathFunction(Math.sqrt),
  sqrtl: mathFunction(Math.sqrt),
  cbrt: mathFunction(Math.cbrt),
  pow: mathFunction((a, b) => Math.pow(a, b)),
  powl: mathFunction((a, b) => Math.pow(a, b)),
  exp: mathFunction(Math.exp),
  log: mathFunction(Math.log),
  log2: mathFunction(Math.log2),
  log10: mathFunction(Math.log10),
  log1p: mathFunction(Math.log1p),
  sin: mathFunction(Math.sin),
  cos: mathFunction(Math.cos),
  tan: mathFunction(Math.tan),
  asin: mathFunction(Math.asin),
  acos: mathFunction(Math.acos),
  atan: mathFunction(Math.atan),
  atan2: mathFunction(Math.atan2),
  hypot: mathFunction(Math.hypot),
  floor: mathFunction(Math.floor),
  floorl: mathFunction(Math.floor),
  ceil: mathFunction(Math.ceil),
  ceill: mathFunction(Math.ceil),
  round: mathFunction((x) => (x < 0 ? -Math.round(-x) : Math.round(x))),
  trunc: mathFunction(Math.trunc),
  fmod: mathFunction((a, b) => a % b),
  fmin: mathFunction(Math.min),
  fmax: mathFunction(Math.max),
  llround(it, args) {
    const x = num(arg(it, args, 0, 'llround'))
    return tv(T.ll, BigInt(x < 0 ? -Math.round(-x) : Math.round(x)))
  },
  gcd(it, args) {
    const a = arg(it, args, 0, 'gcd')
    const b = arg(it, args, 1, 'gcd')
    return fromBig(gcd(toBig(a), toBig(b)), commonType(a.t, b.t))
  },
  lcm(it, args) {
    const a = arg(it, args, 0, 'lcm')
    const b = arg(it, args, 1, 'lcm')
    const x = toBig(a)
    const y = toBig(b)
    const g = gcd(x, y)
    const type = commonType(a.t, b.t)
    const exact = g === 0n ? 0n : ((x < 0n ? -x : x) / g) * (y < 0n ? -y : y)
    const result = fromBig(exact, type)
    return tv(
      result.t,
      convertScalar(result.v, T.ll, result.t, (message) => it.note(message)),
    )
  },
  __lg(it, args) {
    const value = arg(it, args, 0, '__lg')
    return int(bitLength(toBig(value)) - 1)
  },
  __builtin_popcount(it, args) {
    return int(
      popcount(
        BigInt.asUintN(32, toBig(arg(it, args, 0, '__builtin_popcount'))),
      ),
    )
  },
  __builtin_popcountll(it, args) {
    return int(
      popcount(
        BigInt.asUintN(64, toBig(arg(it, args, 0, '__builtin_popcountll'))),
      ),
    )
  },
  __builtin_clz(it, args) {
    const x = BigInt.asUintN(32, toBig(arg(it, args, 0, '__builtin_clz')))
    if (x === 0n) it.note('__builtin_clz(0) is undefined in C++.')
    return int(32 - bitLength(x))
  },
  __builtin_clzll(it, args) {
    const x = BigInt.asUintN(64, toBig(arg(it, args, 0, '__builtin_clzll')))
    if (x === 0n) it.note('__builtin_clzll(0) is undefined in C++.')
    return int(64 - bitLength(x))
  },
  __builtin_ctz(it, args) {
    const x = BigInt.asUintN(32, toBig(arg(it, args, 0, '__builtin_ctz')))
    if (x === 0n) {
      it.note('__builtin_ctz(0) is undefined in C++.')
      return int(32)
    }
    return int(x.toString(2).length - x.toString(2).lastIndexOf('1') - 1)
  },
  __builtin_ctzll(it, args) {
    const x = BigInt.asUintN(64, toBig(arg(it, args, 0, '__builtin_ctzll')))
    if (x === 0n) {
      it.note('__builtin_ctzll(0) is undefined in C++.')
      return int(64)
    }
    return int(x.toString(2).length - x.toString(2).lastIndexOf('1') - 1)
  },
  __builtin_parity(it, args) {
    return int(
      popcount(
        BigInt.asUintN(32, toBig(arg(it, args, 0, '__builtin_parity'))),
      ) % 2,
    )
  },
  __builtin_parityll(it, args) {
    return int(
      popcount(
        BigInt.asUintN(64, toBig(arg(it, args, 0, '__builtin_parityll'))),
      ) % 2,
    )
  },
  to_string(it, args) {
    const value = arg(it, args, 0, 'to_string')
    const text =
      value.t.k === 'float'
        ? formatFloat(num(value), 'fixed', 6)
        : typeof value.v === 'boolean'
          ? value.v
            ? '1'
            : '0'
          : typeof value.v === 'number' || typeof value.v === 'bigint'
            ? String(value.v)
            : it.fail('Invalid argument', 'to_string needs a number.')
    return tv(T.string, { kind: 'str', s: text, ver: 0 })
  },
  stoi: (it, args) =>
    parseInteger(it, it.stringOf(arg(it, args, 0, 'stoi')), 'stoi', T.int),
  stol: (it, args) =>
    parseInteger(it, it.stringOf(arg(it, args, 0, 'stol')), 'stol', T.ll),
  stoll: (it, args) =>
    parseInteger(it, it.stringOf(arg(it, args, 0, 'stoll')), 'stoll', T.ll),
  stoul: (it, args) =>
    parseInteger(it, it.stringOf(arg(it, args, 0, 'stoul')), 'stoul', T.ull),
  stoull: (it, args) =>
    parseInteger(it, it.stringOf(arg(it, args, 0, 'stoull')), 'stoull', T.ull),
  atoi(it, args) {
    const match = /^\s*([+-]?\d+)/.exec(it.stringOf(arg(it, args, 0, 'atoi')))
    return int(
      match === null ? 0 : Number(BigInt.asIntN(32, BigInt(match[1] ?? '0'))),
    )
  },
  atoll(it, args) {
    const match = /^\s*([+-]?\d+)/.exec(it.stringOf(arg(it, args, 0, 'atoll')))
    return tv(
      T.ll,
      match === null ? 0n : BigInt.asIntN(64, BigInt(match[1] ?? '0')),
    )
  },
  stod(it, args) {
    const text = it.stringOf(arg(it, args, 0, 'stod'))
    const value = Number.parseFloat(text)
    if (Number.isNaN(value))
      it.fail('Invalid number', `stod("${text.slice(0, 20)}") found no number.`)
    return double(value)
  },
  atof: (it, args) =>
    double(Number.parseFloat(it.stringOf(arg(it, args, 0, 'atof'))) || 0),
  isdigit: charClass((c) => /[0-9]/.test(c)),
  isalpha: charClass((c) => /[A-Za-z]/.test(c)),
  isalnum: charClass((c) => /[A-Za-z0-9]/.test(c)),
  isupper: charClass((c) => /[A-Z]/.test(c)),
  islower: charClass((c) => /[a-z]/.test(c)),
  isspace: charClass((c) => /[ \t\n\r\f\v]/.test(c)),
  ispunct: charClass((c) => /[!-/:-@[-`{-~]/.test(c)),
  isxdigit: charClass((c) => /[0-9A-Fa-f]/.test(c)),
  toupper(it, args) {
    const code = charCode(arg(it, args, 0, 'toupper'))
    return int(code >= 97 && code <= 122 ? code - 32 : code)
  },
  tolower(it, args) {
    const code = charCode(arg(it, args, 0, 'tolower'))
    return int(code >= 65 && code <= 90 ? code + 32 : code)
  },
  make_pair(it, args) {
    const [a, b] = [
      arg(it, args, 0, 'make_pair'),
      arg(it, args, 1, 'make_pair'),
    ]
    const first = it.decay(a.t, a.v)
    const second = it.decay(b.t, b.v)
    return tv(
      { k: 'pair', first, second },
      {
        kind: 'tuple',
        pair: true,
        items: [copyValue(a.v), copyValue(b.v)],
        types: [first, second],
        ver: 0,
      },
    )
  },
  make_tuple(it, args) {
    const values = evalAll(it, args)
    const types = values.map((value) => it.decay(value.t, value.v))
    return tv(
      { k: 'tuple', items: types },
      {
        kind: 'tuple',
        pair: false,
        items: values.map((value) => copyValue(value.v)),
        types,
        ver: 0,
      },
    )
  },
  get(it, args, call) {
    const index = call.templateArgs?.[0]
    if (index === undefined || !('line' in index) || index.k !== 'int') {
      return it.unsupported('get<N> needs a constant index.')
    }
    const ref = argRef(it, args, 0, 'get')
    const value = ref.get()
    const n = Number(index.value)
    if (typeof value === 'object' && value !== null) {
      if (value.kind === 'tuple' && n < value.items.length)
        return { ref: it.tupleRef(value, n, ref.origin) }
      if (value.kind === 'seq' && n < value.items.length)
        return { ref: it.seqRef(value, n, ref.origin) }
    }
    return it.fail('Invalid get', `get<${n}> is out of range.`)
  },
  sort(it, args) {
    const r = range(it, arg(it, args, 0, 'sort'), arg(it, args, 1, 'sort'))
    const order = comparatorArg(it, args, 2)
    const values: Value[] = []
    for (let k = 0; k < r.count; k += 1) values.push(r.get(k))
    values.sort(order)
    values.forEach((value, k) => r.set(k, value))
    r.done()
    return VOID
  },
  reverse(it, args) {
    const r = range(
      it,
      arg(it, args, 0, 'reverse'),
      arg(it, args, 1, 'reverse'),
    )
    const values: Value[] = []
    for (let k = 0; k < r.count; k += 1) values.push(r.get(k))
    values.reverse().forEach((value, k) => r.set(k, value))
    r.done()
    return VOID
  },
  fill(it, args) {
    const r = range(it, arg(it, args, 0, 'fill'), arg(it, args, 1, 'fill'))
    const value = arg(it, args, 2, 'fill')
    for (let k = 0; k < r.count; k += 1) r.set(k, it.coerce(value, r.elemType))
    r.done()
    return VOID
  },
  fill_n(it, args) {
    const first = arg(it, args, 0, 'fill_n')
    const count = it.toIndex(arg(it, args, 1, 'fill_n'))
    const start = asIter(first.v)
    if (start === null)
      return it.fail('Invalid range', 'fill_n needs an iterator.')
    const r = range(
      it,
      first,
      iterator(start.target, start.index + count, start.reverse),
    )
    const value = arg(it, args, 2, 'fill_n')
    for (let k = 0; k < r.count; k += 1) r.set(k, it.coerce(value, r.elemType))
    r.done()
    return VOID
  },
  iota(it, args) {
    const r = range(it, arg(it, args, 0, 'iota'), arg(it, args, 1, 'iota'))
    let value = arg(it, args, 2, 'iota')
    for (let k = 0; k < r.count; k += 1) {
      r.set(k, it.coerce(value, r.elemType))
      value = binaryArith('+', value, int(1)).value
    }
    r.done()
    return VOID
  },
  accumulate(it, args) {
    const r = range(
      it,
      arg(it, args, 0, 'accumulate'),
      arg(it, args, 1, 'accumulate'),
    )
    let total = arg(it, args, 2, 'accumulate')
    const type = total.t
    const op = args[3] === undefined ? null : it.eval(args[3]).v
    for (let k = 0; k < r.count; k += 1) {
      const item = tv(r.elemType, r.get(k))
      if (op !== null) {
        total = tv(
          type,
          it.coerce(
            it.quietly(() => it.callValue(op, [total, item])),
            type,
          ),
        )
        continue
      }
      if (
        typeof total.v === 'object' &&
        total.v !== null &&
        total.v.kind === 'str'
      ) {
        total = tv(T.string, {
          kind: 'str',
          s: total.v.s + it.stringOf(item),
          ver: 0,
        })
        continue
      }
      const sum = binaryArith('+', total, item)
      if (sum.note !== undefined) it.note(sum.note)
      total = tv(
        type,
        convertScalar(sum.value.v, sum.value.t, type, (message) =>
          it.note(
            `accumulate: ${message} The sum is kept in the type of the initial value (${typeName(type)}).`,
          ),
        ),
      )
    }
    return total
  },
  count(it, args) {
    const r = range(it, arg(it, args, 0, 'count'), arg(it, args, 1, 'count'))
    const value = arg(it, args, 2, 'count')
    let total = 0
    for (let k = 0; k < r.count; k += 1) {
      if (valuesEqual(r.get(k), it.coerce(value, r.elemType))) total += 1
    }
    return tv(T.ll, BigInt(total))
  },
  count_if(it, args) {
    const r = range(
      it,
      arg(it, args, 0, 'count_if'),
      arg(it, args, 1, 'count_if'),
    )
    const test = predicate(it, args, 2, 'count_if')
    let total = 0
    for (let k = 0; k < r.count; k += 1)
      if (test(r.get(k), r.elemType)) total += 1
    return tv(T.ll, BigInt(total))
  },
  find(it, args) {
    const r = range(it, arg(it, args, 0, 'find'), arg(it, args, 1, 'find'))
    const value = it.coerce(arg(it, args, 2, 'find'), r.elemType)
    for (let k = 0; k < r.count; k += 1)
      if (valuesEqual(r.get(k), value)) return rangeResult(r, k)
    return rangeResult(r, r.count)
  },
  find_if(it, args) {
    const r = range(
      it,
      arg(it, args, 0, 'find_if'),
      arg(it, args, 1, 'find_if'),
    )
    const test = predicate(it, args, 2, 'find_if')
    for (let k = 0; k < r.count; k += 1)
      if (test(r.get(k), r.elemType)) return rangeResult(r, k)
    return rangeResult(r, r.count)
  },
  all_of(it, args) {
    const r = range(it, arg(it, args, 0, 'all_of'), arg(it, args, 1, 'all_of'))
    const test = predicate(it, args, 2, 'all_of')
    for (let k = 0; k < r.count; k += 1)
      if (!test(r.get(k), r.elemType)) return bool(false)
    return bool(true)
  },
  any_of(it, args) {
    const r = range(it, arg(it, args, 0, 'any_of'), arg(it, args, 1, 'any_of'))
    const test = predicate(it, args, 2, 'any_of')
    for (let k = 0; k < r.count; k += 1)
      if (test(r.get(k), r.elemType)) return bool(true)
    return bool(false)
  },
  none_of(it, args) {
    const r = range(
      it,
      arg(it, args, 0, 'none_of'),
      arg(it, args, 1, 'none_of'),
    )
    const test = predicate(it, args, 2, 'none_of')
    for (let k = 0; k < r.count; k += 1)
      if (test(r.get(k), r.elemType)) return bool(false)
    return bool(true)
  },
  min_element(it, args) {
    const r = range(
      it,
      arg(it, args, 0, 'min_element'),
      arg(it, args, 1, 'min_element'),
    )
    const order = comparatorArg(it, args, 2)
    let best = 0
    for (let k = 1; k < r.count; k += 1)
      if (order(r.get(k), r.get(best)) < 0) best = k
    return rangeResult(r, r.count === 0 ? 0 : best)
  },
  max_element(it, args) {
    const r = range(
      it,
      arg(it, args, 0, 'max_element'),
      arg(it, args, 1, 'max_element'),
    )
    const order = comparatorArg(it, args, 2)
    let best = 0
    for (let k = 1; k < r.count; k += 1)
      if (order(r.get(best), r.get(k)) < 0) best = k
    return rangeResult(r, r.count === 0 ? 0 : best)
  },
  lower_bound(it, args) {
    const r = range(
      it,
      arg(it, args, 0, 'lower_bound'),
      arg(it, args, 1, 'lower_bound'),
    )
    const value = it.coerce(arg(it, args, 2, 'lower_bound'), r.elemType)
    const order = comparatorArg(it, args, 3)
    const values: Value[] = []
    for (let k = 0; k < r.count; k += 1) values.push(r.get(k))
    return rangeResult(r, bound(values, value, order, false))
  },
  upper_bound(it, args) {
    const r = range(
      it,
      arg(it, args, 0, 'upper_bound'),
      arg(it, args, 1, 'upper_bound'),
    )
    const value = it.coerce(arg(it, args, 2, 'upper_bound'), r.elemType)
    const order = comparatorArg(it, args, 3)
    const values: Value[] = []
    for (let k = 0; k < r.count; k += 1) values.push(r.get(k))
    return rangeResult(r, bound(values, value, order, true))
  },
  binary_search(it, args) {
    const r = range(
      it,
      arg(it, args, 0, 'binary_search'),
      arg(it, args, 1, 'binary_search'),
    )
    const value = it.coerce(arg(it, args, 2, 'binary_search'), r.elemType)
    const order = comparatorArg(it, args, 3)
    const values: Value[] = []
    for (let k = 0; k < r.count; k += 1) values.push(r.get(k))
    const position = bound(values, value, order, false)
    return bool(
      position < values.length && order(value, values[position] ?? null) >= 0,
    )
  },
  unique(it, args) {
    const r = range(it, arg(it, args, 0, 'unique'), arg(it, args, 1, 'unique'))
    let write = 0
    for (let k = 0; k < r.count; k += 1) {
      if (write === 0 || !valuesEqual(r.get(write - 1), r.get(k))) {
        r.set(write, r.get(k))
        write += 1
      }
    }
    r.done()
    return rangeResult(r, write)
  },
  next_permutation: (it, args) => permute(it, args, true),
  prev_permutation: (it, args) => permute(it, args, false),
  is_sorted(it, args) {
    const r = range(
      it,
      arg(it, args, 0, 'is_sorted'),
      arg(it, args, 1, 'is_sorted'),
    )
    const order = comparatorArg(it, args, 2)
    for (let k = 1; k < r.count; k += 1)
      if (order(r.get(k), r.get(k - 1)) < 0) return bool(false)
    return bool(true)
  },
  rotate(it, args) {
    const first = arg(it, args, 0, 'rotate')
    const middle = asIter(arg(it, args, 1, 'rotate').v)
    const r = range(it, first, arg(it, args, 2, 'rotate'))
    if (middle === null)
      return it.fail('Invalid range', 'rotate needs three iterators.')
    const shift = middle.index - r.first.index
    const values: Value[] = []
    for (let k = 0; k < r.count; k += 1) values.push(r.get(k))
    const rotated = [...values.slice(shift), ...values.slice(0, shift)]
    rotated.forEach((value, k) => r.set(k, value))
    r.done()
    return rangeResult(r, r.count - shift)
  },
  distance(it, args) {
    const a = asIter(arg(it, args, 0, 'distance').v)
    const b = asIter(arg(it, args, 1, 'distance').v)
    if (a === null || b === null)
      return it.fail('Invalid range', 'distance needs two iterators.')
    return tv(T.ll, BigInt(b.index - a.index))
  },
  next(it, args) {
    const value = asIter(arg(it, args, 0, 'next').v)
    if (value === null)
      return it.fail('Invalid iterator', 'next needs an iterator.')
    const steps = args[1] === undefined ? 1 : it.toIndex(it.eval(args[1]))
    return iterator(value.target, value.index + steps, value.reverse)
  },
  prev(it, args) {
    const value = asIter(arg(it, args, 0, 'prev').v)
    if (value === null)
      return it.fail('Invalid iterator', 'prev needs an iterator.')
    const steps = args[1] === undefined ? 1 : it.toIndex(it.eval(args[1]))
    return iterator(value.target, value.index - steps, value.reverse)
  },
  advance(it, args) {
    const ref = argRef(it, args, 0, 'advance')
    const value = asIter(ref.get())
    if (value === null)
      return it.fail('Invalid iterator', 'advance needs an iterator.')
    ref.set({
      ...value,
      index: value.index + it.toIndex(arg(it, args, 1, 'advance')),
    })
    return VOID
  },
  begin(it, args) {
    return methodCall(it, argRef(it, args, 0, 'begin'), 'begin')
  },
  end(it, args) {
    return methodCall(it, argRef(it, args, 0, 'end'), 'end')
  },
  size(it, args) {
    return methodCall(it, argRef(it, args, 0, 'size'), 'size')
  },
  memset,
  strlen(it, args) {
    return size(it.stringOf(arg(it, args, 0, 'strlen')).length)
  },
  printf(it, args) {
    const values = evalAll(it, args)
    const format = values[0]
    if (format === undefined)
      it.fail('Missing argument', 'printf needs a format string.')
    const text = formatPrintf(
      it.stringOf(format),
      printfArgs(it, values.slice(1)),
    )
    it.writeText('cout', text)
    return int(text.length)
  },
  scanf,
  puts(it, args) {
    it.writeText('cout', `${it.stringOf(arg(it, args, 0, 'puts'))}\n`)
    return int(0)
  },
  putchar(it, args) {
    it.writeText(
      'cout',
      String.fromCharCode(charCode(arg(it, args, 0, 'putchar'))),
    )
    return int(0)
  },
  getchar(it) {
    if (it.inPos >= it.stdin.length) return int(-1)
    const code = it.stdin.charCodeAt(it.inPos)
    it.inPos += 1
    return int(code)
  },
  getline(it, args) {
    const stream = arg(it, args, 0, 'getline')
    const target = argRef(it, args, 1, 'getline')
    const delimiter =
      args[2] === undefined
        ? '\n'
        : String.fromCharCode(charCode(it.eval(args[2])))
    if (it.inFail) return stream
    const line = it.readLine(delimiter)
    if (line === null) {
      it.inFail = true
      target.set({ kind: 'str', s: '', ver: 0 })
      return stream
    }
    target.set({ kind: 'str', s: line, ver: 0 })
    return stream
  },
  fflush: () => int(0),
  fclose: () => int(0),
  freopen(it) {
    it.note(
      'freopen is ignored: input comes from the test input box and output goes to the output panel.',
    )
    return tv(T.ptr, null)
  },
  exit(it, args) {
    return it.exit(args[0] === undefined ? 0 : Number(num(it.eval(args[0]))))
  },
  assert(it, args) {
    const value = arg(it, args, 0, 'assert')
    if (!it.truth(value))
      it.fail('Assertion failed', 'An assert(...) condition was false.')
    return VOID
  },
  setprecision: (it, args) =>
    tv(T.auto, {
      kind: 'manip',
      name: 'setprecision',
      arg: Number(num(arg(it, args, 0, 'setprecision'))),
    }),
  setw: (it, args) =>
    tv(T.auto, {
      kind: 'manip',
      name: 'setw',
      arg: Number(num(arg(it, args, 0, 'setw'))),
    }),
  setfill: (it, args) =>
    tv(T.auto, {
      kind: 'manip',
      name: 'setfill',
      arg: charCode(arg(it, args, 0, 'setfill')),
    }),
  rand(it) {
    it.randState = (Math.imul(it.randState, 1103515245) + 12345) & 0x7fffffff
    return int(it.randState)
  },
  srand(it, args) {
    it.randState = Number(num(arg(it, args, 0, 'srand'))) | 0
    return VOID
  },
  time: () => tv(T.ll, 0n),
  clock: () => tv(T.ll, 0n),
}

function permute(
  it: Interpreter,
  args: Expr[],
  forward: boolean,
): MethodResult {
  const r = range(
    it,
    arg(it, args, 0, 'next_permutation'),
    arg(it, args, 1, 'next_permutation'),
  )
  const base = comparatorArg(it, args, 2)
  const order = forward ? base : (a: Value, b: Value) => base(b, a)
  const values: Value[] = []
  for (let k = 0; k < r.count; k += 1) values.push(r.get(k))
  let i = values.length - 2
  while (i >= 0 && order(values[i] ?? null, values[i + 1] ?? null) >= 0) i -= 1
  let result = true
  if (i < 0) {
    values.reverse()
    result = false
  } else {
    let j = values.length - 1
    while (order(values[i] ?? null, values[j] ?? null) >= 0) j -= 1
    ;[values[i], values[j]] = [values[j] ?? null, values[i] ?? null]
    const tail = values.splice(i + 1).reverse()
    values.push(...tail)
  }
  values.forEach((value, k) => r.set(k, value))
  r.done()
  return bool(result)
}

const aliases: Record<string, string> = {
  __gcd: 'gcd',
  llabs: 'abs',
  labs: 'abs',
  stable_sort: 'sort',
  cerr_flush: 'fflush',
}

const unsupportedNames: Record<string, string> = {
  mt19937: 'Random number engines are not supported by the visualizer.',
  mt19937_64: 'Random number engines are not supported by the visualizer.',
  malloc: 'malloc is not supported by the visualizer. Use a vector instead.',
  free: 'free is not supported by the visualizer.',
  shuffle: 'shuffle is not supported by the visualizer.',
  random_shuffle: 'random_shuffle is not supported by the visualizer.',
}

export function isLibraryFunction(name: string): boolean {
  return name in functions || name in aliases
}

export function callLibrary(
  it: Interpreter,
  name: string,
  args: Expr[],
  call: CallExpr,
): MethodResult | undefined {
  const fn = functions[aliases[name] ?? name]
  if (fn !== undefined) return fn(it, args, call)
  const reason = unsupportedNames[name]
  if (reason !== undefined) it.unsupported(reason)
  return undefined
}

// ---- constants ---------------------------------------------------------------------------

const constants: Record<string, TV> = {
  INT_MAX: int(2147483647),
  INT_MIN: int(-2147483648),
  UINT_MAX: tv(T.uint, 4294967295),
  LLONG_MAX: tv(T.ll, 9223372036854775807n),
  LLONG_MIN: tv(T.ll, -9223372036854775808n),
  ULLONG_MAX: tv(T.ull, 18446744073709551615n),
  LONG_MAX: tv(T.ll, 9223372036854775807n),
  LONG_MIN: tv(T.ll, -9223372036854775808n),
  LONG_LONG_MAX: tv(T.ll, 9223372036854775807n),
  SHRT_MAX: int(32767),
  CHAR_MAX: int(127),
  DBL_MAX: double(Number.MAX_VALUE),
  DBL_MIN: double(Number.MIN_VALUE),
  FLT_MAX: double(3.4028234663852886e38),
  M_PI: double(Math.PI),
  M_E: double(Math.E),
  M_SQRT2: double(Math.SQRT2),
  EOF: int(-1),
  RAND_MAX: int(2147483647),
  INFINITY: double(Infinity),
  NAN: double(NaN),
}

const manipulators = new Set([
  'endl',
  'fixed',
  'scientific',
  'defaultfloat',
  'boolalpha',
  'noboolalpha',
  'left',
  'right',
  'flush',
  'ws',
])

export function libraryConstant(
  _it: Interpreter,
  name: string,
): TV | undefined {
  const constant = constants[name]
  if (constant !== undefined) return constant
  if (name === 'cin' || name === 'cout' || name === 'cerr' || name === 'clog') {
    return tv(T.stream, {
      kind: 'stream',
      name: name === 'clog' ? 'cerr' : name,
    })
  }
  if (manipulators.has(name)) return tv(T.auto, { kind: 'manip', name })
  if (name === 'stdin' || name === 'stdout' || name === 'stderr')
    return tv(T.ptr, null)
  return undefined
}

// ---- scoped names ------------------------------------------------------------------------

function limits(it: Interpreter, type: CType | undefined, name: string): TV {
  if (type === undefined) it.unsupported('numeric_limits needs a type.')
  if (type.k === 'float') {
    switch (name) {
      case 'max':
        return tv(type, Number.MAX_VALUE)
      case 'min':
        return tv(type, 2.2250738585072014e-308)
      case 'lowest':
        return tv(type, -Number.MAX_VALUE)
      case 'infinity':
        return tv(type, Infinity)
      case 'epsilon':
        return tv(type, Number.EPSILON)
      case 'quiet_NaN':
        return tv(type, NaN)
      default:
        break
    }
  }
  if (type.k === 'int') {
    const [lo, hi] = intRange(type)
    if (name === 'max') return fromBig(hi, type)
    if (name === 'min' || name === 'lowest') return fromBig(lo, type)
  }
  if (type.k === 'bool') return bool(name === 'max')
  it.unsupported(`numeric_limits<${typeName(type)}>::${name} is not supported.`)
}

export function scopedValue(it: Interpreter, expr: Expr & { k: 'scoped' }): TV {
  if (expr.name === 'npos') return tv(T.ull, NPOS)
  if (
    (expr.scope === 'ios' || expr.scope === 'ios_base') &&
    manipulators.has(expr.name)
  ) {
    return tv(T.auto, { kind: 'manip', name: expr.name })
  }
  if (expr.scope === 'numeric_limits') {
    return tv(T.function, {
      kind: 'builtin',
      name: `numeric_limits::${expr.name}`,
    })
  }
  it.unsupported(
    `${expr.scope}::${expr.name} is not supported by the visualizer.`,
  )
}

export function scopedCall(
  it: Interpreter,
  callee: Expr & { k: 'scoped' },
  args: Expr[],
  call: CallExpr,
): MethodResult {
  if (callee.scope === 'numeric_limits')
    return limits(it, callee.type, callee.name)
  if (
    (callee.scope === 'ios_base' || callee.scope === 'ios') &&
    callee.name === 'sync_with_stdio'
  ) {
    return bool(true)
  }
  const result = callLibrary(it, callee.name, args, call)
  if (result !== undefined) return result
  it.unsupported(
    `${callee.scope}::${callee.name} is not supported by the visualizer.`,
  )
}

// ---- methods -----------------------------------------------------------------------------

function methodCall(it: Interpreter, ref: Ref, name: string): MethodResult {
  return callMethod(it, ref, ref.get(), name, [], {
    k: 'call',
    line: it.line,
    callee: { k: 'ident', line: it.line, name },
    args: [],
  })
}

export function callMethod(
  it: Interpreter,
  ref: Ref,
  object: Value,
  name: string,
  args: Expr[],
  call: CallExpr,
): MethodResult {
  if (typeof object !== 'object' || object === null) {
    it.fail(
      'Invalid method call',
      `.${name}() cannot be called on a ${typeName(ref.type)}.`,
    )
  }
  switch (object.kind) {
    case 'stream':
      return streamMethod(it, object.name, name, args)
    case 'seq':
      return seqMethod(it, ref, object, name, args)
    case 'str':
      return stringMethod(it, ref, object, name, args)
    case 'map':
      return mapMethod(it, ref, object, name, args)
    case 'set':
      return setMethod(it, object, name, args)
    case 'heap':
      return heapMethod(it, object, name, args)
    case 'bitset':
      return bitsetMethod(it, object, name, args)
    case 'tuple':
      if (name === 'swap') {
        const other = argRef(it, args, 0, 'swap')
        const value = other.get()
        other.set(object)
        ref.set(value)
        return VOID
      }
      break
    case 'func':
      if (name === 'operator()') return it.callValue(object, evalAll(it, args))
      break
    default:
      break
  }
  void call
  it.fail(
    'Unknown method',
    `${typeName(ref.type)} has no method ${name}() here.`,
  )
}

function streamMethod(
  it: Interpreter,
  stream: string,
  name: string,
  args: Expr[],
): MethodResult {
  switch (name) {
    case 'tie':
    case 'sync_with_stdio':
    case 'flush':
    case 'setf':
    case 'unsetf':
    case 'exceptions':
      for (const expr of args) it.eval(expr)
      return VOID
    case 'precision':
      if (args[0] !== undefined)
        it.coutState.precision = Number(num(it.eval(args[0])))
      return int(it.coutState.precision)
    case 'eof':
      return bool(it.inPos >= it.stdin.length)
    case 'fail':
      return bool(it.inFail)
    case 'good':
      return bool(!it.inFail && it.inPos < it.stdin.length)
    case 'clear':
      it.inFail = false
      return VOID
    case 'ignore': {
      const count = args[0] === undefined ? 1 : Number(num(it.eval(args[0])))
      const delimiter = args[1] === undefined ? -1 : charCode(it.eval(args[1]))
      for (let i = 0; i < count && it.inPos < it.stdin.length; i += 1) {
        const code = it.stdin.charCodeAt(it.inPos)
        it.inPos += 1
        if (code === delimiter) break
      }
      return VOID
    }
    case 'peek':
      return int(
        it.inPos < it.stdin.length ? it.stdin.charCodeAt(it.inPos) : -1,
      )
    case 'get': {
      if (it.inPos >= it.stdin.length) {
        it.inFail = true
        return int(-1)
      }
      const code = it.stdin.charCodeAt(it.inPos)
      it.inPos += 1
      if (args[0] !== undefined) it.evalRef(args[0]).set(code)
      return int(code)
    }
    case 'put':
      it.writeText(
        stream === 'cerr' ? 'cerr' : 'cout',
        String.fromCharCode(charCode(arg(it, args, 0, 'put'))),
      )
      return VOID
    default:
      it.unsupported(`${stream}.${name}() is not supported by the visualizer.`)
  }
}

function checkNotEmpty(
  it: Interpreter,
  seq: { items: unknown[] },
  what: string,
  method: string,
) {
  if (seq.items.length === 0) {
    it.fail(
      `${method}() on an empty ${what}`,
      `${method}() was called on an empty ${what}.`,
      ['In real C++ this is undefined behaviour and often crashes.'],
    )
  }
}

function seqMethod(
  it: Interpreter,
  ref: Ref,
  seq: CSeq,
  name: string,
  args: Expr[],
): MethodResult {
  const what =
    seq.seq === 'carray' ? 'array' : seq.seq === 'stdarray' ? 'array' : seq.seq
  const fixed = seq.seq === 'carray' || seq.seq === 'stdarray'
  const element = (values: Expr[]): Value => {
    const evaluated = evalAll(it, values)
    if (evaluated.length === 1) return it.coerce(evaluated[0], seq.elemType)
    return it.construct(seq.elemType, evaluated, false)
  }
  const grow = () => {
    if (seq.items.length >= 5_000_000) it.containerTooLarge()
  }
  const push = (value: Value) => {
    grow()
    seq.items.push(value)
    bump(seq)
    it.trackWrite(
      ref.origin === undefined
        ? undefined
        : { ...ref.origin, path: [...ref.origin.path, seq.items.length - 1] },
    )
  }
  const insertAt = (method: string): MethodResult => {
    const position = asIter(arg(it, args, 0, method).v)
    if (position === null || position.target !== seq)
      it.fail(
        'Invalid iterator',
        `${method} needs an iterator into this ${what}.`,
      )
    const index = position.index
    if (index < 0 || index > seq.items.length)
      it.fail('Invalid iterator', `${method} position is outside the ${what}.`)
    const rest = args.slice(1).map((expr) => it.eval(expr))
    let values: Value[]
    if (rest.length === 2 && asIter(rest[0]?.v ?? null) !== null) {
      values = rangeValues(it, rest[0], rest[1]).map(copyValue)
    } else if (rest.length === 2 && method === 'insert') {
      const count = it.toIndex(rest[0])
      const value = it.coerce(rest[1], seq.elemType)
      values = Array.from({ length: count }, () => copyValue(value))
    } else if (rest.length === 1) {
      values = [it.coerce(rest[0], seq.elemType)]
    } else {
      values = [it.construct(seq.elemType, rest, false)]
    }
    seq.items.splice(index, 0, ...values)
    bump(seq)
    return iterator(seq, index)
  }
  switch (name) {
    case 'push_back':
    case 'emplace_back':
      if (fixed || seq.seq === 'stack' || seq.seq === 'queue') break
      push(element(args))
      return VOID
    case 'push':
    case 'emplace':
      if (seq.seq !== 'stack' && seq.seq !== 'queue') {
        if (name === 'emplace' && !fixed) return insertAt(name)
        break
      }
      push(element(args))
      return VOID
    case 'push_front':
    case 'emplace_front':
      if (seq.seq !== 'deque' && seq.seq !== 'list') break
      grow()
      seq.items.unshift(element(args))
      bump(seq)
      return VOID
    case 'pop_back':
      if (fixed || seq.seq === 'stack' || seq.seq === 'queue') break
      checkNotEmpty(it, seq, what, 'pop_back')
      seq.items.pop()
      bump(seq)
      return VOID
    case 'pop_front':
      if (seq.seq !== 'deque' && seq.seq !== 'list') break
      checkNotEmpty(it, seq, what, 'pop_front')
      seq.items.shift()
      bump(seq)
      return VOID
    case 'pop':
      if (seq.seq === 'stack') {
        checkNotEmpty(it, seq, what, 'pop')
        seq.items.pop()
      } else if (seq.seq === 'queue') {
        checkNotEmpty(it, seq, what, 'pop')
        seq.items.shift()
      } else break
      bump(seq)
      return VOID
    case 'top':
      if (seq.seq !== 'stack') break
      checkNotEmpty(it, seq, what, 'top')
      return { ref: it.seqRef(seq, seq.items.length - 1, ref.origin) }
    case 'front':
      checkNotEmpty(it, seq, what, 'front')
      return { ref: it.seqRef(seq, 0, ref.origin) }
    case 'back':
      checkNotEmpty(it, seq, what, 'back')
      return { ref: it.seqRef(seq, seq.items.length - 1, ref.origin) }
    case 'size':
      return size(seq.items.length)
    case 'empty':
      return bool(seq.items.length === 0)
    case 'max_size':
      return size(5_000_000)
    case 'clear':
      if (fixed) break
      seq.items = []
      bump(seq)
      return VOID
    case 'reserve':
    case 'shrink_to_fit':
      for (const expr of args) it.eval(expr)
      return VOID
    case 'resize': {
      if (fixed) break
      const count = it.toIndex(arg(it, args, 0, 'resize'), 'Size')
      if (count < 0 || count > 5_000_000) it.containerTooLarge()
      const fill =
        args[1] === undefined
          ? it.defaultValue(seq.elemType)
          : it.coerce(it.eval(args[1]), seq.elemType)
      while (seq.items.length < count) seq.items.push(copyValue(fill))
      seq.items.length = count
      bump(seq)
      return VOID
    }
    case 'assign': {
      if (fixed) break
      const first = arg(it, args, 0, 'assign')
      if (asIter(first.v) !== null && args[1] !== undefined) {
        seq.items = rangeValues(it, first, it.eval(args[1])).map(copyValue)
      } else {
        const count = it.toIndex(first, 'Size')
        if (count < 0 || count > 5_000_000) it.containerTooLarge()
        const fill =
          args[1] === undefined
            ? it.defaultValue(seq.elemType)
            : it.coerce(it.eval(args[1]), seq.elemType)
        seq.items = Array.from({ length: count }, () => copyValue(fill))
      }
      bump(seq)
      return VOID
    }
    case 'fill': {
      const value = it.coerce(arg(it, args, 0, 'fill'), seq.elemType)
      seq.items = seq.items.map(() => copyValue(value))
      bump(seq)
      return VOID
    }
    case 'at': {
      const index = it.toIndex(arg(it, args, 0, 'at'))
      if (index < 0 || index >= seq.items.length) {
        it.fail(
          'Index out of range',
          `${it.describeOrigin(ref.origin, 'the ' + what)}.at(${index}) is outside the ${what} (size ${seq.items.length}).`,
          [
            `Valid indexes: ${seq.items.length === 0 ? 'none (empty)' : `0–${seq.items.length - 1}`}`,
            'at() throws std::out_of_range, so the program would stop here.',
          ],
        )
      }
      return { ref: it.seqRef(seq, index, ref.origin) }
    }
    case 'begin':
    case 'cbegin':
      return iterator(seq, 0)
    case 'end':
    case 'cend':
      return iterator(seq, seq.items.length)
    case 'rbegin':
    case 'crbegin':
      return iterator(seq, 0, true)
    case 'rend':
    case 'crend':
      return iterator(seq, seq.items.length, true)
    case 'insert':
      if (fixed) break
      return insertAt(name)
    case 'erase': {
      if (fixed) break
      const first = asIter(arg(it, args, 0, 'erase').v)
      if (first === null || first.target !== seq)
        it.fail(
          'Invalid iterator',
          `erase needs an iterator into this ${what}.`,
        )
      const last = args[1] === undefined ? null : asIter(it.eval(args[1]).v)
      const end = last === null ? first.index + 1 : last.index
      if (first.index < 0 || end > seq.items.length || first.index > end) {
        it.fail('Invalid iterator', `erase range is outside the ${what}.`, [
          'Erasing end() or past the end is undefined behaviour.',
        ])
      }
      seq.items.splice(first.index, end - first.index)
      bump(seq)
      return iterator(seq, first.index)
    }
    case 'swap': {
      const other = argRef(it, args, 0, 'swap')
      const value = other.get()
      if (typeof value !== 'object' || value === null || value.kind !== 'seq')
        it.fail('Invalid swap', 'swap needs another container.')
      const items = seq.items
      seq.items = value.items
      value.items = items
      bump(seq)
      bump(value)
      return VOID
    }
    default:
      break
  }
  it.fail('Unknown method', `${typeName(ref.type)} has no method ${name}().`)
}

function findText(needle: TV, it: Interpreter): string {
  return needle.t.k === 'int' && needle.t.char === true
    ? String.fromCharCode(charCode(needle))
    : it.stringOf(needle)
}

function position(value: number): TV {
  return value < 0 ? tv(T.ull, NPOS) : size(value)
}

function stringMethod(
  it: Interpreter,
  ref: Ref,
  str: CStr,
  name: string,
  args: Expr[],
): MethodResult {
  const set = (text: string) => {
    str.s = text
    bump(str)
    it.trackWrite(ref.origin)
  }
  switch (name) {
    case 'size':
    case 'length':
      return size(str.s.length)
    case 'empty':
      return bool(str.s.length === 0)
    case 'clear':
      set('')
      return VOID
    case 'push_back':
      set(str.s + String.fromCharCode(charCode(arg(it, args, 0, 'push_back'))))
      return VOID
    case 'pop_back':
      checkNotEmpty(it, { items: [...str.s] }, 'string', 'pop_back')
      set(str.s.slice(0, -1))
      return VOID
    case 'back':
      checkNotEmpty(it, { items: [...str.s] }, 'string', 'back')
      return { ref: it.strRef(str, str.s.length - 1, ref.origin) }
    case 'front':
      checkNotEmpty(it, { items: [...str.s] }, 'string', 'front')
      return { ref: it.strRef(str, 0, ref.origin) }
    case 'at': {
      const index = it.toIndex(arg(it, args, 0, 'at'))
      if (index < 0 || index >= str.s.length) {
        it.fail(
          'Index out of range',
          `at(${index}) is outside the string (length ${str.s.length}).`,
          ['at() throws std::out_of_range.'],
        )
      }
      return { ref: it.strRef(str, index, ref.origin) }
    }
    case 'substr': {
      const start = args[0] === undefined ? 0 : it.toIndex(it.eval(args[0]))
      if (start < 0 || start > str.s.length) {
        it.fail(
          'Index out of range',
          `substr(${start}) starts past the end of a string of length ${str.s.length}.`,
          ['substr throws std::out_of_range.'],
        )
      }
      const length =
        args[1] === undefined ? str.s.length : it.toIndex(it.eval(args[1]))
      return tv(T.string, {
        kind: 'str',
        s: str.s.substr(start, Math.max(0, length)),
        ver: 0,
      })
    }
    case 'find':
    case 'rfind': {
      const needle = findText(arg(it, args, 0, name), it)
      const from =
        args[1] === undefined ? undefined : it.toIndex(it.eval(args[1]))
      const index =
        name === 'find'
          ? str.s.indexOf(needle, from ?? 0)
          : str.s.lastIndexOf(needle, from ?? Infinity)
      return position(index)
    }
    case 'find_first_of':
    case 'find_last_of': {
      const chars = findText(arg(it, args, 0, name), it)
      const indexes = [...str.s]
        .map((c, i) => (chars.includes(c) ? i : -1))
        .filter((i) => i >= 0)
      return position(
        (name === 'find_first_of' ? indexes[0] : indexes.at(-1)) ?? -1,
      )
    }
    case 'insert': {
      const where = arg(it, args, 0, 'insert')
      const iter = asIter(where.v)
      if (iter !== null) {
        const value = String.fromCharCode(charCode(arg(it, args, 1, 'insert')))
        set(str.s.slice(0, iter.index) + value + str.s.slice(iter.index))
        return iterator(str, iter.index)
      }
      const at = it.toIndex(where)
      if (at < 0 || at > str.s.length)
        it.fail(
          'Index out of range',
          `insert position ${at} is past the end of the string.`,
        )
      let text: string
      if (args.length === 3) {
        text = String.fromCharCode(charCode(it.eval(args[2]))).repeat(
          it.toIndex(it.eval(args[1])),
        )
      } else {
        text = findText(arg(it, args, 1, 'insert'), it)
      }
      set(str.s.slice(0, at) + text + str.s.slice(at))
      return VOID
    }
    case 'erase': {
      if (args.length === 0) {
        set('')
        return VOID
      }
      const first = arg(it, args, 0, 'erase')
      const iter = asIter(first.v)
      if (iter !== null) {
        const last = args[1] === undefined ? null : asIter(it.eval(args[1]).v)
        const end = last === null ? iter.index + 1 : last.index
        set(str.s.slice(0, iter.index) + str.s.slice(end))
        return iterator(str, iter.index)
      }
      const at = it.toIndex(first)
      if (at < 0 || at > str.s.length)
        it.fail(
          'Index out of range',
          `erase position ${at} is past the end of the string.`,
        )
      const length =
        args[1] === undefined ? str.s.length : it.toIndex(it.eval(args[1]))
      set(str.s.slice(0, at) + str.s.slice(at + Math.max(0, length)))
      return VOID
    }
    case 'append':
      set(str.s + findText(arg(it, args, 0, 'append'), it))
      return VOID
    case 'replace': {
      const at = it.toIndex(arg(it, args, 0, 'replace'))
      const length = it.toIndex(arg(it, args, 1, 'replace'))
      const text = findText(arg(it, args, 2, 'replace'), it)
      set(str.s.slice(0, at) + text + str.s.slice(at + length))
      return VOID
    }
    case 'resize': {
      const length = it.toIndex(arg(it, args, 0, 'resize'))
      const fill =
        args[1] === undefined
          ? '\0'
          : String.fromCharCode(charCode(it.eval(args[1])))
      set(
        str.s.length >= length
          ? str.s.slice(0, length)
          : str.s + fill.repeat(length - str.s.length),
      )
      return VOID
    }
    case 'assign':
      set(it.stringOf(arg(it, args, 0, 'assign')))
      return VOID
    case 'compare': {
      const other = it.stringOf(arg(it, args, 0, 'compare'))
      return int(str.s < other ? -1 : str.s > other ? 1 : 0)
    }
    case 'starts_with':
      return bool(str.s.startsWith(findText(arg(it, args, 0, name), it)))
    case 'ends_with':
      return bool(str.s.endsWith(findText(arg(it, args, 0, name), it)))
    case 'c_str':
    case 'data':
      return tv(T.string, str)
    case 'begin':
    case 'cbegin':
      return iterator(str, 0)
    case 'end':
    case 'cend':
      return iterator(str, str.s.length)
    case 'rbegin':
      return iterator(str, 0, true)
    case 'rend':
      return iterator(str, str.s.length, true)
    case 'swap': {
      const other = argRef(it, args, 0, 'swap')
      const value = other.get()
      if (typeof value !== 'object' || value === null || value.kind !== 'str')
        it.fail('Invalid swap', 'swap needs another string.')
      const text = str.s
      set(value.s)
      value.s = text
      bump(value)
      return VOID
    }
    default:
      it.fail('Unknown method', `string has no method ${name}() here.`)
  }
}

function mapMethod(
  it: Interpreter,
  ref: Ref,
  map: CMap,
  name: string,
  args: Expr[],
): MethodResult {
  const key = (index: number) =>
    it.coerce(arg(it, args, index, name), map.type.key)
  const entryIndex = (entry: CTuple | undefined) =>
    entry === undefined ? map.entries.length : map.entries.indexOf(entry)
  const insertPair = (pair: CTuple): TV => {
    const existing = map.type.multi
      ? undefined
      : it.findMapEntry(map, pair.items[0] ?? null)
    if (existing !== undefined) {
      return tv(
        { k: 'pair', first: T.iterator, second: T.bool },
        {
          kind: 'tuple',
          pair: true,
          items: [
            {
              kind: 'iter',
              target: map,
              index: entryIndex(existing),
              reverse: false,
            },
            false,
          ],
          types: [T.iterator, T.bool],
          ver: 0,
        },
      )
    }
    pair.keyLocked = true
    const index = it.insertMapEntry(map, pair)
    return tv(
      { k: 'pair', first: T.iterator, second: T.bool },
      {
        kind: 'tuple',
        pair: true,
        items: [{ kind: 'iter', target: map, index, reverse: false }, true],
        types: [T.iterator, T.bool],
        ver: 0,
      },
    )
  }
  const pairType: CType = {
    k: 'pair',
    first: map.type.key,
    second: map.type.value,
  }
  const eraseAt = (index: number) => {
    const [removed] = map.entries.splice(index, 1)
    if (map.index !== null && removed !== undefined)
      map.index.delete(keyOf(removed.items[0] ?? null))
    bump(map)
  }
  switch (name) {
    case 'size':
      return size(map.entries.length)
    case 'empty':
      return bool(map.entries.length === 0)
    case 'clear':
      map.entries = []
      map.index?.clear()
      bump(map)
      return VOID
    case 'count': {
      const k = key(0)
      if (!map.type.multi)
        return size(it.findMapEntry(map, k) === undefined ? 0 : 1)
      return size(
        map.entries.filter(
          (entry) => map.compare(entry.items[0] ?? null, k) === 0,
        ).length,
      )
    }
    case 'contains':
      return bool(it.findMapEntry(map, key(0)) !== undefined)
    case 'find':
      return iterator(map, entryIndex(it.findMapEntry(map, key(0))))
    case 'at': {
      const k = key(0)
      const entry = it.findMapEntry(map, k)
      if (entry === undefined) {
        it.fail('Missing key', `map.at(${accessKey(k)}) found no such key.`, [
          'at() throws std::out_of_range when the key is missing.',
        ])
      }
      return {
        ref: it.tupleRef(
          entry,
          1,
          ref.origin === undefined
            ? undefined
            : { ...ref.origin, path: [...ref.origin.path] },
        ),
      }
    }
    case 'insert': {
      const first = arg(it, args, 0, 'insert')
      if (asIter(first.v) !== null && args[1] !== undefined) {
        for (const item of rangeValues(it, first, it.eval(args[1])))
          insertPair(it.coerce(it.valueTV(item), pairType) as CTuple)
        return VOID
      }
      return insertPair(it.coerce(first, pairType) as CTuple)
    }
    case 'emplace':
    case 'try_emplace': {
      const values = evalAll(it, args)
      return insertPair(it.construct(pairType, values, true) as CTuple)
    }
    case 'erase': {
      const first = arg(it, args, 0, 'erase')
      const iter = asIter(first.v)
      if (iter !== null && iter.target === map) {
        if (iter.index < 0 || iter.index >= map.entries.length)
          it.fail('Invalid iterator', 'erase(end()) is undefined behaviour.')
        const last = args[1] === undefined ? null : asIter(it.eval(args[1]).v)
        const end = last === null ? iter.index + 1 : last.index
        for (let i = end - 1; i >= iter.index; i -= 1) eraseAt(i)
        return iterator(map, iter.index)
      }
      const k = it.coerce(first, map.type.key)
      let removed = 0
      for (let i = map.entries.length - 1; i >= 0; i -= 1) {
        if (
          map.compare(map.entries[i].items[0] ?? null, k) === 0 &&
          (map.index === null
            ? true
            : keyOf(map.entries[i].items[0] ?? null) === keyOf(k))
        ) {
          eraseAt(i)
          removed += 1
        }
      }
      return size(removed)
    }
    case 'begin':
    case 'cbegin':
      return iterator(map, 0)
    case 'end':
    case 'cend':
      return iterator(map, map.entries.length)
    case 'rbegin':
      return iterator(map, 0, true)
    case 'rend':
      return iterator(map, map.entries.length, true)
    case 'lower_bound':
    case 'upper_bound': {
      if (map.index !== null)
        it.fail('Not available', `${name} needs an ordered map.`)
      return iterator(
        map,
        bound(
          map.entries,
          key(0),
          map.compare,
          name === 'upper_bound',
          (entry) => (entry as CTuple).items[0] ?? null,
        ),
      )
    }
    default:
      it.fail('Unknown method', `map has no method ${name}() here.`)
  }
}

function setMethod(
  it: Interpreter,
  set: CSet,
  name: string,
  args: Expr[],
): MethodResult {
  const value = (index: number) =>
    it.coerce(arg(it, args, index, name), set.type.elem)
  switch (name) {
    case 'size':
      return size(set.items.length)
    case 'empty':
      return bool(set.items.length === 0)
    case 'clear':
      set.items = []
      set.index?.clear()
      bump(set)
      return VOID
    case 'insert':
    case 'emplace': {
      const first = arg(it, args, 0, name)
      if (asIter(first.v) !== null && args[1] !== undefined) {
        for (const item of rangeValues(it, first, it.eval(args[1])))
          it.setInsert(set, it.coerce(it.valueTV(item), set.type.elem))
        return VOID
      }
      const result = it.setInsert(set, it.coerce(first, set.type.elem))
      return tv(
        { k: 'pair', first: T.iterator, second: T.bool },
        {
          kind: 'tuple',
          pair: true,
          items: [
            { kind: 'iter', target: set, index: result.index, reverse: false },
            result.inserted,
          ],
          types: [T.iterator, T.bool],
          ver: 0,
        },
      )
    }
    case 'count': {
      const v = value(0)
      if (!set.type.multi)
        return size(it.setFind(set, v) < set.items.length ? 1 : 0)
      return size(set.items.filter((item) => set.compare(item, v) === 0).length)
    }
    case 'contains':
      return bool(it.setFind(set, value(0)) < set.items.length)
    case 'find':
      return iterator(set, it.setFind(set, value(0)))
    case 'erase': {
      const first = arg(it, args, 0, 'erase')
      const iter = asIter(first.v)
      if (iter !== null && iter.target === set) {
        if (iter.index < 0 || iter.index >= set.items.length) {
          it.fail('Invalid iterator', 'erase(end()) is undefined behaviour.', [
            'Check that find() found the value before erasing it.',
          ])
        }
        const last = args[1] === undefined ? null : asIter(it.eval(args[1]).v)
        const end = last === null ? iter.index + 1 : last.index
        for (let i = end - 1; i >= iter.index; i -= 1) it.setEraseAt(set, i)
        return iterator(set, iter.index)
      }
      const v = it.coerce(first, set.type.elem)
      let removed = 0
      for (let i = set.items.length - 1; i >= 0; i -= 1) {
        if (
          valuesEqual(set.items[i] ?? null, v) ||
          (set.index === null && set.compare(set.items[i] ?? null, v) === 0)
        ) {
          it.setEraseAt(set, i)
          removed += 1
        }
      }
      return size(removed)
    }
    case 'begin':
    case 'cbegin':
      return iterator(set, 0)
    case 'end':
    case 'cend':
      return iterator(set, set.items.length)
    case 'rbegin':
      return iterator(set, 0, true)
    case 'rend':
      return iterator(set, set.items.length, true)
    case 'lower_bound':
    case 'upper_bound':
      if (set.index !== null)
        it.fail('Not available', `${name} needs an ordered set.`)
      return iterator(
        set,
        bound(set.items, value(0), set.compare, name === 'upper_bound'),
      )
    default:
      it.fail('Unknown method', `set has no method ${name}() here.`)
  }
}

function heapMethod(
  it: Interpreter,
  heap: CHeap,
  name: string,
  args: Expr[],
): MethodResult {
  switch (name) {
    case 'push':
    case 'emplace': {
      const values = evalAll(it, args)
      const value =
        values.length === 1
          ? it.coerce(values[0], heap.elemType)
          : it.construct(heap.elemType, values, false)
      it.heapPush(heap, value)
      return VOID
    }
    case 'pop':
      checkNotEmpty(it, heap, 'priority_queue', 'pop')
      it.heapPop(heap)
      return VOID
    case 'top': {
      checkNotEmpty(it, heap, 'priority_queue', 'top')
      const top = heap.items[0] ?? null
      return tv(heap.elemType, top)
    }
    case 'size':
      return size(heap.items.length)
    case 'empty':
      return bool(heap.items.length === 0)
    default:
      it.fail('Unknown method', `priority_queue has no method ${name}() here.`)
  }
}

function bitsetMethod(
  it: Interpreter,
  bits: { kind: 'bitset'; bits: boolean[]; ver: number },
  name: string,
  args: Expr[],
): MethodResult {
  const index = () => {
    const i = it.toIndex(arg(it, args, 0, name))
    if (i < 0 || i >= bits.bits.length)
      it.fail(
        'Index out of range',
        `bitset position ${i} is outside 0–${bits.bits.length - 1}.`,
      )
    return i
  }
  switch (name) {
    case 'set':
      if (args.length === 0) bits.bits.fill(true)
      else
        bits.bits[index()] =
          args[1] === undefined ? true : it.truth(it.eval(args[1]))
      bump(bits)
      return VOID
    case 'reset':
      if (args.length === 0) bits.bits.fill(false)
      else bits.bits[index()] = false
      bump(bits)
      return VOID
    case 'flip':
      if (args.length === 0) bits.bits = bits.bits.map((bit) => !bit)
      else {
        const i = index()
        bits.bits[i] = !bits.bits[i]
      }
      bump(bits)
      return VOID
    case 'test':
      return bool(bits.bits[index()] ?? false)
    case 'count':
      return size(bits.bits.filter(Boolean).length)
    case 'any':
      return bool(bits.bits.some(Boolean))
    case 'none':
      return bool(!bits.bits.some(Boolean))
    case 'all':
      return bool(bits.bits.every(Boolean))
    case 'size':
      return size(bits.bits.length)
    case 'to_string':
      return tv(T.string, {
        kind: 'str',
        s: [...bits.bits]
          .reverse()
          .map((bit) => (bit ? '1' : '0'))
          .join(''),
        ver: 0,
      })
    case 'to_ulong':
    case 'to_ullong': {
      let value = 0n
      for (let i = bits.bits.length - 1; i >= 0; i -= 1)
        value = (value << 1n) | (bits.bits[i] ? 1n : 0n)
      return tv(T.ull, value)
    }
    default:
      it.fail('Unknown method', `bitset has no method ${name}() here.`)
  }
}
