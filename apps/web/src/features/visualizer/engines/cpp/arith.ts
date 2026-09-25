// Integer and floating-point arithmetic with C++ promotion rules. Results
// wrap like g++ on a 64-bit judge; wraps that change the mathematical result
// are reported so learners can see overflow happen.

import { intRange, T, typeName, type CType } from './types'
import type { Value } from './values'

export type TV = { t: CType; v: Value }

type IntType = Extract<CType, { k: 'int' }>

export class ArithmeticError extends Error {}

export function promote(t: CType): CType {
  if (t.k === 'bool') return T.int
  if (t.k === 'int' && t.bits < 32) return T.int
  return t
}

export function isFloatType(t: CType) {
  return t.k === 'float'
}

export function commonType(a: CType, b: CType): CType {
  const x = promote(a)
  const y = promote(b)
  if (x.k === 'float' || y.k === 'float') {
    if (
      (x.k === 'float' && x.name === 'long double') ||
      (y.k === 'float' && y.name === 'long double')
    ) {
      return T.longDouble
    }
    return T.double
  }
  if (x.k !== 'int' || y.k !== 'int') return T.int
  if (x.bits === y.bits)
    return x.unsigned || y.unsigned ? { ...x, unsigned: true, char: false } : x
  const wider = x.bits > y.bits ? x : y
  const narrower = x.bits > y.bits ? y : x
  // A wider signed type holds every value of a narrower unsigned one.
  if (!wider.unsigned && narrower.unsigned) return wider
  return wider
}

export function toJsNumber(value: Value): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'boolean') return value ? 1 : 0
  return 0
}

function toBigInt(value: Value): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0n
    return BigInt(Math.trunc(value))
  }
  if (typeof value === 'boolean') return value ? 1n : 0n
  return 0n
}

export function wrapInt(value: number | bigint, t: IntType): number | bigint {
  if (t.bits >= 64) {
    const big = typeof value === 'bigint' ? value : toBigInt(value)
    return t.unsigned ? BigInt.asUintN(t.bits, big) : BigInt.asIntN(t.bits, big)
  }
  if (typeof value === 'bigint') {
    const wrapped = t.unsigned
      ? BigInt.asUintN(t.bits, value)
      : BigInt.asIntN(t.bits, value)
    return Number(wrapped)
  }
  if (!Number.isFinite(value)) return 0
  let x = Math.trunc(value)
  if (!Number.isSafeInteger(x)) {
    return Number(
      t.unsigned
        ? BigInt.asUintN(t.bits, BigInt(x))
        : BigInt.asIntN(t.bits, BigInt(x)),
    )
  }
  if (t.bits === 32) return t.unsigned ? x >>> 0 : x | 0
  const modulus = 2 ** t.bits
  x = ((x % modulus) + modulus) % modulus
  if (!t.unsigned && x >= modulus / 2) x -= modulus
  return x
}

function describeNumber(value: Value): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number' || typeof value === 'bigint')
    return String(value)
  return 'value'
}

// Converts a scalar to type `to`. `note` receives a message when an integer
// value changes because it does not fit.
export function convertScalar(
  value: Value,
  from: CType,
  to: CType,
  note?: (message: string) => void,
): Value {
  switch (to.k) {
    case 'bool':
      return (
        toJsNumber(value) !== 0 || (typeof value === 'bigint' && value !== 0n)
      )
    case 'float': {
      const x = toJsNumber(value)
      return to.name === 'float' ? Math.fround(x) : x
    }
    case 'int': {
      if (from.k === 'float') {
        const x = toJsNumber(value)
        if (!Number.isFinite(x)) {
          note?.(
            `${describeNumber(value)} cannot be stored in ${typeName(to)}.`,
          )
          return to.bits >= 64 ? 0n : 0
        }
        const truncated = Math.trunc(x)
        const [lo, hi] = intRange(to)
        if (
          BigInt(Math.trunc(truncated)) < lo ||
          BigInt(Math.trunc(truncated)) > hi
        ) {
          note?.(
            `${describeNumber(value)} is out of range for ${typeName(to)}.`,
          )
        }
        return wrapInt(truncated, to)
      }
      const wrapped = wrapInt(
        typeof value === 'boolean'
          ? value
            ? 1
            : 0
          : (value as number | bigint),
        to,
      )
      if (note !== undefined && (from.k === 'int' || from.k === 'auto')) {
        const original = toBigInt(value)
        if (
          original !== toBigInt(wrapped) &&
          !(to.char === true && from.k === 'int' && from.char === true)
        ) {
          note(
            `${original} does not fit in ${typeName(to)} and became ${wrapped}.`,
          )
        }
      }
      return wrapped
    }
    default:
      return value
  }
}

export function asInt(value: Value, t: CType): number | bigint {
  if (t.k === 'int') return value as number | bigint
  if (t.k === 'bool') return value === true ? 1 : 0
  return toJsNumber(value)
}

type Result = { value: TV; note?: string }

