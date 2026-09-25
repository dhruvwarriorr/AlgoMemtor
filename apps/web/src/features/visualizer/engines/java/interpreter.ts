// Java on top of the shared step engine. Java differs from C++ mainly in
// value semantics (objects, arrays and collections are references), strings
// (immutable, `+` concatenates), defined integer overflow, exceptions and its
// standard library. Everything else — statements, calls, frames, recording —
// is the base interpreter.

import {
  binaryArith,
  commonType,
  compareArith,
  convertScalar,
  toJsNumber,
  truthy,
  type TV,
} from '../cpp/arith'
import type { Expr, Stmt } from '../cpp/ast'
import {
  Interpreter,
  RuntimeFailure,
  type MethodResult,
} from '../cpp/interpreter'
import { tv } from '../cpp/runtime'
import { T, type CType } from '../cpp/types'
import {
  bump,
  isAggregate,
  valuesEqual,
  type Comparator,
  type CSeq,
  type CStr,
  type CStruct,
  type JObj,
  type Origin,
  type Ref,
  type Scope,
  type Slot,
  type Value,
} from '../cpp/values'
import { javaDialect, javaDouble, javaFloat, javaTypeName } from './format'
import {
  callJavaMethod,
  callJavaStatic,
  constructJava,
  javaStaticValue,
  methodReference,
} from './library'
import { JCHAR, type JavaProgram } from './parser'
import type { TraceLimits } from '../../trace'

// Exception classes and their parents, for catch matching.
const exceptionParents: Record<string, string> = {
  Exception: 'Throwable',
  Error: 'Throwable',
  RuntimeException: 'Exception',
  IOException: 'Exception',
  InterruptedException: 'Exception',
  ArithmeticException: 'RuntimeException',
  IndexOutOfBoundsException: 'RuntimeException',
  ArrayIndexOutOfBoundsException: 'IndexOutOfBoundsException',
  StringIndexOutOfBoundsException: 'IndexOutOfBoundsException',
  NullPointerException: 'RuntimeException',
  IllegalArgumentException: 'RuntimeException',
  NumberFormatException: 'IllegalArgumentException',
  IllegalStateException: 'RuntimeException',
  NoSuchElementException: 'RuntimeException',
  InputMismatchException: 'NoSuchElementException',
  UnsupportedOperationException: 'RuntimeException',
  ClassCastException: 'RuntimeException',
  NegativeArraySizeException: 'RuntimeException',
  EmptyStackException: 'RuntimeException',
  ConcurrentModificationException: 'RuntimeException',
  StackOverflowError: 'Error',
  OutOfMemoryError: 'Error',
}

export function isExceptionClass(name: string) {
  return name in exceptionParents || /(Exception|Error)$/.test(name)
}

const functionalMethods = [
  'compare',
  'apply',
  'applyAsInt',
  'applyAsLong',
  'applyAsDouble',
  'accept',
  'test',
  'get',
  'run',
  'call',
]

const MAX_STRING = 1_000_000

export class JavaInterpreter extends Interpreter {
  readonly javaProgram: JavaProgram
  // One String object per literal, as Java interns literals.
  private readonly literals = new WeakMap<Expr, CStr>()
  // Anonymous classes see the variables of the method that created them.
  private readonly anonymousEnv = new WeakMap<CStruct, Scope>()
  // PrintWriter output not yet flushed when the program ends is lost.
  unflushed: { length: number } = { length: 0 }
  // Enum constants: name and ordinal.
  private readonly enumInfo = new WeakMap<
    CStruct,
    { name: string; ordinal: number }
  >()

  constructor(program: JavaProgram, input: string, limits: TraceLimits) {
    super(program, input, limits, javaDialect)
    this.javaProgram = program
  }

  // ---- program structure ---------------------------------------------------

  protected override *programG() {
    for (const stmt of this.javaProgram.staticInit) yield* this.execG(stmt)
    const main =
      this.program.functions
        .get('main')
        ?.find((fn) => fn.params.length === 1) ??
      this.program.functions.get('main')?.[0]
    if (main === undefined) {
      throw new RuntimeFailure(
        'compile',
        'No main method',
        'Add public static void main(String[] args).',
      )
    }
    const argsType: CType = { k: 'carray', elem: T.string, size: null }
    const slots: Slot[] = main.params.slice(0, 1).map((param) => ({
      name: param.name,
      type: argsType,
      value: this.javaArray(T.string, []),
      frame: 0,
    }))
    const result = (yield {
      fn: main,
      slots,
      self: null,
      env: null,
      name: `${this.javaProgram.mainClass || 'Main'}.main`,
    }) as TV
    if (this.unflushed.length > 0) {
      this.addPendingWarning(
        'Output written to a PrintWriter was never flushed. Call out.flush() or out.close() at the end; real Java would print nothing.',
      )
    }
    return result
  }

  addPendingWarning(message: string) {
    this.warnings.push({
      step: Math.max(0, this.steps.length - 1),
      line: this.line,
      message,
    })
  }

  javaArray(elem: CType, items: Value[]): CSeq {
    return {
      kind: 'seq',
      seq: 'carray',
      elemType: elem,
      items,
      ver: 0,
      touched: items.length,
      fixed: true,
    }
  }

  // ---- values and conversions ------------------------------------------------

  protected override storeCopy(value: Value): Value {
    return value
  }

  protected override rebinds(): boolean {
    return true
  }

  override zeroValue(type: CType): Value {
    if (type.k === 'int' && type.boxed !== true) return type.bits >= 64 ? 0n : 0
    if (type.k === 'float' && type.boxed !== true) return 0
    if (type.k === 'bool' && type.boxed !== true) return false
    return null
  }

  protected override coerceNull(type: CType): Value {
    if (
      (type.k === 'int' || type.k === 'float' || type.k === 'bool') &&
      type.boxed !== true
    ) {
      this.npe('A null value was unboxed into a primitive.', [
        'For example Map.get returned null for a missing key and it was stored in an int.',
        'Use getOrDefault, or check for null first.',
      ])
    }
    return null
  }

  override coerce(value: TV, type: CType): Value {
    const v = value.v
    if (v === null) return this.coerceNull(type)
    if (type.k === 'string' && typeof v === 'object' && v.kind === 'str') {
      return v
    }
    if (
      (type.k === 'int' || type.k === 'float' || type.k === 'bool') &&
      typeof v === 'object' &&
      v.kind !== 'initlist'
    ) {
      this.fail(
        'ClassCastException',
        `A ${javaTypeName(value.t, v)} cannot be used as ${javaTypeName(type)}.`,
      )
    }
    if (type.k === 'carray' && typeof v === 'object' && v.kind === 'initlist') {
      return this.arrayFromList(type.elem, v.items)
    }
    if (typeof v === 'object') {
      if (type.k === 'jclass' || type.k === 'auto' || type.k === 'function') {
        return v
      }
      if (type.k === 'struct' && v.kind === 'struct') return v
      const adopted = this.adoptType(v, type)
      if (adopted !== undefined) return adopted
    }
    return super.coerce(value, type)
  }

  // `new ArrayList<>()` has no element type of its own; it takes the
  // declared one (List<Character> list = new ArrayList<>()).
  private adoptType(v: Value, type: CType): Value | undefined {
    if (typeof v !== 'object' || v === null) return undefined
    const known = (t: CType) => t.k !== 'auto'
    switch (v.kind) {
      case 'seq':
        if (
          (type.k === 'vector' ||
            type.k === 'deque' ||
            type.k === 'stack' ||
            type.k === 'queue' ||
            type.k === 'list') &&
          v.seq !== 'carray'
        ) {
          if (!known(v.elemType) && known(type.elem)) v.elemType = type.elem
          return v
        }
        return undefined
      case 'heap':
        if (type.k === 'pq' || type.k === 'deque' || type.k === 'vector') {
          if (!known(v.elemType) && 'elem' in type && known(type.elem)) {
            v.elemType = type.elem
          }
          return v
        }
        return undefined
      case 'set':
        if (type.k === 'set' || type.k === 'vector') {
          if (!known(v.type.elem) && type.k === 'set' && known(type.elem)) {
            v.type = { ...v.type, elem: type.elem }
          }
          return v
        }
        return undefined
      case 'map':
        if (type.k === 'map') {
          if (!known(v.type.key) || !known(v.type.value)) {
            v.type = {
              ...v.type,
              key: known(v.type.key) ? v.type.key : type.key,
              value: known(v.type.value) ? v.type.value : type.value,
            }
          }
          return v
        }
        return undefined
      case 'str':
        return type.k === 'string' ? v : undefined
      case 'tuple':
        return type.k === 'pair' ? v : undefined
      default:
        return undefined
    }
  }

  override construct(type: CType, args: TV[], braced: boolean): Value {
    if (type.k === 'carray' && braced)
      return this.arrayFromList(type.elem, args)
    return super.construct(type, args, braced)
  }

  arrayFromList(elem: CType, items: TV[]): CSeq {
    return this.javaArray(
      elem,
      items.map((item) => {
        if (
          elem.k === 'carray' &&
          typeof item.v === 'object' &&
          item.v !== null &&
          item.v.kind === 'initlist'
        ) {
          return this.arrayFromList(elem.elem, item.v.items)
        }
        return this.coerce(item, elem)
      }),
    )
  }

  protected override castValue(value: TV, type: CType): Value {
    if (value.v === null) return null
    if (type.k === 'int' && type.char === true && typeof value.v === 'number') {
      return value.v & 0xffff
    }
    if (
      type.k === 'struct' &&
      typeof value.v === 'object' &&
      !this.isInstance(value, type)
    ) {
      this.fail(
        'ClassCastException',
        `class ${javaTypeName(value.t, value.v)} cannot be cast to class ${type.name}`,
      )
    }
    if (
      type.k === 'string' ||
      type.k === 'struct' ||
      type.k === 'jclass' ||
      type.k === 'auto'
    ) {
      return value.v
    }
    if (
      (type.k === 'int' || type.k === 'float') &&
      value.t.k === 'float' &&
      typeof value.v === 'number'
    ) {
      // Java casts from double saturate instead of wrapping.
      const x = value.v
      if (type.k === 'int') {
        if (Number.isNaN(x)) return type.bits >= 64 ? 0n : 0
        const bits = BigInt(type.bits)
        const max = (1n << (bits - 1n)) - 1n
        const min = -(1n << (bits - 1n))
        let big = Number.isFinite(x) ? BigInt(Math.trunc(x)) : x > 0 ? max : min
        if (big > max) big = max
        if (big < min) big = min
        return type.bits >= 64 ? big : Number(big)
      }
    }
    return super.castValue(value, type)
  }