export function binaryArith(op: string, a: TV, b: TV): Result {
  if (op === '<<' || op === '>>') return shift(op, a, b)
  const type = commonType(a.t, b.t)
  if (type.k === 'float') {
    const x = toJsNumber(a.v)
    const y = toJsNumber(b.v)
    switch (op) {
      case '+':
        return { value: { t: type, v: x + y } }
      case '-':
        return { value: { t: type, v: x - y } }
      case '*':
        return { value: { t: type, v: x * y } }
      case '/':
        return { value: { t: type, v: x / y } }
      default:
        throw new ArithmeticError(
          `Operator ${op} cannot be used with floating-point values.`,
        )
    }
  }
  if (type.k !== 'int') {
    throw new ArithmeticError(`Operator ${op} needs numbers.`)
  }
  const x = convertScalar(a.v, a.t, type) as number | bigint
  const y = convertScalar(b.v, b.t, type) as number | bigint
  if ((op === '/' || op === '%') && (y === 0 || y === 0n)) {
    throw new ArithmeticError(
      op === '/' ? 'Division by zero.' : 'Modulo by zero.',
    )
  }
  let exact: bigint
  let result: number | bigint
  if (type.bits <= 32 && typeof x === 'number' && typeof y === 'number') {
    switch (op) {
      case '+':
        exact = BigInt(x) + BigInt(y)
        result = wrapInt(x + y, type)
        break
      case '-':
        exact = BigInt(x) - BigInt(y)
        result = wrapInt(x - y, type)
        break
      case '*': {
        const product = x * y
        exact = Number.isSafeInteger(product)
          ? BigInt(product)
          : BigInt(x) * BigInt(y)
        result = type.unsigned ? Math.imul(x, y) >>> 0 : Math.imul(x, y)
        break
      }
      case '/':
        exact = BigInt(Math.trunc(x / y))
        result = wrapInt(Math.trunc(x / y), type)
        break
      case '%':
        exact = BigInt(x % y)
        result = wrapInt(x % y, type)
        break
      case '&':
        exact = BigInt(wrapInt(x & y, type))
        result = wrapInt(x & y, type)
        break
      case '|':
        exact = BigInt(wrapInt(x | y, type))
        result = wrapInt(x | y, type)
        break
      case '^':
        exact = BigInt(wrapInt(x ^ y, type))
        result = wrapInt(x ^ y, type)
        break
      default:
        throw new ArithmeticError(`Unknown operator ${op}.`)
    }
  } else {
    const bx = toBigInt(x)
    const by = toBigInt(y)
    switch (op) {
      case '+':
        exact = bx + by
        break
      case '-':
        exact = bx - by
        break
      case '*':
        exact = bx * by
        break
      case '/':
        exact = bx / by
        break
      case '%':
        exact = bx % by
        break
      case '&':
        exact = bx & by
        break
      case '|':
        exact = bx | by
        break
      case '^':
        exact = bx ^ by
        break
      default:
        throw new ArithmeticError(`Unknown operator ${op}.`)
    }
    result = wrapInt(exact, type)
    if (op === '&' || op === '|' || op === '^') exact = toBigInt(result)
  }
  const value: TV = { t: type, v: result }
  if (exact !== toBigInt(result)) {
    return { value, note: overflowNote(a, op, b, type, result) }
  }
  return { value }
}

function overflowNote(
  a: TV,
  op: string,
  b: TV,
  type: IntType,
  result: number | bigint,
): string {
  const expression = `${describeNumber(a.v)} ${op} ${describeNumber(b.v)}`
  if (type.unsigned) {
    return `Unsigned wrap-around in ${typeName(type)}: ${expression} became ${result}.`
  }
  return `Signed overflow in ${typeName(type)}: ${expression} wrapped to ${result} (undefined behaviour in C++).`
}

function shift(op: '<<' | '>>', a: TV, b: TV): Result {
  const type = promote(a.t)
  if (type.k !== 'int') {
    throw new ArithmeticError(`Operator ${op} needs integers.`)
  }
  const x = toBigInt(convertScalar(a.v, a.t, type))
  const count = Number(toBigInt(b.v))
  let note: string | undefined
  if (count < 0 || count >= type.bits) {
    note = `Shift by ${count} is at least the width of ${typeName(type)} (${type.bits} bits); the result is undefined in C++.`
  }
  const amount = BigInt(((count % type.bits) + type.bits) % type.bits)
  const exact = op === '<<' ? x << amount : x >> amount
  const result = wrapInt(exact, type)
  if (
    note === undefined &&
    op === '<<' &&
    exact !== toBigInt(result) &&
    !type.unsigned
  ) {
    note = `Left shift overflowed ${typeName(type)}: ${x} << ${count} became ${result}.`
  }
  const value: TV = { t: type, v: result }
  return note === undefined ? { value } : { value, note }
}

export function compareArith(op: string, a: TV, b: TV): boolean {
  const type = commonType(a.t, b.t)
  let x: number | bigint
  let y: number | bigint
  if (type.k === 'float') {
    x = toJsNumber(a.v)
    y = toJsNumber(b.v)
  } else {
    x = convertScalar(a.v, a.t, type) as number | bigint
    y = convertScalar(b.v, b.t, type) as number | bigint
  }
  switch (op) {
    case '<':
      return x < y
    case '>':
      return x > y
    case '<=':
      return x <= y
    case '>=':
      return x >= y
    case '==':
      return x == y
    default:
      return x != y
  }
}

export function unaryArith(op: string, a: TV): Result {
  const type = promote(a.t)
  if (type.k === 'float') {
    const x = toJsNumber(a.v)
    if (op === '-') return { value: { t: type, v: -x } }
    if (op === '+') return { value: { t: type, v: x } }
    throw new ArithmeticError(
      `Operator ${op} cannot be used with a floating-point value.`,
    )
  }
  if (type.k !== 'int')
    throw new ArithmeticError(`Operator ${op} needs a number.`)
  const x = toBigInt(convertScalar(a.v, a.t, type))
  const exact = op === '-' ? -x : op === '~' ? ~x : x
  const result = wrapInt(exact, type)
  const value: TV = { t: type, v: result }
  if (op === '-' && exact !== toBigInt(result) && !type.unsigned) {
    return {
      value,
      note: `Signed overflow in ${typeName(type)}: -(${x}) wrapped to ${result}.`,
    }
  }
  return { value }
}

export function truthy(value: Value): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'bigint') return value !== 0n
  return value !== null
}