  // Java's String.valueOf / toString for any value.
  str(value: TV): string {
    const v = value.v
    const t = value.t
    if (v === null) return 'null'
    if (typeof v === 'boolean' || t.k === 'bool')
      return truthy(v) ? 'true' : 'false'
    if (typeof v === 'number' || typeof v === 'bigint') {
      if (t.k === 'float') {
        return t.name === 'float' ? javaFloat(Number(v)) : javaDouble(Number(v))
      }
      if (t.k === 'int' && t.char === true)
        return String.fromCharCode(Number(v) & 0xffff)
      return String(v)
    }
    switch (v.kind) {
      case 'str':
        return v.s
      case 'seq': {
        if (v.seq === 'carray') {
          const code =
            v.elemType.k === 'int'
              ? v.elemType.char === true
                ? 'C'
                : v.elemType.bits >= 64
                  ? 'J'
                  : 'I'
              : v.elemType.k === 'float'
                ? 'D'
                : v.elemType.k === 'bool'
                  ? 'Z'
                  : 'Ljava.lang.Object;'
          return `[${code}@${this.hash(v)}`
        }
        return `[${v.items.map((item) => this.str(tv(v.elemType, item))).join(', ')}]`
      }
      case 'set':
        return `[${v.items.map((item) => this.str(tv(v.type.elem, item))).join(', ')}]`
      case 'heap':
        return `[${v.items.map((item) => this.str(tv(v.elemType, item))).join(', ')}]`
      case 'map':
        return `{${v.entries
          .map(
            (entry) =>
              `${this.str(tv(v.type.key, entry.items[0] ?? null))}=${this.str(tv(v.type.value, entry.items[1] ?? null))}`,
          )
          .join(', ')}}`
      case 'tuple':
        return v.pair
          ? `${this.str(tv(v.types[0] ?? T.auto, v.items[0] ?? null))}=${this.str(tv(v.types[1] ?? T.auto, v.items[1] ?? null))}`
          : `(${v.items.map((item, index) => this.str(tv(v.types[index] ?? T.auto, item))).join(', ')})`
      case 'struct': {
        const method = v.def.methods
          .get('toString')
          ?.find((fn) => fn.params.length === 0)
        if (method !== undefined) {
          const result = this.quietly(() =>
            this.invoke(
              method,
              [],
              v,
              this.methodEnv(v),
              `${v.def.name}.toString`,
            ),
          )
          return this.str(result)
        }
        const constant = this.enumInfo.get(v)
        if (constant !== undefined) return constant.name
        if (this.isRecord(v)) {
          const parts = v.def.fields.map(
            (field) =>
              `${field.name}=${this.str(tv(v.fieldTypes.get(field.name) ?? field.type, v.fields.get(field.name) ?? null))}`,
          )
          return `${v.def.name}[${parts.join(', ')}]`
        }
        return `${v.def.name.replace(/\$\d+$/, '')}@${this.hash(v)}`
      }
      case 'jobj':
        return v.describe()
      case 'func':
        return `Main$$Lambda@${this.hash(v)}`
      default:
        return String(v.kind)
    }
  }

  hash(object: object): string {
    return (0x1b6d3586 + this.recorder.objectId(object) * 0x9e3779b1)
      .toString(16)
      .slice(-8)
  }

  string(text: string): TV {
    if (text.length > MAX_STRING) {
      this.failKind(
        'memory',
        'OutOfMemoryError',
        'A string grew beyond a million characters.',
      )
    }
    return tv(T.string, { kind: 'str', s: text, ver: 0 })
  }

  // ---- expressions ---------------------------------------------------------------

  override eval(expr: Expr): TV {
    switch (expr.k) {
      case 'char':
        return tv(JCHAR, expr.value)
      case 'string': {
        let literal = this.literals.get(expr)
        if (literal === undefined) {
          literal = { kind: 'str', s: expr.value, ver: 0 }
          this.literals.set(expr, literal)
        }
        return tv(T.string, literal)
      }
      case 'null':
        return tv(T.auto, null)
      case 'this': {
        const self = this.current.self
        if (self === null)
          this.fail(
            'Compile error',
            'this is only available in an instance method.',
          )
        return tv({ k: 'struct', name: self.def.name }, self)
      }
      case 'member': {
        const ref = this.evalRef(expr)
        return tv(ref.type, ref.get())
      }
      default:
        return super.eval(expr)
    }
  }

  protected override evalDialect(expr: Expr): TV {
    if (expr.k === 'newarray') return this.newArray(expr)
    if (expr.k === 'methodref') return methodReference(this, expr)
    if (expr.k === 'instanceof') {
      const value = this.eval(expr.operand)
      const matches = value.v !== null && this.isInstance(value, expr.type)
      if (matches && expr.bind !== undefined) {
        // Pattern variable: `shape instanceof Circle c`.
        const scope = this.current.scope
        scope.vars.set(expr.bind, {
          name: expr.bind,
          type: expr.type,
          value: value.v,
          frame: scope.frame,
        })
      }
      return tv(T.bool, matches)
    }
    return super.evalDialect(expr)
  }

  isInstance(value: TV, type: CType): boolean {
    const v = value.v
    if (v === null) return false
    if (type.k === 'auto') return true
    if (typeof v !== 'object') {
      if (type.k === 'int') {
        return (
          value.t.k === 'int' &&
          value.t.bits === type.bits &&
          value.t.char === type.char
        )
      }
      if (type.k === 'float') return value.t.k === 'float'
      if (type.k === 'bool') return value.t.k === 'bool'
      return false
    }
    switch (type.k) {
      case 'struct':
        return (
          v.kind === 'struct' &&
          (this.javaProgram.supertypes.get(v.def.name)?.has(type.name) ??
            v.def.name === type.name)
        )
      case 'string':
        return v.kind === 'str' && v.jclass === undefined
      case 'carray':
        return v.kind === 'seq' && v.seq === 'carray'
      case 'vector':
      case 'deque':
      case 'stack':
      case 'queue':
        return v.kind === 'seq' && v.seq !== 'carray'
      case 'map':
        return v.kind === 'map'
      case 'set':
        return v.kind === 'set'
      case 'pq':
        return v.kind === 'heap'
      case 'jclass':
        if (v.kind === 'jobj') {
          if (v.cls === type.name) return true
          let current: string | undefined = v.cls
          while (current !== undefined && current !== type.name) {
            current = exceptionParents[current]
          }
          return current === type.name
        }
        return v.kind === 'str' && v.jclass === type.name
      default:
        return false
    }
  }

  enumOf(object: CStruct) {
    return this.enumInfo.get(object)
  }

  isRecord(object: CStruct) {
    return this.javaProgram.records.has(object.def.name)
  }

  enumConstants(name: string): CStruct[] {
    const names = this.javaProgram.enums.get(name) ?? []
    return names
      .map((constant) => {
        const slot = this.globals.vars.get(constant)
        return slot === undefined ? null : this.slotRef(slot).get()
      })
      .filter(
        (value): value is CStruct =>
          typeof value === 'object' &&
          value !== null &&
          value.kind === 'struct',
      )
  }

  // Methods every object has (Object and Enum), used when a class does not
  // declare them.
  builtinStructMethod(
    object: CStruct,
    name: string,
    args: TV[],
  ): TV | undefined {
    const info = this.enumInfo.get(object)
    const type: CType = { k: 'struct', name: object.def.name }
    switch (name) {
      case 'toString':
        if (args.length === 0) return this.string(this.str(tv(type, object)))
        return undefined
      case 'equals':
        if (args.length === 1)
          return tv(T.bool, this.equalsValue(object, args[0]?.v ?? null))
        return undefined
      case 'hashCode':
        if (args.length === 0) return tv(T.int, this.structHash(object))
        return undefined
      case 'name':
        return info === undefined ? undefined : this.string(info.name)
      case 'ordinal':
        return info === undefined ? undefined : tv(T.int, info.ordinal)
      case 'compareTo': {
        const other = args[0]?.v
        if (
          info === undefined ||
          typeof other !== 'object' ||
          other === null ||
          other.kind !== 'struct'
        )
          return undefined
        return tv(
          T.int,
          info.ordinal - (this.enumInfo.get(other)?.ordinal ?? 0),
        )
      }
      case 'getClass':
        return tv({ k: 'jclass', name: 'Class' }, {
          kind: 'jobj',
          cls: 'Class',
          ver: 0,
          state: {
            methods: {
              getSimpleName: () =>
                this.string(object.def.name.replace(/\$\d+$/, '')),
              getName: () => this.string(object.def.name),
            },
          },
          describe: () => `class ${object.def.name}`,
        } satisfies JObj)
      default:
        return undefined
    }
  }

  structHash(object: CStruct): number {
    const method = object.def.methods
      .get('hashCode')
      ?.find((fn) => fn.params.length === 0)
    if (method !== undefined) {
      return (
        Number(
          toJsNumber(
            this.quietly(() =>
              this.invoke(
                method,
                [],
                object,
                this.methodEnv(object),
                `${object.def.name}.hashCode`,
              ),
            ).v,
          ),
        ) | 0
      )
    }
    if (this.isRecord(object)) {
      let h = 0
      for (const field of object.def.fields) {
        const value = object.fields.get(field.name) ?? null
        h =
          (Math.imul(31, h) +
            this.hashOf(
              value,
              object.fieldTypes.get(field.name) ?? field.type,
            )) |
          0
      }
      return h
    }
    return Number.parseInt(this.hash(object), 16) | 0
  }

  hashOf(value: Value, type: CType): number {
    if (value === null) return 0
    if (typeof value === 'object' && value.kind === 'struct')
      return this.structHash(value)
    if (typeof value === 'object' && value.kind === 'str') {
      let h = 0
      for (let i = 0; i < value.s.length; i += 1)
        h = (Math.imul(31, h) + value.s.charCodeAt(i)) | 0
      return h
    }
    if (typeof value === 'boolean') return value ? 1231 : 1237
    if (typeof value === 'bigint')
      return Number(
        BigInt.asIntN(32, value ^ (BigInt.asUintN(64, value) >> 32n)),
      )
    if (typeof value === 'number')
      return type.k === 'float' ? Math.trunc(value) | 0 : value | 0
    return Number.parseInt(this.hash(value), 16) | 0
  }

  protected override *structMethodG(
    object: CStruct,
    name: string,
    args: Expr[],
  ) {
    if (!object.def.methods.has(name)) {
      const values: TV[] = []
      for (const arg of args) values.push(yield* this.evalG(arg))
      const result = this.builtinStructMethod(object, name, values)
      if (result !== undefined) return result
    }
    return yield* super.structMethodG(object, name, args)
  }

  override callStructMethod(
    object: CStruct,
    name: string,
    args: Expr[],
  ): MethodResult {
    if (!object.def.methods.has(name)) {
      const result = this.builtinStructMethod(
        object,
        name,
        args.map((arg) => this.eval(arg)),
      )
      if (result !== undefined) return result
    }
    return super.callStructMethod(object, name, args)
  }

  private newArray(expr: Expr & { k: 'newarray' }): TV {
    let type: CType = expr.elem
    for (let i = 0; i < expr.dims.length + expr.extraDims; i += 1) {
      type = { k: 'carray', elem: type, size: null }
    }
    if (expr.init !== undefined) {
      const list = this.eval(expr.init)
      return tv(type, this.coerce(list, type))
    }
    const sizes = expr.dims.map((dim) => {
      const size = this.toIndex(this.eval(dim), 'Array size')
      if (size < 0) {
        this.fail('NegativeArraySizeException', `${size}`)
      }
      return size
    })
    const build = (level: number, levelType: CType): CSeq => {
      const elemType = levelType.k === 'carray' ? levelType.elem : T.auto
      const size = sizes[level] ?? 0
      this.allocateCells(size)
      const items: Value[] = new Array<Value>(size)
      for (let i = 0; i < size; i += 1) {
        items[i] =
          level + 1 < sizes.length
            ? build(level + 1, elemType)
            : this.zeroValue(elemType)
      }
      return this.javaArray(elemType, items)
    }
    return tv(type, build(0, type))
  }

  allocateCells(count: number) {
    this.cells += count
    if (this.cells > 30_000_000) {
      this.failKind(
        'memory',
        'OutOfMemoryError',
        'The program allocated more memory than the visualizer allows.',
        ['Use smaller sizes while visualizing.'],
      )
    }
  }

  protected override evalNew(expr: Expr & { k: 'new' }): TV {
    const args = expr.args.map((arg) => this.eval(arg))
    if (expr.type.k === 'struct') {
      const def = this.program.structs.get(expr.type.name)
      if (def === undefined)
        this.fail('Compile error', `Unknown class ${expr.type.name}.`)
      if (
        this.javaProgram.enums.has(def.name) &&
        expr.enumConst === undefined
      ) {
        this.fail(
          'Compile error',
          `Enum ${def.name} cannot be created with new.`,
        )
      }
      const object = this.constructStruct(def, args, false)
      if (def.name.includes('$'))
        this.anonymousEnv.set(object, this.current.scope)
      if (expr.enumConst !== undefined)
        this.enumInfo.set(object, expr.enumConst)
      return tv(expr.type, object)
    }
    return constructJava(this, expr.type, args, expr.line, expr.className)
  }

  protected override methodEnv(object: CStruct): Scope | null {
    return this.anonymousEnv.get(object) ?? null
  }

  protected override memberRef(expr: Expr & { k: 'member' }): Ref {
    if (expr.object.k === 'this') return super.memberRef(expr)
    const baseRef = this.evalRef(expr.object)
    const object = baseRef.get()
    if (object === null) {
      this.npe(
        `Cannot read field "${expr.name}" because "${this.describeOrigin(baseRef.origin, 'the value')}" is null.`,
      )
    }
    if (
      typeof object === 'object' &&
      object.kind === 'seq' &&
      expr.name === 'length'
    ) {
      const length = object.items.length
      return {
        type: T.int,
        get: () => length,
        peek: () => length,
        set: () =>
          this.fail(
            'Compile error',
            'The length of an array cannot be assigned.',
          ),
      }
    }
    if (typeof object === 'object' && object.kind === 'struct') {
      return this.fieldRef(object, expr.name, baseRef.origin)
    }
    return super.memberRef(expr)
  }

  override evalRef(expr: Expr): Ref {
    if (expr.k === 'scoped') {
      const slot = this.globals.vars.get(expr.name)
      if (slot !== undefined && this.program.structs.has(expr.scope)) {
        return this.slotRef(slot)
      }
    }
    return super.evalRef(expr)
  }

  protected override dispatchScopedValue(expr: Expr & { k: 'scoped' }): TV {
    const slot = this.globals.vars.get(expr.name)
    if (slot !== undefined && this.program.structs.has(expr.scope)) {
      return tv(slot.type, this.slotRef(slot).get())
    }
    return javaStaticValue(this, expr.scope, expr.name)
  }

  protected override dispatchScopedCall(
    callee: Expr & { k: 'scoped' },
    args: Expr[],
    call: Expr & { k: 'call' },
  ): MethodResult {
    return callJavaStatic(this, callee.scope, callee.name, args, call)
  }

  protected override *callG(expr: Expr & { k: 'call' }) {
    const callee = expr.callee
    // Main.solve(): a static method of a class in the program.
    if (callee.k === 'scoped' && this.program.structs.has(callee.scope)) {
      const overloads = this.program.functions.get(callee.name)
      if (overloads !== undefined) {
        const fn = this.pickJavaOverload(
          overloads,
          expr.args.length,
          callee.name,
        )
        return yield* this.userCallG(
          fn,
          expr.args,
          null,
          null,
          `${callee.scope}.${callee.name}`,
        )
      }
    }
    if (callee.k === 'scoped' && callee.scope.startsWith('$')) {
      const self = this.current.self
      if (self === null)
        this.fail(
          'Compile error',
          'super is only available in an instance method.',
        )
      if (callee.scope === '$super') {
        const parent = this.program.structs.get(callee.name)
        if (parent === undefined)
          this.fail('Compile error', `Unknown class ${callee.name}.`)
        if (parent.ctors.length === 0 && expr.args.length === 0)
          return tv(T.void, null)
        const ctor = this.pickJavaOverload(
          parent.ctors,
          expr.args.length,
          parent.name,
        )
        return yield* this.userCallG(
          ctor,
          expr.args,
          self,
          this.methodEnv(self),
          parent.name,
        )
      }
      if (callee.scope === '$object') {
        const values: TV[] = []
        for (const arg of expr.args) values.push(yield* this.evalG(arg))
        if (callee.name === 'toString') {
          return this.string(
            `${self.def.name.replace(/\$\d+$/, '')}@${this.hash(self)}`,
          )
        }
        if (callee.name === 'hashCode')
          return tv(T.int, Number.parseInt(this.hash(self), 16) | 0)
        return tv(T.bool, values[0]?.v === self)
      }
      const parentName = callee.scope.slice('$super.'.length)
      const parent = this.program.structs.get(parentName)
      const overloads = parent?.methods.get(callee.name)
      if (parent === undefined || overloads === undefined) {
        const values: TV[] = []
        for (const arg of expr.args) values.push(yield* this.evalG(arg))
        const builtin = this.builtinStructMethod(self, callee.name, values)
        if (builtin !== undefined) return builtin
        this.fail(
          'Compile error',
          `${parentName} has no method ${callee.name}.`,
        )
      }
      const fn = this.pickJavaOverload(
        overloads,
        expr.args.length,
        `${parentName}.${callee.name}`,
      )
      return yield* this.userCallG(
        fn,
        expr.args,
        self,
        this.methodEnv(self),
        `${parentName}.${callee.name}`,
      )
    }
    // Color.values(), Color.valueOf("RED")
    if (
      callee.k === 'scoped' &&
      this.javaProgram.enums.has(callee.scope) &&
      !this.program.functions.has(callee.name)
    ) {
      const constants = this.enumConstants(callee.scope)
      const type: CType = { k: 'struct', name: callee.scope }
      if (callee.name === 'values' && expr.args.length === 0) {
        return tv(
          { k: 'carray', elem: type, size: null },
          this.javaArray(type, [...constants]),
        )
      }
      if (callee.name === 'valueOf' && expr.args.length === 1) {
        const arg = yield* this.evalG(expr.args[0])
        const wanted = this.str(arg)
        const found = constants.find(
          (item) => this.enumInfo.get(item)?.name === wanted,
        )
        if (found === undefined) {
          this.fail(
            'IllegalArgumentException',
            `No enum constant ${callee.scope}.${wanted}`,
          )
        }
        return tv(type, found)
      }
    }
    // getClass(), hashCode() ... on this without a declaration.
    if (callee.k === 'ident') {
      const self = this.current.self
      if (
        self !== null &&
        this.findSlot(callee.name) === undefined &&
        !self.def.methods.has(callee.name) &&
        !this.program.functions.has(callee.name)
      ) {
        const values: TV[] = []
        for (const arg of expr.args) values.push(yield* this.evalG(arg))
        const builtin = this.builtinStructMethod(self, callee.name, values)
        if (builtin !== undefined) return builtin
      }
    }
    // this(...) inside a constructor.
    if (callee.k === 'this') {
      const self = this.current.self
      if (self === null)
        this.fail(
          'Compile error',
          'this(...) is only allowed in a constructor.',
        )
      const ctor = this.pickJavaOverload(
        self.def.ctors,
        expr.args.length,
        self.def.name,
      )
      return yield* this.userCallG(
        ctor,
        expr.args,
        self,
        this.methodEnv(self),
        self.def.name,
      )
    }
    return yield* super.callG(expr)
  }

  private pickJavaOverload<F extends { params: unknown[] }>(
    list: F[],
    count: number,
    name: string,
  ): F {
    const fn = list.find((item) => item.params.length === count)
    if (fn === undefined) {
      this.fail(
        'Compile error',
        `No version of ${name} takes ${count} argument${count === 1 ? '' : 's'}.`,
      )
    }
    return fn
  }

  protected override dispatchMethod(
    ref: Ref,
    object: Value,
    name: string,
    args: Expr[],
    call: Expr & { k: 'call' },
  ): MethodResult {
    if (object === null) {
      this.npe(
        `Cannot invoke "${name}()" because "${this.describeOrigin(ref.origin, 'the value')}" is null.`,
      )
    }
    return callJavaMethod(this, ref, object, name, args, call)
  }

  protected override dispatchLibrary(): MethodResult | undefined {
    return undefined
  }

  protected override dispatchConstant(): TV | undefined {
    return undefined
  }

  protected override isLibraryName(): boolean {
    return false
  }

  protected override evalBinary(expr: Expr & { k: 'binary' }): TV {
    const op = expr.op
    if (op === '+') {
      const left = this.eval(expr.left)
      const right = this.eval(expr.right)
      if (isStringy(left) || isStringy(right)) {
        return this.string(this.str(left) + this.str(right))
      }
      return this.arithmetic('+', left, right)
    }
    const left = this.eval(expr.left)
    const right = this.eval(expr.right)
    if (op === '==' || op === '!=') {
      const same = this.javaEquals(left, right)
      return tv(T.bool, op === '==' ? same : !same)
    }
    return this.arithmetic(op, left, right)
  }

  // == in Java: numbers by value, everything else by reference.
  private javaEquals(left: TV, right: TV): boolean {
    const a = left.v
    const b = right.v
    const scalar = (x: Value) =>
      typeof x === 'number' || typeof x === 'bigint' || typeof x === 'boolean'
    if (scalar(a) && scalar(b)) return compareArith('==', left, right)
    if (
      typeof a === 'object' &&
      a !== null &&
      typeof b === 'object' &&
      b !== null &&
      a !== b &&
      a.kind === 'str' &&
      b.kind === 'str' &&
      a.s === b.s
    ) {
      this.note(
        'These two Strings have the same text but == compares references, so it is false. Use .equals() to compare text.',
      )
    }
    return a === b
  }

  arithmetic(op: string, left: TV, right: TV): TV {
    if (left.v === null || right.v === null) {
      this.npe('A null value was used in arithmetic (unboxing null).')
    }
    const bothBool = left.t.k === 'bool' && right.t.k === 'bool'
    if (bothBool && (op === '&' || op === '|' || op === '^')) {
      const a = truthy(left.v)
      const b = truthy(right.v)
      return tv(T.bool, op === '&' ? a && b : op === '|' ? a || b : a !== b)
    }
    if (['<', '>', '<=', '>=', '==', '!='].includes(op)) {
      return tv(T.bool, compareArith(op, left, right))
    }
    if (op === '<<' || op === '>>' || op === '>>>')
      return this.shift(op, left, right)
    try {
      const result = binaryArith(op, unbox(left), unbox(right))
      if (result.note !== undefined) this.note(result.note)
      return result.value
    } catch (error) {
      if (error instanceof Error && /zero/i.test(error.message)) {
        this.fail('ArithmeticException', '/ by zero', [
          'Integer division or % by 0 throws in Java (a double would give Infinity or NaN).',
        ])
      }
      throw error
    }
  }

  private shift(op: string, left: TV, right: TV): TV {
    const type = left.t.k === 'int' && left.t.bits >= 64 ? T.ll : T.int
    const bits = type.k === 'int' ? type.bits : 32
    const count = Number(BigInt(toJsNumber(right.v)) & BigInt(bits - 1))
    const x = BigInt(toJsNumber(convertScalar(left.v, left.t, type)))
    let result: bigint
    if (op === '<<') result = BigInt.asIntN(bits, x << BigInt(count))
    else if (op === '>>') result = x >> BigInt(count)
    else result = BigInt.asIntN(bits, BigInt.asUintN(bits, x) >> BigInt(count))
    return tv(type, bits >= 64 ? result : Number(result))
  }

  protected override evalAssign(expr: Expr & { k: 'assign' }): Ref {
    if (expr.op === '=') return super.evalAssign(expr)
    const ref = this.evalRef(expr.target)
    const current = tv(ref.type, ref.get())
    const right = this.eval(expr.value)
    const op = expr.op.slice(0, -1)
    if (op === '+' && (isStringy(current) || ref.type.k === 'string')) {
      ref.set(this.string(this.str(current) + this.str(right)).v)
      return ref
    }
    const result = this.arithmetic(op, current, right)
    // Compound assignment narrows silently: b += 1 on a byte wraps.
    ref.set(convertScalar(result.v, result.t, ref.type))
    return ref
  }

  // ---- control flow and errors -------------------------------------------------

  protected override switchMatches(value: TV, candidate: TV): boolean {
    const a = value.v
    const b = candidate.v
    if (typeof a === 'object' && a !== null && a.kind === 'str') {
      return (
        typeof b === 'object' && b !== null && b.kind === 'str' && a.s === b.s
      )
    }
    if (a === null) this.npe('switch was given null.')
    if (typeof a === 'object') return a === b
    return compareArith('==', value, candidate)
  }

  protected override catches(type: string, failure: RuntimeFailure): boolean {
    if (failure.kind !== 'runtime' && failure.kind !== 'recursion') return false
    let current: string | undefined = failure.title
    while (current !== undefined) {
      if (current === type) return true
      current =
        exceptionParents[current] ??
        (current === 'Throwable'
          ? undefined
          : /Error$/.test(current)
            ? 'Error'
            : 'RuntimeException')
      if (current === 'Throwable' && type === 'Throwable') return true
    }
    return false
  }

  protected override exceptionValue(failure: RuntimeFailure): Value {
    if (failure.thrown !== undefined) return failure.thrown
    return exceptionObject(failure.title, failure.message)
  }

  protected override throwValue(value: TV): never {
    const v = value.v
    if (v === null) this.npe('throw was given null.')
    if (typeof v === 'object' && v.kind === 'jobj' && isExceptionClass(v.cls)) {
      const failure = new RuntimeFailure(
        'runtime',
        v.cls,
        typeof v.state.message === 'string' ? v.state.message : '',
      )
      failure.thrown = v
      throw failure
    }
    this.fail('Compile error', 'Only exceptions can be thrown.')
  }

  npe(message: string, details?: string[]): never {
    this.fail('NullPointerException', message, details)
  }

  override nullDereference(what = 'a reference'): never {
    this.npe(`${what} is null, so there is no object to use.`, [
      'Check for null first (for example at the end of a list or a missing child).',
    ])
  }

  override nullName(): string {
    return 'null'
  }

  protected override outOfRange(
    origin: Origin | undefined,
    index: number,
    size: number,
  ): never {
    const name = this.describeOrigin(origin, 'the array')
    this.fail(
      'ArrayIndexOutOfBoundsException',
      `Index ${index} out of bounds for length ${size}`,
      [
        `Access attempted: ${name}[${index}]`,
        `Length: ${size}`,
        size === 0
          ? 'The array is empty, so no index is valid.'
          : `Valid indexes: 0–${size - 1}`,
      ],
    )
  }

  override failKind(
    kind: RuntimeFailure['kind'],
    title: string,
    message: string,
    details?: string[],
  ): never {
    super.failKind(
      kind,
      kind === 'recursion' ? 'StackOverflowError' : title,
      message,
      details,
    )
  }

  protected override toFailure(caught: unknown): RuntimeFailure {
    const failure = super.toFailure(caught)
    if (failure.title === 'Division by zero') {
      return new RuntimeFailure(
        'runtime',
        'ArithmeticException',
        '/ by zero',
        failure.details,
      )
    }
    if (
      failure.kind === 'recursion' &&
      failure.title !== 'StackOverflowError'
    ) {
      return new RuntimeFailure(
        'recursion',
        'StackOverflowError',
        failure.message,
        failure.details,
      )
    }
    return failure
  }

  protected override decorateNote(message: string): string {
    let text = message.replaceAll('long long', 'long')
    if (text.startsWith('Signed overflow')) {
      text = text
        .replace('Signed overflow', 'Integer overflow')
        .replace(
          /\.$/,
          '. Java wraps silently, so the result is wrong without any error.',
        )
    }
    return text
      .replace(
        'in real C++ it would hold garbage',
        'Java would refuse to compile this',
      )
      .replace(/ \(undefined behaviour in C\+\+\)/, '')
  }

  // ---- ordering and callbacks -------------------------------------------------------

  // Natural ordering: numbers, strings, and Comparable objects (compareTo).
  protected override structLess(a: CStruct, b: CStruct): boolean {
    return this.compareTo(a, b) < 0
  }

  compareTo(a: CStruct, b: CStruct): number {
    const method = a.def.methods
      .get('compareTo')
      ?.find((fn) => fn.params.length === 1)
    const ea = this.enumInfo.get(a)
    const eb = this.enumInfo.get(b)
    if (method === undefined && ea !== undefined && eb !== undefined) {
      return Math.sign(ea.ordinal - eb.ordinal)
    }
    if (method === undefined) {
      this.fail(
        'ClassCastException',
        `${a.def.name} cannot be sorted: it has no compareTo method. Pass a Comparator.`,
      )
    }
    const result = this.quietly(() =>
      this.invoke(
        method,
        [tv({ k: 'struct', name: b.def.name }, b)],
        a,
        this.methodEnv(a),
        `${a.def.name}.compareTo`,
      ),
    )
    return Math.sign(Number(toJsNumber(result.v)))
  }

  // Java comparators return a negative, zero or positive int.
  override comparatorFor(cmp: CType | Value | null): Comparator {
    if (cmp === null || cmp === undefined)
      return (a, b) => this.compareValues(a, b)
    if (typeof cmp === 'object' && 'k' in cmp) return super.comparatorFor(cmp)
    const fn = cmp as Value
    return (a, b) => {
      const result = this.quietly(() =>
        this.callValue(fn, [this.valueTV(a), this.valueTV(b)]),
      )
      return Math.sign(Number(toJsNumber(result.v)))
    }
  }

  override callValue(value: Value, args: TV[]): TV {
    if (typeof value === 'object' && value !== null) {
      if (value.kind === 'jobj' && value.call !== undefined)
        return value.call(args)
      if (value.kind === 'struct') {
        for (const name of functionalMethods) {
          const method = value.def.methods
            .get(name)
            ?.find((fn) => fn.params.length === args.length)
          if (method !== undefined) {
            return this.invoke(
              method,
              args,
              value,
              this.methodEnv(value),
              `${value.def.name}.${name}`,
            )
          }
        }
      }
    }
    if (value === null) this.npe('A null function was called.')
    return super.callValue(value, args)
  }

  override valueTV(value: Value): TV {
    if (typeof value === 'number')
      return tv({ ...T.int, boxed: true } as CType, value)
    if (typeof value === 'bigint')
      return tv({ ...T.ll, boxed: true } as CType, value)
    if (value === null) return tv(T.auto, null)
    if (typeof value === 'object' && value.kind === 'str')
      return tv(T.string, value)
    return super.valueTV(value)
  }

  protected override iterationRefs(container: Value, origin?: Origin) {
    if (container === null)
      this.npe('A for-each loop was given a null collection.')
    if (typeof container === 'object' && container !== null) {
      if (
        container.kind === 'seq' &&
        (container.seq === 'stack' || container.seq === 'queue')
      ) {
        return {
          count: container.items.length,
          at: (i: number) => this.seqRef(container, i, origin),
        }
      }
      if (container.kind === 'heap') {
        const items = [...container.items]
        return {
          count: items.length,
          at: (i: number) =>
            this.tempRef(tv(container.elemType, items[i] ?? null)),
        }
      }
      if (container.kind === 'str') {
        this.fail(
          'Compile error',
          'A String cannot be used in a for-each loop; use s.toCharArray().',
        )
      }
    }
    return super.iterationRefs(container, origin)
  }

  override truth(value: TV): boolean {
    if (value.v === null && value.t.k === 'bool')
      this.npe('A null Boolean was used as a condition.')
    return super.truth(value)
  }

  // Values stored in collections keep their declared element type.
  element(value: TV, type: CType): Value {
    return this.coerce(value, type.k === 'auto' ? value.t : type)
  }

  typeOf(value: Value): CType {
    return this.valueTV(value).t
  }

  equalsValue(a: Value, b: Value): boolean {
    if (a === b) return true
    if (a === null || b === null) return false
    if (typeof a === 'object' && a.kind === 'struct') {
      const method = a.def.methods
        .get('equals')
        ?.find((fn) => fn.params.length === 1)
      if (method !== undefined) {
        return this.truth(
          this.quietly(() =>
            this.invoke(
              method,
              [this.valueTV(b)],
              a,
              this.methodEnv(a),
              `${a.def.name}.equals`,
            ),
          ),
        )
      }
      if (
        this.isRecord(a) &&
        typeof b === 'object' &&
        b.kind === 'struct' &&
        b.def === a.def
      ) {
        return a.def.fields.every((field) =>
          this.equalsValue(
            a.fields.get(field.name) ?? null,
            b.fields.get(field.name) ?? null,
          ),
        )
      }
      return false
    }
    if (typeof a === 'object' && a.kind === 'seq' && a.seq === 'carray')
      return false
    return valuesEqual(a, b)
  }

  markChanged(object: { ver: number }) {
    bump(object as never)
  }

  isStatement(stmt: Stmt) {
    return stmt.k !== 'empty'
  }
}

function isStringy(value: TV): boolean {
  if (value.t.k === 'string') return true
  const v = value.v
  return (
    typeof v === 'object' &&
    v !== null &&
    v.kind === 'str' &&
    v.jclass === undefined
  )
}

// Boxed values behave as their primitive type in arithmetic.
function unbox(value: TV): TV {
  const t = value.t
  if (
    (t.k === 'int' || t.k === 'float' || t.k === 'bool') &&
    t.boxed === true
  ) {
    const plain = { ...t } as CType & { boxed?: boolean }
    delete plain.boxed
    return tv(plain, value.v)
  }
  if (t.k === 'auto' && typeof value.v === 'number') return tv(T.int, value.v)
  if (t.k === 'auto' && typeof value.v === 'bigint') return tv(T.ll, value.v)
  return value
}

export function exceptionObject(cls: string, message: string): JObj {
  return {
    kind: 'jobj',
    cls,
    ver: 0,
    state: { message },
    describe: () =>
      message === '' ? `java.lang.${cls}` : `java.lang.${cls}: ${message}`,
  }
}

export { isAggregate, commonType }
