// Tree-walking interpreter for contest-style C++ that records a step after
// every statement, loop check and call. Behaviour follows g++ on a 64-bit
// judge; undefined behaviour that would silently corrupt a real run (out of
// range indexes, reading unset variables, overflow) is reported instead.

import type {
  ExecutionTrace,
  TraceAccess,
  TraceErrorKind,
  TraceEvent,
  TraceFrame,
  TraceLimits,
  TraceStep,
  TraceVariable,
  TraceWarning,
} from '../../trace'
import type {
  Declarator,
  Expr,
  FunctionDef,
  Program,
  Stmt,
  StructDef,
} from './ast'
import {
  ArithmeticError,
  binaryArith,
  commonType,
  compareArith,
  convertScalar,
  toJsNumber,
  truthy,
  unaryArith,
  type TV,
} from './arith'
import { formatFloat } from './format'
import {
  callLibrary,
  callMethod,
  libraryConstant,
  isLibraryFunction,
  scopedCall,
  scopedValue,
} from './library'
import {
  accessKey,
  asIter,
  cString,
  now,
  rangeValues,
  targetLength,
  tv,
} from './runtime'
import { Recorder, type RecorderDialect } from './snapshot'
import { intRange, sizeOf, T, typeName, type CType } from './types'
import {
  bump,
  copyValue,
  defaultCompare,
  isAggregate,
  keyOf,
  bound,
  valuesEqual,
  type CHeap,
  type CMap,
  type Comparator,
  type CSeq,
  type CSet,
  type CStr,
  type CStruct,
  type CTuple,
  type InitList,
  type Iter,
  type Origin,
  type Ref,
  type Scope,
  type Slot,
  type Value,
} from './values'

export class RuntimeFailure extends Error {
  readonly kind: TraceErrorKind
  readonly title: string
  readonly details: string[] | undefined
  // Java: the exception object a catch block receives.
  thrown?: Value
  // The error step, captured before the stack unwinds to look for a catch.
  captured?: TraceStep

  constructor(
    kind: TraceErrorKind,
    title: string,
    message: string,
    details?: string[],
  ) {
    super(message)
    this.kind = kind
    this.title = title
    this.details = details
  }
}

class ExitSignal extends Error {
  readonly code: number
  constructor(code: number) {
    super(`exit(${code})`)
    this.code = code
  }
}

const NORMAL = 0
const BREAK = 1
const CONTINUE = 2
const RETURN = 3
type Completion = 0 | 1 | 2 | 3

// Largest single container and total array cells the visualizer allocates.
const MAX_CONTAINER = 5_000_000
const MAX_CELLS = 30_000_000
const MAX_DEPTH = 20_000
const LAZY_ROWS_ABOVE = 200_000
const MAX_ACCESSES = 24
const MAX_NOTES = 4
const MAX_WARNINGS = 60

export type Activation = {
  id: number
  name: string
  scope: Scope
  line: number
  self: CStruct | null
  fn: FunctionDef | null
  // Set by a return statement (already converted to the return type and
  // recorded as the return step) for the function to pick up.
  result: TV | null
}

type CallRequest = {
  fn: FunctionDef
  slots: Slot[]
  self: CStruct | null
  env: Scope | null
  name: string
}

// Statement generators yield call requests and receive the call's result.
type Gen<R> = Generator<CallRequest, R, TV>

type StepExtra = {
  cond?: boolean
  loop?: { line: number; iteration: number }
  value?: TV
}

export type MethodResult = TV | { ref: Ref }

const isInitList = (value: Value): value is InitList =>
  typeof value === 'object' && value !== null && value.kind === 'initlist'

export class Interpreter {
  readonly recorder: Recorder
  readonly steps: TraceStep[] = []
  readonly warnings: TraceWarning[] = []
  readonly globals: Scope = { vars: new Map(), parent: null, frame: 0 }
  readonly stack: Activation[]
  current: Activation

  readonly stdin: string
  inPos = 0
  inFail = false
  protected readonly outChunks: string[] = []
  outLength = 0
  err = ''
  readonly coutState = {
    precision: 6,
    float: 'general' as 'general' | 'fixed' | 'scientific',
    boolalpha: false,
    width: 0,
    fill: ' ',
    left: false,
  }

  line = 0
  quiet = 0
  totalSteps = 0
  truncated = false
  protected recording = true
  protected ops = 0
  protected readonly deadline: number
  protected nextFrame = 1
  protected pendingReads: TraceAccess[] = []
  protected pendingWrites: TraceAccess[] = []
  protected pendingNotes: string[] = []
  protected readonly warningKeys = new Set<string>()
  protected readonly staticSlots = new Map<Declarator, Slot>()
  cells = 0
  randState = 1
  // A labelled break/continue travelling out to its loop.
  protected pendingLabel: string | null = null
  // Active try blocks; with none, an error ends the run where it happened.
  protected tryDepth = 0

  readonly program: Program
  readonly limits: TraceLimits

  constructor(
    program: Program,
    input: string,
    limits: TraceLimits,
    dialect?: RecorderDialect,
  ) {
    this.program = program
    this.limits = limits
    this.stdin = input
    this.deadline = now() + limits.timeMs
    // Heaps are recorded in their real array layout (item i has children
    // 2i+1 and 2i+2), so the visualizer can draw the actual tree.
    this.recorder = new Recorder((items) => items, dialect)
    const globalActivation: Activation = {
      id: 0,
      name: 'global',
      scope: this.globals,
      line: 0,
      self: null,
      fn: null,
      result: null,
    }
    this.stack = [globalActivation]
    this.current = globalActivation
  }

  // ---- entry ----------------------------------------------------------------

  run(): Pick<
    ExecutionTrace,
    | 'status'
    | 'error'
    | 'stdout'
    | 'stderr'
    | 'steps'
    | 'values'
    | 'truncated'
    | 'totalSteps'
    | 'warnings'
  > {
    let status: 'finished' | 'error' = 'finished'
    let error: ExecutionTrace['error']
    try {
      const result = this.drive(this.programG())
      const code = toJsNumber(result.v)
      if (code !== 0) {
        this.addWarning(
          this.line,
          `main returned ${code}; a judge treats a non-zero exit code as a runtime error.`,
        )
      }
    } catch (caught) {
      if (caught instanceof ExitSignal) {
        if (caught.code !== 0) {
          this.addWarning(
            this.line,
            `exit(${caught.code}) was called; a judge treats a non-zero exit code as a runtime error.`,
          )
        }
      } else {
        status = 'error'
        const failure = this.toFailure(caught)
        error = {
          kind: failure.kind,
          title: failure.title,
          message: failure.message,
          line: this.line,
        }
        if (failure.details !== undefined) error.details = failure.details
        this.quiet = 0
        if (failure.captured !== undefined) {
          error.line = failure.captured.line
          this.steps.push(failure.captured)
        } else {
          this.pushStep('error', this.line, {})
        }
      }
    }
    const result: ReturnType<Interpreter['run']> = {
      status,
      stdout: this.outChunks.join(''),
      stderr: this.err,
      steps: this.steps,
      values: this.recorder.values,
      truncated: this.truncated,
      totalSteps: this.totalSteps,
      warnings: this.warnings,
    }
    if (error !== undefined) result.error = error
    return result
  }

  protected toFailure(caught: unknown): RuntimeFailure {
    if (caught instanceof RuntimeFailure) return caught
    if (caught instanceof ArithmeticError) {
      const zero = caught.message.includes('zero')
      return new RuntimeFailure(
        'runtime',
        zero ? 'Division by zero' : 'Invalid arithmetic',
        caught.message,
        zero
          ? [
              'The right-hand side of / or % was 0.',
              'A real run would crash with a floating point exception (SIGFPE).',
            ]
          : undefined,
      )
    }
    if (caught instanceof RangeError && /call stack/i.test(caught.message)) {
      return new RuntimeFailure(
        'recursion',
        'Recursion too deep',
        `The recursion went ${this.stack.length - 1} calls deep, more than the visualizer can follow.`,
        ['Check the base case, or try a smaller input.'],
      )
    }
    const message = caught instanceof Error ? caught.message : String(caught)
    return new RuntimeFailure(
      'internal',
      'The visualizer could not continue',
      message,
    )
  }

  // ---- steps ------------------------------------------------------------------

  tick() {
    this.ops += 1
    if ((this.ops & 1023) === 0 && now() > this.deadline) {
      throw new RuntimeFailure(
        'timeout',
        'Time limit reached',
        `The program ran for more than ${Math.round(this.limits.timeMs / 1000)} seconds.`,
        [
          'An infinite loop, or an input too large to follow step by step.',
          `${this.totalSteps.toLocaleString()} steps ran before it stopped.`,
        ],
      )
    }
  }

  step(event: TraceEvent, line: number, extra: StepExtra = {}) {
    this.totalSteps += 1
    this.tick()
    if (this.quiet > 0) return
    if (!this.recording) {
      this.clearPending()
      return
    }
    if (this.steps.length >= this.limits.maxSteps) {
      this.recording = false
      this.truncated = true
      this.clearPending()
      return
    }
    this.pushStep(event, line, extra)
  }

  protected clearPending() {
    this.pendingReads = []
    this.pendingWrites = []
    this.pendingNotes = []
  }

  protected pushStep(event: TraceEvent, line: number, extra: StepExtra) {
    const step: TraceStep = {
      event,
      line,
      frames: this.snapshotFrames(line),
      out: this.outLength,
      err: this.err.length,
      in: this.inPos,
    }
    if (extra.cond !== undefined) step.cond = extra.cond
    if (extra.loop !== undefined) step.loop = extra.loop
    if (extra.value !== undefined && extra.value.t.k !== 'void') {
      step.value = this.recorder.root(extra.value.v, extra.value.t)
    }
    if (this.pendingReads.length > 0) step.reads = this.pendingReads
    if (this.pendingWrites.length > 0) step.writes = this.pendingWrites
    if (this.pendingNotes.length > 0) {
      step.notes = this.pendingNotes
      for (const note of this.pendingNotes) {
        this.addWarning(line, note, this.steps.length)
      }
    }
    this.steps.push(step)
    this.clearPending()
  }

  protected addWarning(
    line: number,
    message: string,
    stepIndex = this.steps.length - 1,
  ) {
    const key = `${line}|${message.replace(/-?\d+/g, '#')}`
    if (this.warningKeys.has(key) || this.warnings.length >= MAX_WARNINGS)
      return
    this.warningKeys.add(key)
    this.warnings.push({ step: Math.max(0, stepIndex), line, message })
  }

  note(raw: string) {
    const message = this.decorateNote(raw)
    if (this.quiet > 0 && this.pendingNotes.length > 0) return
    if (
      this.pendingNotes.length < MAX_NOTES &&
      !this.pendingNotes.includes(message)
    ) {
      this.pendingNotes.push(message)
    }
    if (!this.recording) this.addWarning(this.line, message)
  }

  protected track(list: TraceAccess[], origin: Origin | undefined) {
    if (origin === undefined || origin.path.length === 0 || this.quiet > 0)
      return
    if (list.length >= MAX_ACCESSES) return
    const key = origin.path.join(',')
    if (
      list.some(
        (item) =>
          item.frame === origin.frame &&
          item.name === origin.name &&
          item.path.join(',') === key,
      )
    ) {
      return
    }
    list.push({
      frame: origin.frame,
      name: origin.name,
      path: [...origin.path],
    })
  }

  trackRead(origin: Origin | undefined) {
    this.track(this.pendingReads, origin)
  }

  trackWrite(origin: Origin | undefined) {
    this.track(this.pendingWrites, origin)
  }

  protected snapshotFrames(line: number): TraceFrame[] {
    const frames: TraceFrame[] = []
    const top = this.stack.length - 1
    const globalVars = this.scopeVariables(this.globals, 0)
    if (globalVars.length > 0 || top === 0) {
      frames.push({
        id: 0,
        name: 'global',
        line: top === 0 ? line : this.globalLine(),
        vars: globalVars,
      })
    }
    // Deep recursion keeps the outermost calls and the innermost ones.
    const innermost = 16
    const outermost = 3
    const hidden = top - innermost - outermost
    for (let i = 1; i <= top; i += 1) {
      if (hidden > 0 && i === outermost + 1) {
        frames.push({
          id: -1,
          name: `${hidden.toLocaleString()} more calls`,
          line: 0,
          vars: [],
          elided: true,
        })
        i += hidden - 1
        continue
      }
      const activation = this.stack[i]
      const frameLine = i === top ? line : activation.line
      const deep = top - i >= innermost
      frames.push({
        id: activation.id,
        name: activation.name,
        line: frameLine,
        vars: deep ? [] : this.activationVariables(activation),
        ...(deep ? { elided: true } : {}),
      })
    }
    return frames
  }

  protected globalLine(): number {
    return this.stack[0].line
  }

  protected scopeVariables(scope: Scope, frame: number): TraceVariable[] {
    const vars: TraceVariable[] = []
    for (const slot of scope.vars.values()) {
      if (slot.frame !== frame) continue
      vars.push([slot.name, this.slotSnapshot(slot)])
    }
    return vars
  }

  protected activationVariables(activation: Activation): TraceVariable[] {
    const scopes: Scope[] = []
    let scope: Scope | null = activation.scope
    while (scope !== null && scope.frame === activation.id) {
      scopes.unshift(scope)
      scope = scope.parent
    }
    const byName = new Map<string, number>()
    if (activation.self !== null) {
      byName.set(
        'this',
        this.recorder.root(activation.self, {
          k: 'struct',
          name: activation.self.def.name,
        }),
      )
    }
    for (const item of scopes) {
      for (const slot of item.vars.values()) {
        byName.set(slot.name, this.slotSnapshot(slot))
      }
    }
    return [...byName.entries()]
  }

  protected slotSnapshot(slot: Slot): number {
    if (slot.uninit === true) return this.recorder.unset()
    const value = slot.ref !== undefined ? slot.ref.peek() : slot.value
    return this.recorder.root(value, slot.type)
  }

  // ---- failures ------------------------------------------------------------------

  fail(title: string, message: string, details?: string[]): never {
    throw new RuntimeFailure('runtime', title, message, details)
  }

  failKind(
    kind: TraceErrorKind,
    title: string,
    message: string,
    details?: string[],
  ): never {
    throw new RuntimeFailure(kind, title, message, details)
  }

  unsupported(message: string): never {
    throw new RuntimeFailure(
      'unsupported',
      'Not supported by the visualizer',
      message,
    )
  }

  // ---- scopes and variables --------------------------------------------------------

  protected pushScope() {
    this.current.scope = {
      vars: new Map(),
      parent: this.current.scope,
      frame: this.current.id,
    }
  }

  protected popScope() {
    const parent = this.current.scope.parent
    if (parent !== null) this.current.scope = parent
  }

  protected setLine(line: number) {
    this.line = line
    this.current.line = line
  }

  findSlot(name: string): Slot | undefined {
    let scope: Scope | null = this.current.scope
    while (scope !== null) {
      const slot = scope.vars.get(name)
      if (slot !== undefined) return slot
      scope = scope.parent
    }
    return this.globals.vars.get(name)
  }

  slotRef(slot: Slot): Ref {
    const origin: Origin = { frame: slot.frame, name: slot.name, path: [] }
    return {
      type: slot.type,
      origin: slot.ref?.origin ?? origin,
      get: () => {
        if (slot.uninit === true) {
          slot.uninit = false
          this.note(
            `${slot.name} is used before it is given a value; in real C++ it would hold garbage.`,
          )
        }
        return slot.ref !== undefined ? slot.ref.get() : slot.value
      },
      peek: () => {
        return slot.ref !== undefined ? slot.ref.peek() : slot.value
      },
      set: (value: Value) => {
        slot.uninit = false
        if (slot.ref !== undefined) slot.ref.set(value)
        else slot.value = value
      },
    }
  }

  tempRef(initial: TV): Ref {
    let value = initial.v
    return {
      type: initial.t,
      get: () => value,
      peek: () => value,
      set: (next: Value) => {
        value = next
      },
    }
  }

  fieldRef(object: CStruct, name: string, origin?: Origin): Ref {
    const type = object.fieldTypes.get(name)
    if (type === undefined) {
      this.fail(
        'Unknown member',
        `${object.def.name} has no member named ${name}.`,
      )
    }
    const childOrigin =
      origin === undefined
        ? undefined
        : { ...origin, path: [...origin.path, name] }
    const ref: Ref = {
      type,
      get: () => {
        const value = object.fields.get(name) ?? null
        if (!isAggregate(value)) this.trackRead(childOrigin)
        return value
      },
      peek: () => object.fields.get(name) ?? null,
      set: (value: Value) => {
        this.trackWrite(childOrigin)
        object.fields.set(name, value)
        bump(object)
      },
    }
    if (childOrigin !== undefined) ref.origin = childOrigin
    return ref
  }

  tupleRef(tuple: CTuple, index: number, origin?: Origin): Ref {
    const label = tuple.pair
      ? index === 0
        ? 'first'
        : 'second'
      : String(index)
    const childOrigin =
      origin === undefined
        ? undefined
        : { ...origin, path: [...origin.path, label] }
    const ref: Ref = {
      type: tuple.types[index] ?? T.auto,
      readonly: tuple.keyLocked === true && index === 0,
      get: () => {
        const value = tuple.items[index] ?? null
        if (!isAggregate(value)) this.trackRead(childOrigin)
        return value
      },
      peek: () => tuple.items[index] ?? null,
      set: (value: Value) => {
        if (tuple.keyLocked === true && index === 0) {
          this.fail(
            'Cannot change a map key',
            'The key (first) of a map entry is read-only.',
          )
        }
        this.trackWrite(childOrigin)
        tuple.items[index] = value
        bump(tuple)
      },
    }
    if (childOrigin !== undefined) ref.origin = childOrigin
    return ref
  }

  seqRef(seq: CSeq, index: number, origin?: Origin): Ref {
    if (index + 1 > seq.touched) seq.touched = index + 1
    const childOrigin =
      origin === undefined
        ? undefined
        : { ...origin, path: [...origin.path, index] }
    const ref: Ref = {
      type: seq.elemType,
      get: () => {
        let value = seq.items[index] ?? null
        if (value === null && seq.lazyRows !== undefined)
          value = this.materializeRow(seq, index)
        if (!isAggregate(value)) this.trackRead(childOrigin)
        return value
      },
      peek: () => seq.items[index] ?? null,
      set: (value: Value) => {
        this.trackWrite(childOrigin)
        seq.items[index] = value
        bump(seq)
      },
    }
    if (childOrigin !== undefined) ref.origin = childOrigin
    return ref
  }

  materializeRow(seq: CSeq, index: number): CSeq {
    const lazy = seq.lazyRows
    if (lazy === undefined) this.fail('Internal', 'Missing row.')
    const row = lazy.make()
    seq.items[index] = row
    return row
  }

  strRef(str: CStr, index: number, origin?: Origin): Ref {
    const childOrigin =
      origin === undefined
        ? undefined
        : { ...origin, path: [...origin.path, index] }
    const ref: Ref = {
      type: T.char,
      get: () => {
        this.trackRead(childOrigin)
        return index < str.s.length ? str.s.charCodeAt(index) : 0
      },
      peek: () => (index < str.s.length ? str.s.charCodeAt(index) : 0),
      set: (value: Value) => {
        this.trackWrite(childOrigin)
        const code = ((toJsNumber(value) % 256) + 256) % 256
        str.s =
          str.s.slice(0, index) +
          String.fromCharCode(code) +
          str.s.slice(index + 1)
        bump(str)
      },
    }
    if (childOrigin !== undefined) ref.origin = childOrigin
    return ref
  }

  // ---- statements -----------------------------------------------------------------
  //
  // Statements run as generators. A user function call yields a request to
  // the driver, which runs the callee on its own generator, so deep C++
  // recursion lives on the heap instead of the JavaScript call stack.
  // Expressions without calls use the plain synchronous evaluator.

  drive<R>(root: Gen<R>): R {
    const stack: Gen<unknown>[] = [root]
    // Activation depth when each generator started, to unwind on a throw.
    const depths: number[] = [this.stack.length]
    let input: TV | undefined
    let thrown: unknown = undefined
    let throwing = false
    for (;;) {
      const top = stack[stack.length - 1]
      let result: IteratorResult<CallRequest, unknown>
      try {
        result = throwing ? top.throw(thrown) : top.next(input as TV)
        throwing = false
      } catch (error) {
        // Without a try block anywhere, the run ends here with the stack
        // intact, so the error step shows where it happened.
        if (!(error instanceof RuntimeFailure) || this.tryDepth === 0) {
          throw error
        }
        if (error.captured === undefined) error.captured = this.errorStep()
        const depth = depths[depths.length - 1] ?? 0
        this.stack.length = Math.max(1, depth)
        this.current = this.stack[this.stack.length - 1]
        stack.pop()
        depths.pop()
        if (stack.length === 0) throw error
        thrown = error
        throwing = true
        continue
      }
      if (result.done === true) {
        stack.pop()
        depths.pop()
        if (stack.length === 0) return result.value as R
        input = result.value as TV
      } else {
        depths.push(this.stack.length)
        stack.push(this.runFunction(result.value))
        input = undefined
      }
    }
  }

  // The error step for the current position (before any unwinding).
  protected errorStep(): TraceStep {
    return {
      event: 'error',
      line: this.line,
      frames: this.snapshotFrames(this.line),
      out: this.outLength,
      err: this.err.length,
      in: this.inPos,
    }
  }

  protected *programG(): Gen<TV> {
    for (const declaration of this.program.globals)
      yield* this.execG(declaration)
    const main = this.program.functions.get('main')?.[0]
    if (main === undefined) {
      throw new RuntimeFailure(
        'compile',
        'No main function',
        'Add a main() function.',
      )
    }
    return yield { fn: main, slots: [], self: null, env: null, name: 'main' }
  }

  protected *runFunction(request: CallRequest): Gen<TV> {
    const { fn, slots, self, env, name } = request
    if (this.stack.length > MAX_DEPTH) {
      this.failKind(
        'recursion',
        'Recursion too deep',
        `The call stack reached ${MAX_DEPTH.toLocaleString()} calls.`,
        [
          'A missing or wrong base case often causes this.',
          'On a judge this would be a stack overflow (runtime error).',
        ],
      )
    }
    const id = this.nextFrame
    this.nextFrame += 1
    const scope: Scope = { vars: new Map(), parent: env, frame: id }
    for (const slot of slots) {
      if (slot.name === '') continue
      slot.frame = id
      scope.vars.set(slot.name, slot)
    }
    const caller = this.current
    const activation: Activation = {
      id,
      name,
      scope,
      line: fn.line,
      self,
      fn,
      result: null,
    }
    this.stack.push(activation)
    this.current = activation
    this.setLine(fn.line)
    this.step('call', fn.line)
    if (fn.inits !== undefined && self !== null) {
      for (const init of fn.inits) {
        const type = self.fieldTypes.get(init.name)
        if (type === undefined)
          this.fail(
            'Unknown member',
            `${self.def.name} has no member ${init.name}.`,
          )
        const args: TV[] = []
        for (const arg of init.args) args.push(yield* this.evalG(arg))
        const single = args.length === 1 ? args[0] : null
        const value =
          single !== null && (isArithmeticType(type) || single.t.k === type.k)
            ? this.coerce(single, type)
            : this.construct(type, args, false)
        self.fields.set(init.name, value)
        bump(self)
      }
    }
    this.pushScope()
    let completion: Completion = NORMAL
    for (const stmt of fn.body.body) {
      completion = yield* this.execG(stmt)
      if (completion !== NORMAL) break
    }
    let result: TV
    if (completion === RETURN && activation.result !== null) {
      result = activation.result
    } else {
      // The function ran off its end; record it before its locals go out of
      // scope.
      result = this.returnResult(fn, name, null)
      this.setLine(fn.body.endLine)
      this.step('return', fn.body.endLine, { value: result })
    }
    this.popScope()
    this.stack.pop()
    this.current = caller
    return result
  }

  protected returnResult(
    fn: FunctionDef,
    name: string,
    returned: TV | null,
  ): TV {
    if (fn.returnType.k === 'void' || fn.isCtor === true)
      return tv(T.void, null)
    if (returned === null) {
      if (name === 'main') return tv(T.int, 0)
      this.note(
        `${name} ended without returning a value; the result is undefined in C++.`,
      )
      const type = fn.returnType.k === 'auto' ? T.int : fn.returnType
      return tv(type, this.defaultValue(type))
    }
    const type =
      fn.returnType.k === 'auto'
        ? this.decay(returned.t, returned.v)
        : fn.returnType
    return tv(type, this.coerce(returned, type))
  }

  protected *execG(stmt: Stmt): Gen<Completion> {
    this.tick()
    switch (stmt.k) {
      case 'block':
        return yield* this.execBlockG(stmt.body)
      case 'decl':
        this.setLine(stmt.line)
        for (const declarator of stmt.declarators) {
          yield* this.declareG(declarator, stmt.isStatic, this.current.id === 0)
        }
        this.step('line', stmt.line)
        return NORMAL
      case 'binding': {
        this.setLine(stmt.line)
        const source = stmt.isRef
          ? yield* this.evalRefG(stmt.init)
          : this.tempRef(this.copied(yield* this.evalG(stmt.init)))
        this.bindStructured(stmt.names, stmt.isRef, source)
        this.step('line', stmt.line)
        return NORMAL
      }
      case 'expr':
        this.setLine(stmt.line)
        yield* this.evalG(stmt.expr)
        this.step('line', stmt.line)
        return NORMAL
      case 'if':
        return yield* this.execIfG(stmt)
      case 'while':
        return yield* this.execWhileG(stmt)
      case 'do':
        return yield* this.execDoG(stmt)
      case 'for':
        return yield* this.execForG(stmt)
      case 'rangefor':
        return yield* this.execRangeForG(stmt)
      case 'return': {
        this.setLine(stmt.line)
        const value =
          stmt.value === undefined ? null : yield* this.evalG(stmt.value)
        const activation = this.current
        const result =
          activation.fn === null
            ? tv(T.void, null)
            : this.returnResult(activation.fn, activation.name, value)
        activation.result = result
        // Recorded here, while the function's local variables are in scope.
        this.step('return', stmt.line, { value: result })
        return RETURN
      }
      case 'break':
        this.setLine(stmt.line)
        this.step('line', stmt.line)
        this.pendingLabel = stmt.label ?? null
        return BREAK
      case 'continue':
        this.setLine(stmt.line)
        this.step('line', stmt.line)
        this.pendingLabel = stmt.label ?? null
        return CONTINUE
      case 'try':
        return yield* this.execTryG(stmt)
      case 'throw':
        this.setLine(stmt.line)
        return this.throwValue(yield* this.evalG(stmt.value))
      case 'switch':
        return yield* this.execSwitchG(stmt)
      case 'empty':
      case 'local-struct':
        return NORMAL
    }
  }

  protected copied(value: TV): TV {
    return { t: value.t, v: this.storeCopy(value.v) }
  }

  // ---- dialect hooks (the Java interpreter overrides these) ----------------

  // Storing a value into a variable, element or parameter: C++ copies
  // aggregates, Java and pointers share the object.
  protected storeCopy(value: Value): Value {
    return copyValue(value)
  }

  // An explicit cast narrows silently: the programmer asked for it.
  protected castValue(value: TV, type: CType): Value {
    const v = value.v
    if (
      (type.k === 'int' || type.k === 'float' || type.k === 'bool') &&
      (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean')
    ) {
      return convertScalar(v, value.t, type)
    }
    return this.coerce(value, type)
  }

  // The value of a variable or field declared without an initializer.
  protected zeroValue(type: CType): Value {
    return this.defaultValue(type)
  }

  // Extra scope a method of this object sees (Java anonymous classes).
  protected methodEnv(object: CStruct): Scope | null {
    void object
    return null
  }

  protected coerceNull(type: CType): Value {
    return this.defaultValue(type)
  }

  protected dispatchMethod(
    ref: Ref,
    object: Value,
    name: string,
    args: Expr[],
    call: Expr & { k: 'call' },
  ): MethodResult {
    return callMethod(this, ref, object, name, args, call)
  }

  protected dispatchLibrary(
    name: string,
    args: Expr[],
    call: Expr & { k: 'call' },
  ): MethodResult | undefined {
    return callLibrary(this, name, args, call)
  }

  protected dispatchScopedCall(
    callee: Expr & { k: 'scoped' },
    args: Expr[],
    call: Expr & { k: 'call' },
  ): MethodResult {
    return scopedCall(this, callee, args, call)
  }

  protected dispatchScopedValue(expr: Expr & { k: 'scoped' }): TV {
    return scopedValue(this, expr)
  }

  protected dispatchConstant(name: string): TV | undefined {
    return libraryConstant(this, name)
  }

  protected isLibraryName(name: string): boolean {
    return isLibraryFunction(name)
  }

  protected switchMatches(value: TV, candidate: TV): boolean {
    return compareArith('==', value, candidate)
  }

  protected decorateNote(message: string): string {
    if (message.startsWith('Signed overflow')) {
      return message.replace(/\.$/, ' (undefined behaviour in C++).')
    }
    return message
  }

  // What a loop does after its body completes: keep looping, or leave with a
  // completion (labelled break/continue aimed at an outer loop propagate).
  protected afterBody(
    completion: Completion,
    label: string | undefined,
  ): Completion | null {
    if (completion === NORMAL) return null
    if (completion === RETURN) return RETURN
    const target = this.pendingLabel
    if (target !== null && target !== label) return completion
    this.pendingLabel = null
    return completion === BREAK ? NORMAL : null
  }

  protected *execTryG(stmt: Stmt & { k: 'try' }): Gen<Completion> {
    const activation = this.current
    const scope = activation.scope
    const stackDepth = this.stack.length
    let completion: Completion = NORMAL
    let pending: unknown = null
    this.tryDepth += 1
    let inTry = true
    try {
      completion = yield* this.execBlockG(stmt.block.body)
    } catch (error) {
      this.tryDepth -= 1
      inTry = false
      this.stack.length = stackDepth
      this.current = activation
      activation.scope = scope
      const handler =
        error instanceof RuntimeFailure
          ? stmt.catches.find((item) =>
              item.types.some((type) => this.catches(type, error)),
            )
          : undefined
      if (handler === undefined || !(error instanceof RuntimeFailure)) {
        pending = error
      } else {
        this.pushScope()
        this.current.scope.vars.set(handler.name, {
          name: handler.name,
          type: { k: 'struct', name: error.title },
          value: this.exceptionValue(error),
          frame: this.current.id,
        })
        this.setLine(handler.line)
        this.note(`Caught ${error.title}: ${error.message}`)
        this.step('line', handler.line)
        try {
          completion = yield* this.execBlockG(handler.body.body)
        } catch (inner) {
          pending = inner
        }
        this.popScope()
      }
    } finally {
      if (inTry) this.tryDepth -= 1
    }
    if (stmt.finally !== undefined) {
      const finalCompletion = yield* this.execBlockG(stmt.finally.body)
      if (finalCompletion !== NORMAL) return finalCompletion
    }
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrows what the try block threw
    if (pending !== null) throw pending
    return completion
  }

  // Whether `catch (type e)` handles this failure. Only the Java dialect
  // produces try statements.
  protected catches(type: string, failure: RuntimeFailure): boolean {
    void failure
    return type === 'Exception' || type === 'Throwable'
  }

  protected exceptionValue(failure: RuntimeFailure): Value {
    return { kind: 'str', s: failure.message, ver: 0 }
  }

  protected throwValue(value: TV): never {
    void value
    this.unsupported('throw is not supported here.')
  }

  protected *execBlockG(body: Stmt[]): Gen<Completion> {
    this.pushScope()
    for (const stmt of body) {
      const result = yield* this.execG(stmt)
      if (result !== NORMAL) {
        this.popScope()
        return result
      }
    }
    this.popScope()
    return NORMAL
  }

  protected *conditionG(cond: Expr | Stmt): Gen<boolean> {
    if ('declarators' in cond) {
      const declaration = cond
      for (const declarator of declaration.declarators) {
        yield* this.declareG(declarator, false, false)
      }
      const last = declaration.declarators.at(-1)
      const slot = last === undefined ? undefined : this.findSlot(last.name)
      return slot === undefined
        ? false
        : this.truth(tv(slot.type, this.slotRef(slot).get()))
    }
    return this.truth(yield* this.evalG(cond as Expr))
  }

  truth(value: TV): boolean {
    const v = value.v
    if (typeof v === 'object' && v !== null) {
      if (v.kind === 'stream') return !this.inFail
      if (v.kind === 'iter') return true
    }
    return truthy(v)
  }

  protected *execIfG(stmt: Stmt & { k: 'if' }): Gen<Completion> {
    const scoped = stmt.init !== undefined || !isExprNode(stmt.cond)
    if (scoped) this.pushScope()
    if (stmt.init !== undefined) yield* this.execQuietG(stmt.init)
    this.setLine(stmt.line)
    const result = yield* this.conditionG(stmt.cond)
    this.step('line', stmt.line, { cond: result })
    let completion: Completion = NORMAL
    if (result) completion = yield* this.execG(stmt.then)
    else if (stmt.else !== undefined) completion = yield* this.execG(stmt.else)
    if (scoped) this.popScope()
    return completion
  }

  protected *execQuietG(stmt: Stmt): Gen<void> {
    if (stmt.k === 'decl') {
      for (const declarator of stmt.declarators) {
        yield* this.declareG(declarator, stmt.isStatic, false)
      }
    } else if (stmt.k === 'expr') {
      yield* this.evalG(stmt.expr)
    } else {
      yield* this.execG(stmt)
    }
  }

  protected *execWhileG(stmt: Stmt & { k: 'while' }): Gen<Completion> {
    let iteration = 0
    for (;;) {
      this.setLine(stmt.line)
      const declared = !isExprNode(stmt.cond)
      if (declared) this.pushScope()
      const result = yield* this.conditionG(stmt.cond)
      if (result) iteration += 1
      this.step('line', stmt.line, {
        cond: result,
        loop: { line: stmt.line, iteration },
      })
      if (!result) {
        if (declared) this.popScope()
        return NORMAL
      }
      const completion = yield* this.execG(stmt.body)
      if (declared) this.popScope()
      const exit = this.afterBody(completion, stmt.label)
      if (exit !== null) return exit
    }
  }

  protected *execDoG(stmt: Stmt & { k: 'do' }): Gen<Completion> {
    let iteration = 1
    for (;;) {
      const completion = yield* this.execG(stmt.body)
      const exit = this.afterBody(completion, stmt.label)
      if (exit !== null) return exit
      this.setLine(stmt.whileLine)
      const result = this.truth(yield* this.evalG(stmt.cond))
      if (result) iteration += 1
      this.step('line', stmt.whileLine, {
        cond: result,
        loop: { line: stmt.whileLine, iteration },
      })
      if (!result) return NORMAL
    }
  }

  protected *execForG(stmt: Stmt & { k: 'for' }): Gen<Completion> {
    this.pushScope()
    this.setLine(stmt.line)
    if (stmt.init !== undefined) yield* this.execQuietG(stmt.init)
    let iteration = 0
    let first = true
    for (;;) {
      this.setLine(stmt.line)
      if (!first && stmt.update !== undefined) yield* this.evalG(stmt.update)
      first = false
      const result =
        stmt.cond === undefined
          ? true
          : this.truth(yield* this.evalG(stmt.cond))
      if (result) iteration += 1
      this.step('line', stmt.line, {
        cond: result,
        loop: { line: stmt.line, iteration },
      })
      if (!result) break
      const completion = yield* this.execG(stmt.body)
      const exit = this.afterBody(completion, stmt.label)
      if (exit !== null) {
        this.popScope()
        return exit
      }
    }
    this.popScope()
    return NORMAL
  }

  protected iterationRefs(
    container: Value,
    origin?: Origin,
  ): { count: number; at: (i: number) => Ref } {
    if (typeof container !== 'object' || container === null) {
      this.fail('Cannot iterate', 'A range-based for loop needs a container.')
    }
    switch (container.kind) {
      case 'seq': {
        const count = container.items.length
        if (container.seq === 'stack' || container.seq === 'queue') {
          this.fail(
            'Cannot iterate',
            `A ${container.seq} cannot be iterated with a range-based for loop.`,
          )
        }
        return { count, at: (i) => this.seqRef(container, i, origin) }
      }
      case 'str':
        return {
          count: container.s.length,
          at: (i) => this.strRef(container, i, origin),
        }
      case 'map': {
        const entries = [...container.entries]
        return {
          count: entries.length,
          at: (i) => {
            const entry = entries[i]
            return {
              type: {
                k: 'pair',
                first: container.type.key,
                second: container.type.value,
              },
              get: () => entry,
              peek: () => entry,
              set: () =>
                this.fail(
                  'Cannot assign',
                  'A map entry cannot be replaced while iterating.',
                ),
            }
          },
        }
      }
      case 'set': {
        const items = [...container.items]
        return {
          count: items.length,
          at: (i) => ({
            type: container.type.elem,
            readonly: true,
            get: () => items[i] ?? null,
            peek: () => items[i] ?? null,
            set: () =>
              this.fail('Cannot assign', 'Set elements are read-only.'),
          }),
        }
      }
      case 'initlist': {
        const items = container.items
        return { count: items.length, at: (i) => this.tempRef(items[i]) }
      }
      case 'bitset':
        return {
          count: container.bits.length,
          at: (i) => this.tempRef(tv(T.bool, container.bits[i] ?? false)),
        }
      default:
        this.fail(
          'Cannot iterate',
          `A ${container.kind} cannot be iterated with a range-based for loop.`,
        )
    }
  }

  protected bindStructured(names: string[], byRef: boolean, source: Ref) {
    const value = source.get()
    const refs: Ref[] = []
    if (typeof value === 'object' && value !== null) {
      if (value.kind === 'tuple') {
        value.items.forEach((_, index) =>
          refs.push(this.tupleRef(value, index, source.origin)),
        )
      } else if (value.kind === 'struct') {
        for (const name of value.fields.keys())
          refs.push(this.fieldRef(value, name, source.origin))
      } else if (value.kind === 'seq') {
        value.items.forEach((_, index) =>
          refs.push(this.seqRef(value, index, source.origin)),
        )
      }
    }
    if (refs.length !== names.length) {
      this.fail(
        'Structured binding mismatch',
        `Cannot unpack ${refs.length} values into [${names.join(', ')}].`,
      )
    }
    names.forEach((name, index) => {
      const ref = refs[index]
      const type = this.decay(ref.type, ref.peek())
      const slot: Slot = byRef
        ? { name, type, value: null, ref, frame: this.current.id }
        : {
            name,
            type,
            value: this.storeCopy(ref.get()),
            frame: this.current.id,
          }
      this.current.scope.vars.set(name, slot)
    })
  }

  protected *execRangeForG(stmt: Stmt & { k: 'rangefor' }): Gen<Completion> {
    this.setLine(stmt.line)
    const iterableRef = yield* this.evalRefG(stmt.iterable)
    const container = iterableRef.get()
    const { count, at } = this.iterationRefs(container, iterableRef.origin)
    let iteration = 0
    for (let i = 0; i < count; i += 1) {
      // A vector that shrinks while being iterated.
      if (
        typeof container === 'object' &&
        container !== null &&
        container.kind === 'seq' &&
        i >= container.items.length
      )
        break
      iteration += 1
      this.pushScope()
      const ref = at(i)
      if (stmt.names !== undefined) {
        this.bindStructured(stmt.names, stmt.isRef, ref)
      } else if (stmt.name !== undefined) {
        const type =
          stmt.type.k === 'auto' ? this.decay(ref.type, ref.peek()) : stmt.type
        const slot: Slot = stmt.isRef
          ? { name: stmt.name, type, value: null, ref, frame: this.current.id }
          : {
              name: stmt.name,
              type,
              value: this.coerce(tv(ref.type, ref.get()), type),
              frame: this.current.id,
            }
        this.current.scope.vars.set(stmt.name, slot)
      }
      this.setLine(stmt.line)
      this.step('line', stmt.line, {
        cond: true,
        loop: { line: stmt.line, iteration },
      })
      const completion = yield* this.execG(stmt.body)
      this.popScope()
      const exit = this.afterBody(completion, stmt.label)
      if (exit !== null) return exit
    }
    this.setLine(stmt.line)
    this.step('line', stmt.line, {
      cond: false,
      loop: { line: stmt.line, iteration },
    })
    return NORMAL
  }

  protected *execSwitchG(stmt: Stmt & { k: 'switch' }): Gen<Completion> {
    this.setLine(stmt.line)
    const value = yield* this.evalG(stmt.value)
    this.step('line', stmt.line)
    let start = -1
    let fallback = -1
    for (let index = 0; index < stmt.cases.length && start < 0; index += 1) {
      const item = stmt.cases[index]
      if (item.values === null) {
        fallback = index
        continue
      }
      for (const expr of item.values) {
        if (this.switchMatches(value, this.eval(expr))) {
          start = index
          break
        }
      }
    }
    if (start < 0) start = fallback
    if (start < 0) return NORMAL
    this.pushScope()
    for (let i = start; i < stmt.cases.length; i += 1) {
      for (const inner of stmt.cases[i].body) {
        const completion = yield* this.execG(inner)
        if (completion === BREAK) {
          this.popScope()
          if (this.pendingLabel !== null && this.pendingLabel !== stmt.label) {
            return BREAK
          }
          this.pendingLabel = null
          return NORMAL
        }
        if (completion !== NORMAL) {
          this.popScope()
          return completion
        }
      }
    }
    this.popScope()
    return NORMAL
  }

  // ---- expressions that may call user code ---------------------------------------------

  protected hasCall(expr: Expr): boolean {
    const cached = callCache.get(expr)
    if (cached !== undefined) return cached
    const result = containsCall(expr)
    callCache.set(expr, result)
    return result
  }

  protected preval(ref: Ref, line: number): Expr {
    return { k: 'preval', line, ref }
  }

  protected *prevalG(expr: Expr): Gen<Expr> {
    if (!this.hasCall(expr)) return expr
    return this.preval(yield* this.evalRefG(expr), expr.line)
  }

  *evalG(expr: Expr): Gen<TV> {
    if (!this.hasCall(expr)) return this.eval(expr)
    switch (expr.k) {
      case 'call': {
        const result = yield* this.callG(expr)
        return 'ref' in result ? tv(result.ref.type, result.ref.get()) : result
      }
      case 'logical': {
        const left = this.truth(yield* this.evalG(expr.left))
        if (expr.op === '&&' ? !left : left) return tv(T.bool, left)
        return tv(T.bool, this.truth(yield* this.evalG(expr.right)))
      }
      case 'ternary': {
        const cond = this.truth(yield* this.evalG(expr.cond))
        const value = yield* this.evalG(cond ? expr.yes : expr.no)
        const branch = this.preval(this.tempRef(value), expr.line)
        const literal: Expr = { k: 'bool', line: expr.line, value: cond }
        return this.eval(
          cond
            ? { ...expr, cond: literal, yes: branch }
            : { ...expr, cond: literal, no: branch },
        )
      }
      case 'comma':
        yield* this.evalG(expr.left)
        return yield* this.evalG(expr.right)
      case 'assign':
      case 'index':
      case 'member': {
        const ref = yield* this.evalRefG(expr)
        return tv(ref.type, ref.get())
      }
      case 'binary': {
        const left = yield* this.prevalG(expr.left)
        const right = yield* this.prevalG(expr.right)
        return this.eval({ ...expr, left, right })
      }
      case 'unary':
      case 'postfix':
        return this.eval({
          ...expr,
          operand: yield* this.prevalG(expr.operand),
        })
      case 'cast':
        return this.eval({ ...expr, expr: yield* this.prevalG(expr.expr) })
      case 'construct': {
        const args: Expr[] = []
        for (const arg of expr.args) args.push(yield* this.prevalG(arg))
        return this.eval({ ...expr, args })
      }
      case 'initlist': {
        const items: Expr[] = []
        for (const item of expr.items) items.push(yield* this.prevalG(item))
        return this.eval({ ...expr, items })
      }
      default:
        return this.eval(expr)
    }
  }

  *evalRefG(expr: Expr): Gen<Ref> {
    if (!this.hasCall(expr)) return this.evalRef(expr)
    switch (expr.k) {
      case 'call': {
        const result = yield* this.callG(expr)
        return 'ref' in result ? result.ref : this.tempRef(result)
      }
      case 'index': {
        const object = yield* this.prevalG(expr.object)
        const index = yield* this.prevalG(expr.index)
        return this.evalRef({ ...expr, object, index })
      }
      case 'member':
        return this.evalRef({
          ...expr,
          object: yield* this.prevalG(expr.object),
        })
      case 'unary':
        return this.evalRef({
          ...expr,
          operand: yield* this.prevalG(expr.operand),
        })
      case 'assign': {
        const target = yield* this.prevalG(expr.target)
        const value = yield* this.prevalG(expr.value)
        return this.evalRef({ ...expr, target, value })
      }
      case 'ternary': {
        const cond = this.truth(yield* this.evalG(expr.cond))
        return yield* this.evalRefG(cond ? expr.yes : expr.no)
      }
      case 'comma':
        yield* this.evalG(expr.left)
        return yield* this.evalRefG(expr.right)
      default:
        return this.tempRef(yield* this.evalG(expr))
    }
  }

  protected *prevalArgsG(args: Expr[]): Gen<Expr[]> {
    const result: Expr[] = []
    for (const arg of args) result.push(yield* this.prevalG(arg))
    return result
  }

  protected *callG(expr: Expr & { k: 'call' }): Gen<MethodResult> {
    const callee = expr.callee
    if (callee.k === 'member') {
      if (callee.object.k === 'this') {
        const self = this.current.self
        if (self === null)
          this.fail('No this', 'this is only available inside a struct method.')
        return yield* this.structMethodG(self, callee.name, expr.args)
      }
      let objectRef = yield* this.evalRefG(callee.object)
      let object = objectRef.get()
      if (
        callee.arrow &&
        typeof object === 'object' &&
        object !== null &&
        object.kind === 'iter'
      ) {
        objectRef = this.deref(tv(T.iterator, object))
        object = objectRef.get()
      }
      if (
        typeof object === 'object' &&
        object !== null &&
        object.kind === 'struct'
      ) {
        const field = object.fields.get(callee.name)
        if (field !== undefined && !object.def.methods.has(callee.name)) {
          return yield* this.callValueG(field, expr.args, callee.name)
        }
        return yield* this.structMethodG(object, callee.name, expr.args)
      }
      const args = yield* this.prevalArgsG(expr.args)
      return this.dispatchMethod(objectRef, object, callee.name, args, {
        ...expr,
        args,
      })
    }
    if (callee.k === 'ident') {
      const name = callee.name
      const slot = this.findSlot(name)
      if (slot !== undefined) {
        return yield* this.callValueG(this.slotRef(slot).get(), expr.args, name)
      }
      const self = this.current.self
      if (self !== null) {
        if (self.def.methods.has(name))
          return yield* this.structMethodG(self, name, expr.args)
        const field = self.fields.get(name)
        if (field !== undefined)
          return yield* this.callValueG(field, expr.args, name)
      }
      const overloads = this.program.functions.get(name)
      if (overloads !== undefined) {
        const fn = this.pickOverload(overloads, expr.args.length, name)
        return yield* this.userCallG(fn, expr.args, null, null, name)
      }
      const args = yield* this.prevalArgsG(expr.args)
      const library = this.dispatchLibrary(name, args, { ...expr, args })
      if (library !== undefined) return library
      this.line = expr.line
      throw new RuntimeFailure(
        'compile',
        'Unknown function',
        `'${name}' was not declared.`,
      )
    }
    if (callee.k === 'scoped') {
      const args = yield* this.prevalArgsG(expr.args)
      return this.dispatchScopedCall(callee, args, { ...expr, args })
    }
    const value = yield* this.evalG(callee)
    return yield* this.callValueG(value.v, expr.args, 'function')
  }

  protected *structMethodG(
    object: CStruct,
    name: string,
    args: Expr[],
  ): Gen<TV> {
    const overloads = object.def.methods.get(name)
    if (overloads === undefined) {
      this.fail(
        'Unknown method',
        `${object.def.name} has no method named ${name}.`,
      )
    }
    const fn = this.pickOverload(
      overloads,
      args.length,
      `${object.def.name}::${name}`,
    )
    return yield* this.userCallG(
      fn,
      args,
      object,
      this.methodEnv(object),
      `${object.def.name}.${name}`,
    )
  }

  protected *callValueG(value: Value, args: Expr[], name: string): Gen<TV> {
    if (typeof value === 'object' && value !== null) {
      if (value.kind === 'func') {
        return yield* this.userCallG(
          value.fn,
          args,
          value.self,
          value.env,
          value.name === 'lambda' ? name : value.name,
        )
      }
      if (value.kind === 'struct')
        return yield* this.structMethodG(value, 'operator()', args)
    }
    const prepared = yield* this.prevalArgsG(args)
    return this.callValueWithExprs(value, prepared, name)
  }

  protected *userCallG(
    fn: FunctionDef,
    args: Expr[],
    self: CStruct | null,
    env: Scope | null,
    name: string,
  ): Gen<TV> {
    const slots: Slot[] = []
    for (let index = 0; index < fn.params.length; index += 1) {
      const param = fn.params[index]
      const expr = args[index] ?? param.defaultValue
      if (expr === undefined) {
        this.fail(
          'Missing argument',
          `${name} needs a value for ${param.name || `argument ${index + 1}`}.`,
        )
      }
      if (param.isRef) {
        const ref = yield* this.evalRefG(expr)
        const type =
          param.type.k === 'auto' ||
          (param.type.k === 'carray' && param.type.size === null)
            ? this.decay(ref.type, ref.peek())
            : param.type
        slots.push({ name: param.name, type, value: null, ref, frame: 0 })
        continue
      }
      const value = yield* this.evalG(expr)
      const type =
        param.type.k === 'auto' ? this.decay(value.t, value.v) : param.type
      slots.push({
        name: param.name,
        type,
        value: this.coerce(value, type),
        frame: 0,
      })
    }
    return yield { fn, slots, self, env, name }
  }

  protected *declareG(
    d: Declarator,
    isStatic: boolean,
    isGlobal: boolean,
  ): Gen<void> {
    if (isStatic && !isGlobal && this.staticSlots.has(d)) {
      this.declare(d, isStatic, isGlobal)
      return
    }
    let prepared: Declarator = d
    const init = d.init
    if (init !== undefined) {
      if (init.form === 'assign') {
        prepared = {
          ...d,
          init: { form: 'assign', expr: yield* this.prevalG(init.expr) },
        }
      } else if (init.form === 'ctor') {
        prepared = {
          ...d,
          init: { form: 'ctor', args: yield* this.prevalArgsG(init.args) },
        }
      } else {
        prepared = {
          ...d,
          init: { form: 'list', items: yield* this.prevalArgsG(init.items) },
        }
      }
    }
    if (d.dims !== undefined) {
      const dims: (Expr | null)[] = []
      for (const dim of d.dims)
        dims.push(dim === null ? null : yield* this.prevalG(dim))
      prepared = { ...prepared, dims }
    }
    this.declare(prepared, isStatic, isGlobal, d)
  }

  // ---- declarations -------------------------------------------------------------------

  protected declare(
    d: Declarator,
    isStatic: boolean,
    isGlobal: boolean,
    key: Declarator = d,
  ) {
    const scope = this.current.scope
    if (isStatic && !isGlobal) {
      const existing = this.staticSlots.get(key)
      if (existing !== undefined) {
        scope.vars.set(d.name, existing)
        return
      }
    }
    const zeroed = isGlobal || isStatic
    let slot: Slot
    if (d.dims !== undefined) {
      const { value, type } = this.makeCArray(d.type, d.dims, d.init, d.line)
      slot = { name: d.name, type, value, frame: scope.frame }
    } else if (d.isRef) {
      if (d.init === undefined || d.init.form !== 'assign') {
        this.fail(
          'Reference without a value',
          `The reference ${d.name} must be initialized.`,
        )
      }
      const ref = this.evalRef(d.init.expr)
      const type =
        d.type.k === 'auto' ? this.decay(ref.type, ref.peek()) : d.type
      slot = { name: d.name, type, value: null, ref, frame: scope.frame }
    } else if (d.init === undefined) {
      const value = this.zeroValue(d.type)
      slot = { name: d.name, type: d.type, value, frame: scope.frame }
      if (
        !zeroed &&
        (d.type.k === 'int' ||
          d.type.k === 'float' ||
          d.type.k === 'bool' ||
          d.type.k === 'pointer')
      ) {
        slot.uninit = true
      }
    } else if (d.init.form === 'assign') {
      const value = this.eval(d.init.expr)
      const type = d.type.k === 'auto' ? this.decay(value.t, value.v) : d.type
      slot = {
        name: d.name,
        type,
        value: this.coerce(value, type),
        frame: scope.frame,
      }
    } else if (d.init.form === 'ctor') {
      const args = d.init.args.map((arg) => this.eval(arg))
      const type =
        d.type.k === 'auto' && args[0] !== undefined
          ? this.decay(args[0].t, args[0].v)
          : d.type
      slot = {
        name: d.name,
        type,
        value: this.construct(type, args, false),
        frame: scope.frame,
      }
    } else {
      const items = d.init.items.map((item) => this.eval(item))
      if (d.type.k === 'auto') {
        const first = items[0]
        if (items.length !== 1 || first === undefined) {
          this.unsupported(
            'auto with a braced list of several values is not supported.',
          )
        }
        slot = {
          name: d.name,
          type: this.decay(first.t, first.v),
          value: this.storeCopy(first.v),
          frame: scope.frame,
        }
      } else {
        slot = {
          name: d.name,
          type: d.type,
          value: this.construct(d.type, items, true),
          frame: scope.frame,
        }
      }
    }
    const value = slot.value
    if (
      typeof value === 'object' &&
      value !== null &&
      value.kind === 'func' &&
      value.name === 'lambda'
    ) {
      value.name = d.name
    }
    scope.vars.set(d.name, slot)
    if (isStatic && !isGlobal) this.staticSlots.set(key, slot)
  }

  decay(type: CType, value?: Value): CType {
    if (type.k === 'auto' && value !== undefined) return this.typeOfValue(value)
    return type
  }

  typeOfValue(value: Value): CType {
    if (typeof value === 'number') return T.int
    if (typeof value === 'bigint') return T.ll
    if (typeof value === 'boolean') return T.bool
    if (value === null) return T.auto
    switch (value.kind) {
      case 'str':
        return T.string
      case 'func':
      case 'builtin':
        return T.function
      case 'iter':
        return T.iterator
      case 'struct':
        return { k: 'struct', name: value.def.name }
      case 'tuple':
        return value.pair
          ? {
              k: 'pair',
              first: value.types[0] ?? T.auto,
              second: value.types[1] ?? T.auto,
            }
          : { k: 'tuple', items: value.types }
      case 'seq':
        return value.seq === 'carray'
          ? { k: 'carray', elem: value.elemType, size: value.items.length }
          : value.seq === 'stdarray'
            ? { k: 'stdarray', elem: value.elemType, size: value.items.length }
            : { k: value.seq, elem: value.elemType }
      case 'map':
        return value.type
      case 'set':
        return value.type
      case 'heap':
        return { k: 'pq', elem: value.elemType, cmp: null }
      case 'functor':
        return { k: 'functor', name: value.name }
      case 'bitset':
        return { k: 'bitset', size: value.bits.length }
      default:
        return T.auto
    }
  }

  protected makeCArray(
    base: CType,
    dims: (Expr | null)[],
    init: Declarator['init'],
    line: number,
  ): { value: CSeq; type: CType } {
    const sizes = dims.map((dim) =>
      dim === null ? null : this.toIndex(this.eval(dim), 'Array size'),
    )
    if (sizes[0] === null) {
      if (init === undefined)
        this.fail(
          'Array size missing',
          'An array without a size needs an initializer.',
        )
      if (init.form === 'list') sizes[0] = init.items.length
      else if (init.form === 'assign' && init.expr.k === 'string')
        sizes[0] = init.expr.value.length + 1
      else this.fail('Array size missing', 'Give the array a size.')
    }
    let total = 1
    for (const size of sizes) {
      if (size === null || size <= 0) {
        this.fail(
          'Invalid array size',
          `An array dimension must be positive, but it is ${size ?? 'missing'}.`,
        )
      }
      total *= size
    }
    if (total > MAX_CELLS) {
      this.failKind(
        'memory',
        'Array too large',
        `This array has ${total.toLocaleString()} cells; the visualizer supports up to ${MAX_CELLS.toLocaleString()}.`,
        ['Use a smaller bound (for example the input size) while visualizing.'],
      )
    }
    const types: CType[] = []
    let type: CType = base
    for (let i = sizes.length - 1; i >= 0; i -= 1) {
      type = { k: 'carray', elem: type, size: sizes[i] as number }
      types.unshift(type)
    }
    const lazy = total > LAZY_ROWS_ABOVE
    const build = (level: number): CSeq => {
      const size = sizes[level] as number
      const levelType = types[level] as Extract<CType, { k: 'carray' }>
      if (level === sizes.length - 1) {
        this.allocate(size, line)
        const items: Value[] = new Array<Value>(size)
        const scalar =
          base.k === 'int' || base.k === 'float' || base.k === 'bool'
        const fill = scalar ? this.zeroValue(base) : null
        for (let i = 0; i < size; i += 1)
          items[i] = scalar ? fill : this.zeroValue(base)
        return {
          kind: 'seq',
          seq: 'carray',
          elemType: levelType.elem,
          items,
          ver: 0,
          touched: 0,
          fixed: true,
        }
      }
      const seq: CSeq = {
        kind: 'seq',
        seq: 'carray',
        elemType: levelType.elem,
        items: new Array<Value>(size).fill(null),
        ver: 0,
        touched: 0,
        fixed: true,
      }
      if (lazy) {
        seq.lazyRows = { rowType: levelType.elem, make: () => build(level + 1) }
      } else {
        for (let i = 0; i < size; i += 1) seq.items[i] = build(level + 1)
      }
      return seq
    }
    const value = build(0)
    if (init !== undefined) this.fillArray(value, init)
    return { value, type: types[0] }
  }

  protected allocate(count: number, line: number) {
    this.cells += count
    if (this.cells > MAX_CELLS) {
      this.line = line
      this.failKind(
        'memory',
        'Memory limit reached',
        `The program allocated more than ${MAX_CELLS.toLocaleString()} cells.`,
        ['Use smaller sizes while visualizing.'],
      )
    }
  }

  protected fillArray(seq: CSeq, init: NonNullable<Declarator['init']>) {
    if (init.form === 'assign') {
      const value = this.eval(init.expr)
      const text =
        typeof value.v === 'object' &&
        value.v !== null &&
        value.v.kind === 'str'
          ? value.v.s
          : null
      if (text === null)
        this.fail(
          'Invalid initializer',
          'An array can only be initialized from a list or a string.',
        )
      for (let i = 0; i < text.length && i < seq.items.length; i += 1)
        seq.items[i] = text.charCodeAt(i)
      return
    }
    const items = init.form === 'list' ? init.items : init.args
    const assign = (target: CSeq, exprs: Expr[]) => {
      exprs.forEach((expr, index) => {
        if (index >= target.items.length) {
          this.fail(
            'Too many initializers',
            `The array has room for ${target.items.length} values.`,
          )
        }
        const current = target.items[index] ?? null
        if (
          expr.k === 'initlist' &&
          typeof current === 'object' &&
          current !== null &&
          current.kind === 'seq'
        ) {
          assign(current, expr.items)
          return
        }
        if (
          current === null &&
          target.lazyRows !== undefined &&
          expr.k === 'initlist'
        ) {
          const row = this.materializeRow(target, index)
          assign(row, expr.items)
          return
        }
        target.items[index] = this.coerce(this.eval(expr), target.elemType)
      })
    }
    assign(seq, items)
  }

  defaultValue(type: CType): Value {
    switch (type.k) {
      case 'pointer':
        return null
      case 'int':
        return type.bits >= 64 ? 0n : 0
      case 'float':
        return 0
      case 'bool':
        return false
      case 'string':
        return { kind: 'str', s: '', ver: 0 }
      case 'vector':
      case 'deque':
      case 'list':
      case 'stack':
      case 'queue':
        return {
          kind: 'seq',
          seq: type.k,
          elemType: type.elem,
          items: [],
          ver: 0,
          touched: 0,
          fixed: false,
        }
      case 'stdarray': {
        const items: Value[] = []
        for (let i = 0; i < type.size; i += 1)
          items.push(this.defaultValue(type.elem))
        return {
          kind: 'seq',
          seq: 'stdarray',
          elemType: type.elem,
          items,
          ver: 0,
          touched: 0,
          fixed: true,
        }
      }
      case 'carray': {
        const items: Value[] = []
        for (let i = 0; i < (type.size ?? 0); i += 1)
          items.push(this.defaultValue(type.elem))
        return {
          kind: 'seq',
          seq: 'carray',
          elemType: type.elem,
          items,
          ver: 0,
          touched: 0,
          fixed: true,
        }
      }
      case 'pair':
        return {
          kind: 'tuple',
          pair: true,
          items: [
            this.defaultValue(type.first),
            this.defaultValue(type.second),
          ],
          types: [type.first, type.second],
          ver: 0,
        }
      case 'tuple':
        return {
          kind: 'tuple',
          pair: false,
          items: type.items.map((item) => this.defaultValue(item)),
          types: type.items,
          ver: 0,
        }
      case 'map':
        return {
          kind: 'map',
          type,
          entries: [],
          index: type.ordered ? null : new Map(),
          compare: this.comparatorFor(type.cmp),
          ver: 0,
        }
      case 'set':
        return {
          kind: 'set',
          type,
          items: [],
          index: type.ordered ? null : new Map(),
          compare: this.comparatorFor(type.cmp),
          ver: 0,
        }
      case 'pq':
        return {
          kind: 'heap',
          elemType: type.elem,
          items: [],
          compare: this.comparatorFor(type.cmp),
          ver: 0,
        }
      case 'struct': {
        const def = this.program.structs.get(type.name)
        if (def === undefined)
          this.fail('Unknown type', `Unknown struct ${type.name}.`)
        return this.constructStruct(def, [], false)
      }
      case 'functor':
        return { kind: 'functor', name: type.name }
      case 'bitset':
        return {
          kind: 'bitset',
          bits: new Array<boolean>(type.size).fill(false),
          ver: 0,
        }
      default:
        return null
    }
  }

  // ---- comparison -------------------------------------------------------------------

  compareValues(a: Value, b: Value): number {
    return defaultCompare(a, b, (x, y) => this.structLess(x, y))
  }

  protected structLess(a: CStruct, b: CStruct): boolean {
    const method = a.def.methods
      .get('operator<')
      ?.find((fn) => fn.params.length === 1)
    if (method !== undefined) {
      return this.truth(
        this.invoke(
          method,
          [tv({ k: 'struct', name: b.def.name }, b)],
          a,
          null,
          `${a.def.name}::operator<`,
        ),
      )
    }
    const free = this.program.functions
      .get('operator<')
      ?.find((fn) => fn.params.length === 2)
    if (free !== undefined) {
      return this.truth(
        this.invoke(
          free,
          [
            tv({ k: 'struct', name: a.def.name }, a),
            tv({ k: 'struct', name: b.def.name }, b),
          ],
          null,
          null,
          'operator<',
        ),
      )
    }
    this.fail(
      'No ordering for struct',
      `Sorting or comparing ${a.def.name} needs an operator< (or a comparator).`,
    )
  }

  // Builds an ordering from a comparator type or value; the result is
  // negative when a comes before b.
  comparatorFor(cmp: CType | Value | null): Comparator {
    if (cmp === null || cmp === undefined)
      return (a, b) => this.compareValues(a, b)
    if (typeof cmp === 'object' && 'k' in cmp) {
      if (cmp.k === 'functor') {
        return cmp.name === 'greater' || cmp.name === 'greater_equal'
          ? (a, b) => this.compareValues(b, a)
          : (a, b) => this.compareValues(a, b)
      }
      if (cmp.k === 'struct') {
        const def = this.program.structs.get(cmp.name)
        if (def === undefined)
          this.fail('Unknown comparator', `Unknown comparator ${cmp.name}.`)
        const instance = this.constructStruct(def, [], false)
        return this.comparatorFor(instance)
      }
      return (a, b) => this.compareValues(a, b)
    }
    const fn = cmp as Value
    if (typeof fn === 'object' && fn !== null && fn.kind === 'functor') {
      return this.comparatorFor({ k: 'functor', name: fn.name })
    }
    const less = (a: Value, b: Value) =>
      this.quietly(() =>
        this.truth(this.callValue(fn, [this.valueTV(a), this.valueTV(b)])),
      )
    return (a, b) => (less(a, b) ? -1 : less(b, a) ? 1 : 0)
  }

  valueTV(value: Value): TV {
    return tv(this.typeOfValue(value), value)
  }

  quietly<R>(work: () => R): R {
    this.quiet += 1
    try {
      return work()
    } finally {
      this.quiet -= 1
    }
  }

  // ---- expressions ------------------------------------------------------------------------

  eval(expr: Expr): TV {
    switch (expr.k) {
      case 'int':
        return tv(expr.type, expr.value)
      case 'float':
        return tv(expr.type, expr.value)
      case 'char':
        return tv(T.char, expr.value)
      case 'string':
        return tv(T.string, { kind: 'str', s: expr.value, ver: 0 })
      case 'bool':
        return tv(T.bool, expr.value)
      case 'null':
        return tv(T.ptr, null)
      case 'ident':
        return this.evalIdent(expr)
      case 'this': {
        const self = this.current.self
        if (self === null)
          this.fail('No this', 'this is only available inside a struct method.')
        return tv(
          { k: 'pointer', to: { k: 'struct', name: self.def.name } },
          self,
        )
      }
      case 'binary':
        return this.evalBinary(expr)
      case 'logical': {
        const left = this.truth(this.eval(expr.left))
        if (expr.op === '&&' ? !left : left) return tv(T.bool, left)
        return tv(T.bool, this.truth(this.eval(expr.right)))
      }
      case 'assign': {
        const ref = this.evalRef(expr)
        return tv(ref.type, ref.get())
      }
      case 'unary':
        return this.evalUnary(expr)
      case 'postfix': {
        const ref = this.evalRef(expr.operand)
        const old = ref.get()
        this.increment(ref, expr.op === '++' ? 1 : -1)
        return tv(ref.type, old)
      }
      case 'ternary': {
        const branch = this.truth(this.eval(expr.cond)) ? expr.yes : expr.no
        const other = branch === expr.yes ? expr.no : expr.yes
        const result = this.eval(branch)
        // Arithmetic branches share a common type (cond ? 1 : 2.5 is double).
        if (
          (result.t.k === 'int' || result.t.k === 'bool') &&
          isArithmeticLiteral(other)
        ) {
          const otherType = literalType(other)
          if (otherType !== null) {
            const type = commonType(result.t, otherType)
            return tv(type, convertScalar(result.v, result.t, type))
          }
        }
        return result
      }
      case 'comma':
        this.eval(expr.left)
        return this.eval(expr.right)
      case 'call': {
        const result = this.evalCall(expr)
        if ('ref' in result) return tv(result.ref.type, result.ref.get())
        return result
      }
      case 'member':
      case 'index': {
        const ref = this.evalRef(expr)
        return tv(ref.type, ref.get())
      }
      case 'cast': {
        const value = this.eval(expr.expr)
        if (expr.type.k === 'auto') return value
        return tv(expr.type, this.castValue(value, expr.type))
      }
      case 'construct':
        return tv(
          expr.type,
          this.construct(
            expr.type,
            expr.args.map((arg) => this.eval(arg)),
            expr.braced,
          ),
        )
      case 'initlist':
        return tv(T.auto, {
          kind: 'initlist',
          items: expr.items.map((item) => this.eval(item)),
        })
      case 'lambda':
        return tv(T.function, {
          kind: 'func',
          name: 'lambda',
          fn: expr.fn,
          env: this.current.scope,
          self: this.current.self,
        })
      case 'sizeof': {
        if (expr.type !== undefined) return tv(T.ull, BigInt(sizeOf(expr.type)))
        const value = this.eval(expr.expr as Expr)
        return tv(T.ull, BigInt(this.sizeOfValue(value)))
      }
      case 'scoped':
        return this.dispatchScopedValue(expr)
      case 'preval':
        return tv(expr.ref.type, expr.ref.get())
      case 'new':
        return this.evalNew(expr)
      case 'delete':
        this.eval(expr.operand)
        return tv(T.void, null)
      case 'newarray':
      case 'methodref':
      case 'instanceof':
        return this.evalDialect(expr)
    }
  }

  // Expressions only another dialect produces.
  protected evalDialect(expr: Expr): TV {
    this.unsupported(`This ${expr.k} expression is not supported here.`)
  }

  // new allocates on the heap; the pointer is the object itself, so every
  // copy of the pointer refers to the same object.
  protected evalNew(expr: Expr & { k: 'new' }): TV {
    const pointer: CType = { k: 'pointer', to: expr.type }
    if (expr.arraySize !== undefined) {
      const size = this.toIndex(this.eval(expr.arraySize), 'Array size')
      if (size < 0) {
        this.fail('Invalid array size', `new cannot allocate ${size} elements.`)
      }
      if (size > MAX_CONTAINER) this.containerTooLarge()
      this.allocate(size, expr.line)
      const items: Value[] = []
      for (let i = 0; i < size; i += 1) items.push(this.defaultValue(expr.type))
      const seq: CSeq = {
        kind: 'seq',
        seq: 'carray',
        elemType: expr.type,
        items,
        ver: 0,
        touched: 0,
        fixed: true,
      }
      return tv(pointer, seq)
    }
    const args = expr.args.map((arg) => this.eval(arg))
    const value = this.construct(expr.type, args, expr.braced)
    if (isAggregate(value) && value.kind === 'struct') return tv(pointer, value)
    // new int(5): a one-element box, so *p and p[0] both work.
    const box: CSeq = {
      kind: 'seq',
      seq: 'carray',
      elemType: expr.type,
      items: [value],
      ver: 0,
      touched: 1,
      fixed: true,
    }
    return tv(pointer, box)
  }

  sizeOfValue(value: TV): number {
    const v = value.v
    if (
      typeof v === 'object' &&
      v !== null &&
      v.kind === 'seq' &&
      (v.seq === 'carray' || v.seq === 'stdarray')
    ) {
      const first = v.items[0] ?? null
      const elem =
        first !== null && typeof first === 'object'
          ? this.sizeOfValue(tv(v.elemType, first))
          : sizeOf(v.elemType)
      return v.items.length * elem
    }
    return sizeOf(value.t)
  }

  protected evalIdent(expr: Expr & { k: 'ident' }): TV {
    const slot = this.findSlot(expr.name)
    if (slot !== undefined) {
      const ref = this.slotRef(slot)
      return tv(slot.type, ref.get())
    }
    const self = this.current.self
    if (self !== null && self.fields.has(expr.name)) {
      return tv(
        self.fieldTypes.get(expr.name) ?? T.auto,
        self.fields.get(expr.name) ?? null,
      )
    }
    const fn = this.program.functions.get(expr.name)?.[0]
    if (fn !== undefined) {
      return tv(T.function, {
        kind: 'func',
        name: expr.name,
        fn,
        env: null,
        self: null,
      })
    }
    const constant = this.dispatchConstant(expr.name)
    if (constant !== undefined) return constant
    if (this.isLibraryName(expr.name)) {
      return tv(T.function, { kind: 'builtin', name: expr.name })
    }
    this.line = expr.line
    throw new RuntimeFailure(
      'compile',
      'Unknown name',
      `'${expr.name}' was not declared.`,
    )
  }

  evalRef(expr: Expr): Ref {
    switch (expr.k) {
      case 'preval':
        return expr.ref
      case 'ident': {
        const slot = this.findSlot(expr.name)
        if (slot !== undefined) return this.slotRef(slot)
        const self = this.current.self
        if (self !== null && self.fields.has(expr.name)) {
          return this.fieldRef(self, expr.name, {
            frame: this.current.id,
            name: 'this',
            path: [],
          })
        }
        return this.tempRef(this.eval(expr))
      }
      case 'index':
        return this.indexRef(expr)
      case 'member':
        return this.memberRef(expr)
      case 'unary': {
        if (expr.op === '*') return this.deref(this.eval(expr.operand))
        if (expr.op === '++' || expr.op === '--') {
          const ref = this.evalRef(expr.operand)
          this.increment(ref, expr.op === '++' ? 1 : -1)
          return ref
        }
        return this.tempRef(this.eval(expr))
      }
      case 'assign':
        return this.evalAssign(expr)
      case 'ternary':
        return this.truth(this.eval(expr.cond))
          ? this.evalRef(expr.yes)
          : this.evalRef(expr.no)
      case 'comma':
        this.eval(expr.left)
        return this.evalRef(expr.right)
      case 'call': {
        const result = this.evalCall(expr)
        return 'ref' in result ? result.ref : this.tempRef(result)
      }
      case 'this': {
        const value = this.eval(expr)
        return this.tempRef(value)
      }
      default:
        return this.tempRef(this.eval(expr))
    }
  }

  toIndex(value: TV, what = 'Index'): number {
    const v = value.v
    if (typeof v === 'number') return Math.trunc(v)
    if (typeof v === 'bigint') {
      // Negative values that went through size_t conversions.
      if (value.t.k === 'int' && value.t.unsigned && v > 9007199254740991n) {
        return Number(BigInt.asIntN(64, v))
      }
      return Number(v)
    }
    if (typeof v === 'boolean') return v ? 1 : 0
    this.fail(`Invalid ${what.toLowerCase()}`, `${what} must be a number.`)
  }

  describeOrigin(origin: Origin | undefined, fallback: string): string {
    if (origin === undefined) return fallback
    let text = origin.name
    for (const part of origin.path) {
      text += typeof part === 'number' ? `[${part}]` : `.${part}`
    }
    return text
  }

  protected outOfRange(
    origin: Origin | undefined,
    index: number,
    size: number,
    what = 'array',
  ): never {
    const name = this.describeOrigin(origin, `the ${what}`)
    this.fail(
      'Index out of range',
      `${name}[${index}] is outside ${name === `the ${what}` ? name : name} (size ${size}).`,
      [
        `Access attempted: ${name}[${index}]`,
        `Size: ${size}`,
        size === 0
          ? 'The container is empty, so no index is valid.'
          : `Valid indexes: 0–${size - 1}`,
        'In real C++ this is undefined behaviour: it may crash, or silently read or overwrite other memory.',
      ],
    )
  }

  protected indexRef(expr: Expr & { k: 'index' }): Ref {
    const baseRef = this.evalRef(expr.object)
    const container = baseRef.get()
    if (container === null && baseRef.type.k !== 'int') {
      this.nullDereference(this.describeOrigin(baseRef.origin, 'an array'))
    }
    if (typeof container !== 'object' || container === null) {
      this.fail(
        'Cannot index',
        'Only arrays, vectors, strings and maps can be indexed with [ ].',
      )
    }
    if (container.kind === 'map') {
      const key = this.eval(expr.index)
      const entry = this.mapEntry(container, key, true, baseRef.origin)
      return this.tupleRef(
        entry,
        1,
        baseRef.origin === undefined
          ? undefined
          : { ...baseRef.origin, path: [...baseRef.origin.path] },
      )
    }
    const index = this.toIndex(this.eval(expr.index))
    switch (container.kind) {
      case 'seq': {
        if (
          container.seq === 'stack' ||
          container.seq === 'queue' ||
          container.seq === 'list'
        ) {
          this.fail(
            'Cannot index',
            `A ${container.seq} cannot be indexed with [ ].`,
          )
        }
        if (index < 0 || index >= container.items.length) {
          this.outOfRange(
            baseRef.origin,
            index,
            container.items.length,
            container.seq === 'carray' ? 'array' : container.seq,
          )
        }
        return this.seqRef(container, index, baseRef.origin)
      }
      case 'str':
        if (index < 0 || index > container.s.length) {
          this.outOfRange(baseRef.origin, index, container.s.length, 'string')
        }
        return this.strRef(container, index, baseRef.origin)
      case 'bitset':
        if (index < 0 || index >= container.bits.length) {
          this.outOfRange(
            baseRef.origin,
            index,
            container.bits.length,
            'bitset',
          )
        }
        return {
          type: T.bool,
          get: () => container.bits[index] ?? false,
          peek: () => container.bits[index] ?? false,
          set: (value: Value) => {
            container.bits[index] = truthy(value)
            bump(container)
          },
        }
      case 'struct': {
        const method = container.def.methods.get('operator[]')?.[0]
        if (method !== undefined) {
          const result = this.invoke(
            method,
            [tv(T.int, index)],
            container,
            null,
            `${container.def.name}::operator[]`,
          )
          return this.tempRef(result)
        }
        break
      }
      default:
        break
    }
    this.fail('Cannot index', `A ${container.kind} cannot be indexed with [ ].`)
  }

  mapEntry(map: CMap, key: TV, insert: boolean, origin?: Origin): CTuple {
    const keyValue = this.coerce(key, map.type.key)
    const existing = this.findMapEntry(map, keyValue)
    if (existing !== undefined) {
      if (origin !== undefined) {
        this.trackRead({
          ...origin,
          path: [...origin.path, accessKey(keyValue)],
        })
      }
      return existing
    }
    if (!insert)
      this.fail(
        'Missing key',
        `The key ${accessKey(keyValue)} is not in the map.`,
      )
    const entry: CTuple = {
      kind: 'tuple',
      pair: true,
      items: [keyValue, this.defaultValue(map.type.value)],
      types: [map.type.key, map.type.value],
      ver: 0,
      keyLocked: true,
    }
    this.insertMapEntry(map, entry)
    if (origin !== undefined) {
      this.trackWrite({
        ...origin,
        path: [...origin.path, accessKey(keyValue)],
      })
    }
    return entry
  }

  findMapEntry(map: CMap, key: Value): CTuple | undefined {
    if (map.index !== null) return map.index.get(keyOf(key))
    const position = bound(
      map.entries,
      key,
      map.compare,
      false,
      (entry) => (entry as CTuple).items[0] ?? null,
    )
    const entry = map.entries[position]
    if (entry !== undefined && map.compare(entry.items[0] ?? null, key) === 0)
      return entry
    return undefined
  }

  insertMapEntry(map: CMap, entry: CTuple): number {
    if (map.entries.length >= MAX_CONTAINER) this.containerTooLarge()
    if (map.index !== null) {
      map.entries.push(entry)
      map.index.set(keyOf(entry.items[0] ?? null), entry)
      bump(map)
      return map.entries.length - 1
    }
    const position = bound(
      map.entries,
      entry.items[0] ?? null,
      map.compare,
      map.type.multi,
      (item) => (item as CTuple).items[0] ?? null,
    )
    map.entries.splice(position, 0, entry)
    bump(map)
    return position
  }

  containerTooLarge(): never {
    this.failKind(
      'memory',
      'Container too large',
      `A container grew beyond ${MAX_CONTAINER.toLocaleString()} elements.`,
      ['Use a smaller input while visualizing.'],
    )
  }

  protected memberRef(expr: Expr & { k: 'member' }): Ref {
    if (expr.object.k === 'this') {
      const self = this.current.self
      if (self === null)
        this.fail('No this', 'this is only available inside a struct method.')
      return this.fieldRef(self, expr.name, {
        frame: this.current.id,
        name: 'this',
        path: [],
      })
    }
    let baseRef = this.evalRef(expr.object)
    let object = baseRef.get()
    if (
      expr.arrow &&
      typeof object === 'object' &&
      object !== null &&
      object.kind === 'iter'
    ) {
      baseRef = this.deref(tv(T.iterator, object))
      object = baseRef.get()
    }
    if (object === null) {
      this.nullDereference(this.describeOrigin(baseRef.origin, 'a pointer'))
    }
    if (typeof object === 'object' && object !== null) {
      if (object.kind === 'tuple') {
        if (object.pair && (expr.name === 'first' || expr.name === 'second')) {
          return this.tupleRef(
            object,
            expr.name === 'first' ? 0 : 1,
            baseRef.origin,
          )
        }
      }
      if (object.kind === 'struct')
        return this.fieldRef(object, expr.name, baseRef.origin)
    }
    this.fail('Unknown member', `No member named ${expr.name} here.`)
  }

  deref(value: TV): Ref {
    const v = value.v
    if (v === null && (value.t.k === 'pointer' || value.t.k === 'ptr')) {
      this.nullDereference()
    }
    if (typeof v === 'object' && v !== null) {
      if (v.kind === 'struct') {
        const object = v
        return {
          type: { k: 'struct', name: object.def.name },
          get: () => object,
          peek: () => object,
          set: (next: Value) => {
            if (isAggregate(next) && next.kind === 'struct') {
              Object.assign(object, copyValue(next), { ver: object.ver + 1 })
            }
          },
        }
      }
      if (v.kind === 'iter') return this.iterRef(v)
      if (v.kind === 'seq' && v.seq === 'carray') {
        if (v.items.length === 0) this.outOfRange(undefined, 0, 0)
        return this.seqRef(v, 0)
      }
      if (v.kind === 'ptr') return v.ref
    }
    this.unsupported(
      'Dereferencing with * only works on iterators here; pointers are not supported.',
    )
  }

  nullDereference(what = 'a pointer'): never {
    this.fail(
      'Null pointer',
      `The program followed ${what} that is ${this.nullName()}.`,
      [
        `It points to nothing, so there is no object to read or change.`,
        'Check for null before using it (for example at the end of a list or a missing child).',
      ],
    )
  }

  nullName(): string {
    return 'nullptr'
  }

  iterRef(iter: Iter): Ref {
    const target = iter.target
    const length = targetLength(target)
    const position = iter.reverse ? length - 1 - iter.index : iter.index
    if (position < 0 || position >= length) {
      this.fail(
        'Invalid iterator',
        'An iterator was dereferenced at end() (or before begin()).',
        [
          'For example *s.end() or *v.begin() on an empty container.',
          'In real C++ this is undefined behaviour.',
        ],
      )
    }
    switch (target.kind) {
      case 'seq':
        return this.seqRef(target, position)
      case 'str':
        return this.strRef(target, position)
      case 'map': {
        const entry = target.entries[position]
        return {
          type: {
            k: 'pair',
            first: target.type.key,
            second: target.type.value,
          },
          get: () => entry,
          peek: () => entry,
          set: () =>
            this.fail(
              'Cannot assign',
              'A map entry cannot be replaced through an iterator.',
            ),
        }
      }
      case 'set': {
        const item = target.items[position] ?? null
        return {
          type: target.type.elem,
          readonly: true,
          get: () => item,
          peek: () => item,
          set: () => this.fail('Cannot assign', 'Set elements are read-only.'),
        }
      }
    }
  }

  protected increment(ref: Ref, delta: 1 | -1) {
    const current = ref.get()
    if (
      typeof current === 'object' &&
      current !== null &&
      current.kind === 'iter'
    ) {
      ref.set({ ...current, index: current.index + delta })
      return
    }
    if (ref.type.k === 'bool') {
      ref.set(delta > 0 ? true : !truthy(current))
      return
    }
    const result = binaryArith(
      delta > 0 ? '+' : '-',
      tv(ref.type, current),
      tv(T.int, 1),
    )
    if (result.note !== undefined) this.note(result.note)
    ref.set(
      convertScalar(result.value.v, result.value.t, ref.type, (message) =>
        this.note(message),
      ),
    )
  }

  protected evalAssign(expr: Expr & { k: 'assign' }): Ref {
    const ref = this.evalRef(expr.target)
    if (ref.readonly === true)
      this.fail('Cannot assign', 'This value is read-only.')
    if (expr.op === '=') {
      const value = this.eval(expr.value)
      this.assignTo(ref, value)
      return ref
    }
    const op = expr.op.slice(0, -1)
    const current = tv(ref.type, ref.get())
    const right = this.eval(expr.value)
    if (typeof current.v === 'object' && current.v !== null) {
      if (current.v.kind === 'str' && op === '+') {
        current.v.s += this.stringOf(right)
        bump(current.v)
        this.trackWrite(ref.origin)
        return ref
      }
      if (current.v.kind === 'iter' && (op === '+' || op === '-')) {
        const steps = this.toIndex(right)
        ref.set({
          ...current.v,
          index: current.v.index + (op === '+' ? steps : -steps),
        })
        return ref
      }
      if (current.v.kind === 'bitset') {
        this.unsupported('Compound assignment on bitsets is not supported yet.')
      }
      if (current.v.kind === 'struct') {
        const method = current.v.def.methods.get(`operator${expr.op}`)?.[0]
        if (method !== undefined) {
          this.invoke(
            method,
            [right],
            current.v,
            null,
            `${current.v.def.name}::operator${expr.op}`,
          )
          return ref
        }
      }
    }
    const result = binaryArith(op, current, right)
    if (result.note !== undefined) this.note(result.note)
    ref.set(
      convertScalar(result.value.v, result.value.t, ref.type, (message) =>
        this.note(message),
      ),
    )
    return ref
  }

  assignTo(ref: Ref, value: TV) {
    const next = this.coerce(
      value,
      ref.type.k === 'auto' ? this.decay(value.t, value.v) : ref.type,
    )
    const current = ref.peek()
    // Keep container identity so references to it stay valid. A pointer (or
    // any reference-semantics variable) is re-pointed instead.
    if (
      !this.rebinds(ref.type) &&
      isAggregate(current) &&
      isAggregate(next) &&
      current.kind === next.kind &&
      current !== next
    ) {
      const version = current.ver + 1
      Object.assign(current, next)
      current.ver = version
      this.trackWrite(ref.origin)
      return
    }
    ref.set(next)
  }

  // Assignment re-points (rather than copies into) values of this type.
  protected rebinds(type: CType): boolean {
    return type.k === 'pointer'
  }

  stringOf(value: TV): string {
    const v = value.v
    if (typeof v === 'object' && v !== null) {
      if (v.kind === 'str') return v.s
      if (v.kind === 'seq' && v.seq === 'carray') return cString(v)
    }
    if (
      value.t.k === 'int' &&
      (typeof v === 'number' || typeof v === 'bigint')
    ) {
      return String.fromCharCode(((Number(v) % 256) + 256) % 256)
    }
    this.fail('Not a string', `Expected text but got ${typeName(value.t)}.`)
  }

  protected evalBinary(expr: Expr & { k: 'binary' }): TV {
    const left = this.eval(expr.left)
    const lv = left.v
    if (typeof lv === 'object' && lv !== null && lv.kind === 'stream') {
      if (expr.op === '<<') {
        this.write(lv.name, this.eval(expr.right))
        return left
      }
      if (expr.op === '>>') {
        this.readInto(this.evalRef(expr.right))
        return left
      }
    }
    const right = this.eval(expr.right)
    const rv = right.v
    const op = expr.op
    if (
      (op === '==' || op === '!=') &&
      (left.t.k === 'pointer' || right.t.k === 'pointer')
    ) {
      return tv(T.bool, (lv === rv) === (op === '=='))
    }
    // Iterators and arrays decaying to pointers.
    if (op === '+' || op === '-') {
      const leftIter = asIter(lv)
      if (
        leftIter !== null &&
        (typeof rv === 'number' || typeof rv === 'bigint')
      ) {
        const steps = this.toIndex(right)
        return tv(T.iterator, {
          ...leftIter,
          index: leftIter.index + (op === '+' ? steps : -steps),
        })
      }
      if (op === '+' && (typeof lv === 'number' || typeof lv === 'bigint')) {
        const rightIter = asIter(rv)
        if (rightIter !== null) {
          return tv(T.iterator, {
            ...rightIter,
            index: rightIter.index + this.toIndex(left),
          })
        }
      }
      if (op === '-' && leftIter !== null) {
        const rightIter = asIter(rv)
        if (rightIter !== null)
          return tv(T.ll, BigInt(leftIter.index - rightIter.index))
      }
    }
    if (typeof lv === 'object' && lv !== null) {
      if (
        lv.kind === 'str' ||
        (typeof rv === 'object' && rv !== null && rv.kind === 'str')
      ) {
        return this.stringBinary(op, left, right)
      }
      if (
        lv.kind === 'iter' ||
        (lv.kind === 'seq' && lv.seq === 'carray' && asIter(rv) !== null)
      ) {
        const a = asIter(lv)
        const b = asIter(rv)
        if (a !== null && b !== null) {
          switch (op) {
            case '==':
              return tv(T.bool, a.target === b.target && a.index === b.index)
            case '!=':
              return tv(T.bool, !(a.target === b.target && a.index === b.index))
            case '<':
              return tv(T.bool, a.index < b.index)
            case '>':
              return tv(T.bool, a.index > b.index)
            case '<=':
              return tv(T.bool, a.index <= b.index)
            case '>=':
              return tv(T.bool, a.index >= b.index)
          }
        }
      }
      if (lv.kind === 'bitset') {
        this.unsupported('Bitset operators are not supported yet.')
      }
      if (lv.kind === 'struct') {
        const method = lv.def.methods
          .get(`operator${op}`)
          ?.find((fn) => fn.params.length === 1)
        if (method !== undefined)
          return this.invoke(
            method,
            [right],
            lv,
            null,
            `${lv.def.name}::operator${op}`,
          )
      }
      if (isAggregate(lv)) {
        const free = this.program.functions
          .get(`operator${op}`)
          ?.find((fn) => fn.params.length === 2)
        if (free !== undefined)
          return this.invoke(free, [left, right], null, null, `operator${op}`)
        return this.aggregateCompare(op, lv, rv)
      }
    }
    if ((lv === null || rv === null) && (op === '==' || op === '!=')) {
      return tv(T.bool, (lv === rv) === (op === '=='))
    }
    if (['<', '>', '<=', '>=', '==', '!='].includes(op)) {
      return tv(T.bool, compareArith(op, left, right))
    }
    const result = binaryArith(op, left, right)
    if (result.note !== undefined) this.note(result.note)
    return result.value
  }

  protected stringBinary(op: string, left: TV, right: TV): TV {
    if (op === '+') {
      return tv(T.string, {
        kind: 'str',
        s: this.stringOf(left) + this.stringOf(right),
        ver: 0,
      })
    }
    const a = this.stringOf(left)
    const b = this.stringOf(right)
    switch (op) {
      case '==':
        return tv(T.bool, a === b)
      case '!=':
        return tv(T.bool, a !== b)
      case '<':
        return tv(T.bool, a < b)
      case '>':
        return tv(T.bool, a > b)
      case '<=':
        return tv(T.bool, a <= b)
      case '>=':
        return tv(T.bool, a >= b)
    }
    this.fail('Invalid operator', `Operator ${op} cannot be used with strings.`)
  }

  protected aggregateCompare(op: string, a: Value, b: Value): TV {
    switch (op) {
      case '==':
        return tv(T.bool, valuesEqual(a, b))
      case '!=':
        return tv(T.bool, !valuesEqual(a, b))
      case '<':
        return tv(T.bool, this.compareValues(a, b) < 0)
      case '>':
        return tv(T.bool, this.compareValues(a, b) > 0)
      case '<=':
        return tv(T.bool, this.compareValues(a, b) <= 0)
      case '>=':
        return tv(T.bool, this.compareValues(a, b) >= 0)
    }
    this.fail(
      'Invalid operator',
      `Operator ${op} cannot be used with these values.`,
    )
  }

  protected evalUnary(expr: Expr & { k: 'unary' }): TV {
    switch (expr.op) {
      case '!':
        return tv(T.bool, !this.truth(this.eval(expr.operand)))
      case '++':
      case '--': {
        const ref = this.evalRef(expr)
        return tv(ref.type, ref.get())
      }
      case '*': {
        const ref = this.deref(this.eval(expr.operand))
        return tv(ref.type, ref.get())
      }
      case '&':
        return tv(T.ptr, { kind: 'ptr', ref: this.evalRef(expr.operand) })
      default: {
        const operand = this.eval(expr.operand)
        if (
          typeof operand.v === 'object' &&
          operand.v !== null &&
          operand.v.kind === 'struct'
        ) {
          const method = operand.v.def.methods
            .get(`operator${expr.op}`)
            ?.find((fn) => fn.params.length === 0)
          if (method !== undefined)
            return this.invoke(
              method,
              [],
              operand.v,
              null,
              `operator${expr.op}`,
            )
        }
        const result = unaryArith(expr.op, operand)
        if (result.note !== undefined) this.note(result.note)
        return result.value
      }
    }
  }

  // ---- calls ----------------------------------------------------------------------------

  evalCall(expr: Expr & { k: 'call' }): MethodResult {
    const callee = expr.callee
    if (callee.k === 'member') {
      if (callee.object.k === 'this') {
        const self = this.current.self
        if (self === null)
          this.fail('No this', 'this is only available inside a struct method.')
        return this.callStructMethod(self, callee.name, expr.args)
      }
      let objectRef = this.evalRef(callee.object)
      let object = objectRef.get()
      if (
        callee.arrow &&
        typeof object === 'object' &&
        object !== null &&
        object.kind === 'iter'
      ) {
        objectRef = this.deref(tv(T.iterator, object))
        object = objectRef.get()
      }
      if (
        typeof object === 'object' &&
        object !== null &&
        object.kind === 'struct'
      ) {
        const field = object.fields.get(callee.name)
        if (field !== undefined && !object.def.methods.has(callee.name)) {
          return this.callValue(
            field,
            expr.args.map((arg) => this.eval(arg)),
          )
        }
        return this.callStructMethod(object, callee.name, expr.args)
      }
      return this.dispatchMethod(
        objectRef,
        object,
        callee.name,
        expr.args,
        expr,
      )
    }
    if (callee.k === 'ident') {
      const name = callee.name
      const slot = this.findSlot(name)
      if (slot !== undefined) {
        const value = this.slotRef(slot).get()
        return this.callValueWithExprs(value, expr.args, name)
      }
      const self = this.current.self
      if (self !== null) {
        if (self.def.methods.has(name))
          return this.callStructMethod(self, name, expr.args)
        const field = self.fields.get(name)
        if (field !== undefined)
          return this.callValueWithExprs(field, expr.args, name)
      }
      const overloads = this.program.functions.get(name)
      if (overloads !== undefined) {
        const fn = this.pickOverload(overloads, expr.args.length, name)
        return this.invokeWithExprs(fn, expr.args, null, null, name)
      }
      const library = this.dispatchLibrary(name, expr.args, expr)
      if (library !== undefined) return library
      this.line = expr.line
      throw new RuntimeFailure(
        'compile',
        'Unknown function',
        `'${name}' was not declared.`,
      )
    }
    if (callee.k === 'scoped')
      return this.dispatchScopedCall(callee, expr.args, expr)
    const value = this.eval(callee)
    return this.callValueWithExprs(value.v, expr.args, 'function')
  }

  protected pickOverload(
    overloads: FunctionDef[],
    count: number,
    name: string,
  ): FunctionDef {
    const fn = overloads.find((candidate) => {
      const required = candidate.params.filter(
        (param) => param.defaultValue === undefined,
      ).length
      return count >= required && count <= candidate.params.length
    })
    if (fn === undefined) {
      this.fail(
        'Wrong number of arguments',
        `No version of ${name} takes ${count} argument${count === 1 ? '' : 's'}.`,
      )
    }
    return fn
  }

  callStructMethod(object: CStruct, name: string, args: Expr[]): MethodResult {
    const overloads = object.def.methods.get(name)
    if (overloads === undefined) {
      this.fail(
        'Unknown method',
        `${object.def.name} has no method named ${name}.`,
      )
    }
    const fn = this.pickOverload(
      overloads,
      args.length,
      `${object.def.name}::${name}`,
    )
    return this.invokeWithExprs(
      fn,
      args,
      object,
      this.methodEnv(object),
      `${object.def.name}.${name}`,
    )
  }

  callValueWithExprs(value: Value, args: Expr[], name: string): TV {
    if (typeof value === 'object' && value !== null && value.kind === 'func') {
      return this.invokeWithExprs(
        value.fn,
        args,
        value.self,
        value.env,
        value.name === 'lambda' ? name : value.name,
      )
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      value.kind === 'struct'
    ) {
      const result = this.callStructMethod(value, 'operator()', args)
      return 'ref' in result ? tv(result.ref.type, result.ref.get()) : result
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      value.kind === 'builtin'
    ) {
      const result = this.dispatchLibrary(value.name, args, {
        k: 'call',
        line: this.line,
        callee: { k: 'ident', line: this.line, name: value.name },
        args,
      })
      if (result !== undefined)
        return 'ref' in result ? tv(result.ref.type, result.ref.get()) : result
    }
    return this.callValue(
      value,
      args.map((arg) => this.eval(arg)),
    )
  }

  // Calls a function value with already evaluated arguments.
  callValue(value: Value, args: TV[]): TV {
    if (typeof value === 'object' && value !== null) {
      switch (value.kind) {
        case 'func':
          return this.invoke(value.fn, args, value.self, value.env, value.name)
        case 'functor': {
          const [a, b] = args
          if (a === undefined || b === undefined)
            this.fail(
              'Invalid comparator call',
              'A comparator needs two values.',
            )
          const order = this.compareValues(a.v, b.v)
          const result =
            value.name === 'less'
              ? order < 0
              : value.name === 'greater'
                ? order > 0
                : value.name === 'less_equal'
                  ? order <= 0
                  : order >= 0
          return tv(T.bool, result)
        }
        case 'struct': {
          const method = value.def.methods
            .get('operator()')
            ?.find((fn) => fn.params.length === args.length)
          if (method !== undefined)
            return this.invoke(method, args, value, null, `${value.def.name}()`)
          break
        }
        case 'builtin': {
          const exprs = args.map((_, index): Expr => ({
            k: 'ident',
            line: this.line,
            name: `__arg${index}`,
          }))
          this.pushScope()
          args.forEach((arg, index) => {
            this.current.scope.vars.set(`__arg${index}`, {
              name: `__arg${index}`,
              type: arg.t,
              value: arg.v,
              frame: -1,
            })
          })
          try {
            const result = this.dispatchLibrary(value.name, exprs, {
              k: 'call',
              line: this.line,
              callee: { k: 'ident', line: this.line, name: value.name },
              args: exprs,
            })
            if (result !== undefined)
              return 'ref' in result
                ? tv(result.ref.type, result.ref.get())
                : result
          } finally {
            this.popScope()
          }
          break
        }
        default:
          break
      }
    }
    this.fail('Not callable', 'This value cannot be called like a function.')
  }

  protected invokeWithExprs(
    fn: FunctionDef,
    args: Expr[],
    self: CStruct | null,
    env: Scope | null,
    name: string,
  ): TV {
    const slots: Slot[] = fn.params.map((param, index) => {
      const expr = args[index] ?? param.defaultValue
      if (expr === undefined) {
        this.fail(
          'Missing argument',
          `${name} needs a value for ${param.name || `argument ${index + 1}`}.`,
        )
      }
      if (param.isRef) {
        const ref = this.evalRef(expr)
        const type =
          param.type.k === 'auto' ||
          (param.type.k === 'carray' && param.type.size === null)
            ? this.decay(ref.type, ref.peek())
            : param.type
        return { name: param.name, type, value: null, ref, frame: 0 }
      }
      const value = this.eval(expr)
      const type =
        param.type.k === 'auto' ? this.decay(value.t, value.v) : param.type
      return {
        name: param.name,
        type,
        value: this.coerce(value, type),
        frame: 0,
      }
    })
    return this.drive(this.runFunction({ fn, slots, self, env, name }))
  }

  invoke(
    fn: FunctionDef,
    args: TV[],
    self: CStruct | null,
    env: Scope | null,
    name: string,
  ): TV {
    const slots: Slot[] = fn.params.map((param, index) => {
      const arg = args[index]
      const value =
        arg ??
        (param.defaultValue === undefined
          ? undefined
          : this.eval(param.defaultValue))
      if (value === undefined) {
        this.fail(
          'Missing argument',
          `${name} needs a value for ${param.name || `argument ${index + 1}`}.`,
        )
      }
      const type =
        param.type.k === 'auto' ||
        (param.type.k === 'carray' && param.type.size === null)
          ? this.decay(value.t, value.v)
          : param.type
      if (param.isRef) {
        return {
          name: param.name,
          type,
          value: null,
          ref: this.tempRef(value),
          frame: 0,
        }
      }
      return {
        name: param.name,
        type,
        value: this.coerce(value, type),
        frame: 0,
      }
    })
    return this.drive(this.runFunction({ fn, slots, self, env, name }))
  }

  // ---- construction and conversion --------------------------------------------------------

  coerce(value: TV, type: CType): Value {
    const v = value.v
    if (isInitList(v)) {
      if (type.k === 'auto') {
        this.unsupported('A braced list needs a known type here.')
      }
      return this.construct(type, v.items, true)
    }
    switch (type.k) {
      case 'auto':
        return this.storeCopy(v)
      case 'int':
      case 'float':
      case 'bool':
        if (
          typeof v === 'number' ||
          typeof v === 'bigint' ||
          typeof v === 'boolean'
        ) {
          return convertScalar(v, value.t, type, (message) =>
            this.note(message),
          )
        }
        if (typeof v === 'object' && v !== null && v.kind === 'iter') {
          this.fail(
            'Type mismatch',
            'An iterator cannot be stored in a number; subtract begin() to get an index.',
          )
        }
        if (v === null) return convertScalar(0, T.int, type)
        this.fail(
          'Type mismatch',
          `Cannot convert ${typeName(value.t)} to ${typeName(type)}.`,
        )
        break
      case 'string':
        if (typeof v === 'object' && v !== null && v.kind === 'str')
          return { kind: 'str', s: v.s, ver: 0 }
        return { kind: 'str', s: this.stringOf(value), ver: 0 }
      case 'struct':
        if (
          typeof v === 'object' &&
          v !== null &&
          v.kind === 'struct' &&
          v.def.name === type.name
        ) {
          return this.storeCopy(v)
        }
        if (v === null) return this.coerceNull(type)
        return this.construct(type, [value], false)
      case 'function':
      case 'iterator':
      case 'ptr':
      case 'stream':
        return v
      case 'pointer':
        if (v === null || isAggregate(v)) return v
        if (typeof v === 'object' && v.kind === 'iter') return v
        if (v === 0 || v === 0n) return null
        this.fail(
          'Type mismatch',
          `Cannot store ${typeName(value.t)} in a pointer.`,
        )
        break
      case 'functor':
        return v ?? { kind: 'functor', name: type.name }
      case 'carray':
        return v
      case 'pair':
      case 'tuple':
        if (typeof v === 'object' && v !== null && v.kind === 'tuple') {
          const types =
            type.k === 'pair' ? [type.first, type.second] : type.items
          return {
            kind: 'tuple',
            pair: type.k === 'pair',
            items: v.items.map((item, index) =>
              this.coerce(
                tv(v.types[index] ?? T.auto, item),
                types[index] ?? T.auto,
              ),
            ),
            types,
            ver: 0,
          }
        }
        break
      default:
        break
    }
    if (isAggregate(v)) return this.storeCopy(v)
    if (v === null) return this.coerceNull(type)
    this.fail(
      'Type mismatch',
      `Cannot convert ${typeName(value.t)} to ${typeName(type)}.`,
    )
  }

  construct(type: CType, args: TV[], braced: boolean): Value {
    const first = args[0]
    switch (type.k) {
      case 'int':
      case 'float':
      case 'bool':
        return first === undefined
          ? this.defaultValue(type)
          : this.coerce(first, type)
      case 'string': {
        if (first === undefined) return { kind: 'str', s: '', ver: 0 }
        const second = args[1]
        if (args.length === 2 && second !== undefined && !braced) {
          const firstIter = asIter(first.v)
          if (firstIter !== null) {
            const range = rangeValues(this, first, second)
            return {
              kind: 'str',
              s: range
                .map((item) => String.fromCharCode(Number(item)))
                .join(''),
              ver: 0,
            }
          }
          if (
            typeof first.v === 'object' &&
            first.v !== null &&
            first.v.kind === 'str'
          ) {
            return {
              kind: 'str',
              s: first.v.s.slice(this.toIndex(second)),
              ver: 0,
            }
          }
          const count = this.toIndex(first)
          const char = String.fromCharCode(Number(toJsNumber(second.v)) & 0xff)
          return { kind: 'str', s: char.repeat(Math.max(0, count)), ver: 0 }
        }
        if (braced) {
          return {
            kind: 'str',
            s: args.map((arg) => this.stringOf(arg)).join(''),
            ver: 0,
          }
        }
        return { kind: 'str', s: this.stringOf(first), ver: 0 }
      }
      case 'vector':
      case 'deque':
      case 'list': {
        const seq = this.defaultValue(type) as CSeq
        if (braced) {
          seq.items = args.map((arg) => this.coerce(arg, type.elem))
        } else if (first !== undefined) {
          if (asIter(first.v) !== null && args[1] !== undefined) {
            seq.items = rangeValues(this, first, args[1]).map((item) =>
              this.coerce(this.valueTV(item), type.elem),
            )
          } else if (
            args.length === 1 &&
            typeof first.v === 'object' &&
            first.v !== null &&
            (first.v.kind === 'seq' || first.v.kind === 'initlist')
          ) {
            return this.coerce(first, type)
          } else {
            const count = this.toIndex(first, 'Size')
            if (count < 0)
              this.fail(
                'Invalid size',
                `A ${type.k} cannot have size ${count}.`,
              )
            if (count > MAX_CONTAINER) this.containerTooLarge()
            this.allocate(count, this.line)
            const fill = args[1]
            const items: Value[] = new Array<Value>(count)
            const scalarFill =
              fill === undefined
                ? this.defaultValue(type.elem)
                : this.coerce(fill, type.elem)
            const scalar = !isAggregate(scalarFill)
            for (let i = 0; i < count; i += 1) {
              items[i] = scalar
                ? scalarFill
                : i === 0
                  ? scalarFill
                  : copyValue(scalarFill)
            }
            seq.items = items
          }
        }
        return seq
      }
      case 'stdarray': {
        const seq = this.defaultValue(type) as CSeq
        args.forEach((arg, index) => {
          if (index < seq.items.length)
            seq.items[index] = this.coerce(arg, type.elem)
        })
        return seq
      }
      case 'stack':
      case 'queue': {
        const seq = this.defaultValue(type) as CSeq
        if (
          first !== undefined &&
          typeof first.v === 'object' &&
          first.v !== null &&
          first.v.kind === 'seq'
        ) {
          seq.items = first.v.items.map(copyValue)
        }
        return seq
      }
      case 'pair': {
        if (braced || args.length === 2) {
          return {
            kind: 'tuple',
            pair: true,
            items: [
              first === undefined
                ? this.defaultValue(type.first)
                : this.coerce(first, type.first),
              args[1] === undefined
                ? this.defaultValue(type.second)
                : this.coerce(args[1], type.second),
            ],
            types: [type.first, type.second],
            ver: 0,
          }
        }
        if (first !== undefined) return this.coerce(first, type)
        return this.defaultValue(type)
      }
      case 'tuple':
        return {
          kind: 'tuple',
          pair: false,
          items: type.items.map((item, index) => {
            const arg = args[index]
            return arg === undefined
              ? this.defaultValue(item)
              : this.coerce(arg, item)
          }),
          types: type.items,
          ver: 0,
        }
      case 'map': {
        const map = this.defaultValue(type) as CMap
        const items =
          first !== undefined &&
          asIter(first.v) !== null &&
          args[1] !== undefined &&
          !braced
            ? rangeValues(this, first, args[1]).map((item) =>
                this.valueTV(item),
              )
            : braced
              ? args
              : []
        for (const item of items) {
          const pair = this.coerce(item, {
            k: 'pair',
            first: type.key,
            second: type.value,
          }) as CTuple
          if (
            type.multi ||
            this.findMapEntry(map, pair.items[0] ?? null) === undefined
          ) {
            pair.keyLocked = true
            this.insertMapEntry(map, pair)
          }
        }
        return map
      }
      case 'set': {
        const set = this.defaultValue(type) as CSet
        const items =
          first !== undefined &&
          asIter(first.v) !== null &&
          args[1] !== undefined &&
          !braced
            ? rangeValues(this, first, args[1])
            : braced
              ? args.map((arg) => arg.v)
              : []
        for (const item of items)
          this.setInsert(set, this.coerce(this.valueTV(item), type.elem))
        return set
      }
      case 'pq': {
        const cmpArg = args.find((arg) => {
          const v = arg.v
          return (
            typeof v === 'object' &&
            v !== null &&
            (v.kind === 'func' || v.kind === 'functor' || v.kind === 'struct')
          )
        })
        const heap: CHeap = {
          kind: 'heap',
          elemType: type.elem,
          items: [],
          compare: this.comparatorFor(
            cmpArg !== undefined ? cmpArg.v : type.cmp,
          ),
          ver: 0,
        }
        const iterArgs = args.filter((arg) => asIter(arg.v) !== null)
        if (iterArgs.length >= 2) {
          for (const item of rangeValues(this, iterArgs[0], iterArgs[1])) {
            this.heapPush(heap, this.coerce(this.valueTV(item), type.elem))
          }
        }
        return heap
      }
      case 'struct': {
        const def = this.program.structs.get(type.name)
        if (def === undefined)
          this.fail('Unknown type', `Unknown struct ${type.name}.`)
        if (
          args.length === 1 &&
          first !== undefined &&
          typeof first.v === 'object' &&
          first.v !== null &&
          first.v.kind === 'struct' &&
          first.v.def === def
        ) {
          return copyValue(first.v)
        }
        if (args.length === 1 && first !== undefined && isInitList(first.v)) {
          return this.constructStruct(def, first.v.items, true)
        }
        return this.constructStruct(def, args, braced)
      }
      case 'functor':
        return { kind: 'functor', name: type.name }
      case 'function':
        return first?.v ?? null
      case 'bitset': {
        const bits = new Array<boolean>(type.size).fill(false)
        if (first !== undefined) {
          if (
            typeof first.v === 'object' &&
            first.v !== null &&
            first.v.kind === 'str'
          ) {
            const text = first.v.s
            for (let i = 0; i < text.length && i < type.size; i += 1) {
              bits[i] = text[text.length - 1 - i] === '1'
            }
          } else {
            let n = BigInt.asUintN(64, BigInt(toJsNumber(first.v)))
            for (let i = 0; i < type.size && n > 0n; i += 1) {
              bits[i] = (n & 1n) === 1n
              n >>= 1n
            }
          }
        }
        return { kind: 'bitset', bits, ver: 0 }
      }
      case 'auto':
        return first === undefined ? null : copyValue(first.v)
      default:
        return this.defaultValue(type)
    }
  }

  constructStruct(def: StructDef, args: TV[], braced: boolean): CStruct {
    const object: CStruct = {
      kind: 'struct',
      def,
      fields: new Map(),
      fieldTypes: new Map(),
      ver: 0,
    }
    for (const field of def.fields) {
      if (field.dims !== undefined) {
        const { value, type } = this.makeCArray(
          field.type,
          field.dims,
          field.init,
          field.line,
        )
        object.fields.set(field.name, value)
        object.fieldTypes.set(field.name, type)
        continue
      }
      object.fieldTypes.set(field.name, field.type)
      let value: Value
      if (field.init === undefined) value = this.zeroValue(field.type)
      else if (field.init.form === 'assign')
        value = this.coerce(this.eval(field.init.expr), field.type)
      else if (field.init.form === 'ctor')
        value = this.construct(
          field.type,
          field.init.args.map((arg) => this.eval(arg)),
          false,
        )
      else
        value = this.construct(
          field.type,
          field.init.items.map((item) => this.eval(item)),
          true,
        )
      object.fields.set(field.name, value)
    }
    const ctor = def.ctors.find((candidate) => {
      const required = candidate.params.filter(
        (param) => param.defaultValue === undefined,
      ).length
      return args.length >= required && args.length <= candidate.params.length
    })
    if (ctor !== undefined) {
      this.quietly(() => this.invoke(ctor, args, object, null, def.name))
      return object
    }
    if (args.length > 0) {
      if (def.ctors.length > 0 && !braced) {
        this.fail(
          'No matching constructor',
          `${def.name} has no constructor taking ${args.length} arguments.`,
        )
      }
      const fields = def.fields
      args.forEach((arg, index) => {
        const field = fields[index]
        if (field === undefined)
          this.fail(
            'Too many values',
            `${def.name} has only ${fields.length} fields.`,
          )
        object.fields.set(
          field.name,
          this.coerce(arg, object.fieldTypes.get(field.name) ?? field.type),
        )
      })
    }
    return object
  }

  setInsert(set: CSet, value: Value): { index: number; inserted: boolean } {
    if (set.items.length >= MAX_CONTAINER) this.containerTooLarge()
    if (set.index !== null) {
      const key = keyOf(value)
      const existing = set.index.get(key)
      if (existing !== undefined && !set.type.multi)
        return { index: existing, inserted: false }
      set.items.push(value)
      set.index.set(key, set.items.length - 1)
      bump(set)
      return { index: set.items.length - 1, inserted: true }
    }
    const position = bound(set.items, value, set.compare, set.type.multi)
    if (!set.type.multi) {
      const existing = set.items[position]
      if (existing !== undefined && set.compare(existing, value) === 0) {
        return { index: position, inserted: false }
      }
    }
    set.items.splice(position, 0, value)
    bump(set)
    return { index: position, inserted: true }
  }

  setFind(set: CSet, value: Value): number {
    if (set.index !== null) {
      const index = set.index.get(keyOf(value))
      return index ?? set.items.length
    }
    const position = bound(set.items, value, set.compare, false)
    const item = set.items[position]
    return item !== undefined && set.compare(item, value) === 0
      ? position
      : set.items.length
  }

  setEraseAt(set: CSet, index: number) {
    set.items.splice(index, 1)
    if (set.index !== null) {
      set.index.clear()
      set.items.forEach((item, position) =>
        set.index?.set(keyOf(item), position),
      )
    }
    bump(set)
  }

  heapPush(heap: CHeap, value: Value) {
    if (heap.items.length >= MAX_CONTAINER) this.containerTooLarge()
    const items = heap.items
    items.push(value)
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap.compare(items[parent] ?? null, items[i] ?? null) < 0) {
        ;[items[parent], items[i]] = [items[i] ?? null, items[parent] ?? null]
        i = parent
      } else break
    }
    bump(heap)
  }

  // libstdc++'s pop_heap: the hole left by the top walks down to a leaf
  // along the larger children, then the last item is pushed up from there.
  // Matching it keeps the drawn heap identical to a real g++ run.
  heapPop(heap: CHeap): Value {
    const items = heap.items
    const top = items[0] ?? null
    const value = items.pop() ?? null
    const length = items.length
    if (length > 0) {
      const less = (a: Value, b: Value) => heap.compare(a, b) < 0
      let hole = 0
      let child = 0
      while (child < Math.floor((length - 1) / 2)) {
        child = 2 * (child + 1)
        if (less(items[child] ?? null, items[child - 1] ?? null)) child -= 1
        items[hole] = items[child] ?? null
        hole = child
      }
      if ((length & 1) === 0 && child === Math.floor((length - 2) / 2)) {
        child = 2 * (child + 1)
        items[hole] = items[child - 1] ?? null
        hole = child - 1
      }
      let parent = Math.floor((hole - 1) / 2)
      while (hole > 0 && less(items[parent] ?? null, value)) {
        items[hole] = items[parent] ?? null
        hole = parent
        parent = Math.floor((hole - 1) / 2)
      }
      items[hole] = value
    }
    bump(heap)
    return top
  }

  // ---- input and output ------------------------------------------------------------------

  writeText(stream: 'cout' | 'cerr', text: string) {
    if (stream === 'cerr') {
      this.err += text
      return
    }
    this.outChunks.push(text)
    this.outLength += text.length
    if (this.outLength > this.limits.maxOutputChars) {
      this.failKind(
        'output_limit',
        'Too much output',
        `The program printed more than ${this.limits.maxOutputChars.toLocaleString()} characters.`,
        ['Often an infinite loop that prints, or debug output left in.'],
      )
    }
  }

  protected write(stream: 'cin' | 'cout' | 'cerr', value: TV) {
    if (stream === 'cin')
      this.fail('Invalid output', 'Use cout << to print, not cin <<.')
    const v = value.v
    if (typeof v === 'object' && v !== null && v.kind === 'manip') {
      this.applyManipulator(stream, v.name, v.arg)
      return
    }
    let text = this.formatForStream(value)
    const state = this.coutState
    if (state.width > 0) {
      if (text.length < state.width) {
        const padding = state.fill.repeat(state.width - text.length)
        text = state.left ? text + padding : padding + text
      }
      state.width = 0
    }
    this.writeText(stream, text)
  }

  protected applyManipulator(
    stream: 'cout' | 'cerr',
    name: string,
    arg?: number,
  ) {
    const state = this.coutState
    switch (name) {
      case 'endl':
        this.writeText(stream, '\n')
        break
      case 'fixed':
        state.float = 'fixed'
        break
      case 'scientific':
        state.float = 'scientific'
        break
      case 'defaultfloat':
        state.float = 'general'
        break
      case 'setprecision':
        state.precision = arg ?? 6
        break
      case 'setw':
        state.width = arg ?? 0
        break
      case 'setfill':
        state.fill = String.fromCharCode(arg ?? 32)
        break
      case 'boolalpha':
        state.boolalpha = true
        break
      case 'noboolalpha':
        state.boolalpha = false
        break
      case 'left':
        state.left = true
        break
      case 'right':
        state.left = false
        break
      default:
        break
    }
  }

  formatForStream(value: TV): string {
    const v = value.v
    const t = value.t
    if (typeof v === 'boolean' || t.k === 'bool') {
      const truth = truthy(v)
      return this.coutState.boolalpha
        ? truth
          ? 'true'
          : 'false'
        : truth
          ? '1'
          : '0'
    }
    if (typeof v === 'number' || typeof v === 'bigint') {
      if (t.k === 'float') {
        return formatFloat(
          Number(v),
          this.coutState.float,
          this.coutState.precision,
        )
      }
      if (t.k === 'int' && t.char === true) {
        return String.fromCharCode(((Number(v) % 256) + 256) % 256)
      }
      return String(v)
    }
    if (typeof v === 'object' && v !== null) {
      if (v.kind === 'str') return v.s
      if (
        v.kind === 'seq' &&
        v.seq === 'carray' &&
        v.elemType.k === 'int' &&
        v.elemType.char === true
      ) {
        return cString(v)
      }
      if (v.kind === 'bitset')
        return [...v.bits]
          .reverse()
          .map((bit) => (bit ? '1' : '0'))
          .join('')
      if (
        v.kind === 'tuple' ||
        v.kind === 'seq' ||
        v.kind === 'map' ||
        v.kind === 'set'
      ) {
        this.fail(
          'Cannot print',
          `A ${typeName(t)} cannot be printed with << directly; print its elements.`,
        )
      }
      if (v.kind === 'iter')
        this.fail(
          'Cannot print',
          'An iterator cannot be printed; print *it instead.',
        )
    }
    return ''
  }

  skipSpaces() {
    while (
      this.inPos < this.stdin.length &&
      /\s/.test(this.stdin[this.inPos] ?? '')
    )
      this.inPos += 1
  }

  readInto(ref: Ref) {
    if (this.inFail) return
    const type = ref.type
    const current = ref.peek()
    this.skipSpaces()
    if (this.inPos >= this.stdin.length) {
      this.inFail = true
      this.note('Input ended: cin could not read another value.')
      return
    }
    if (
      typeof current === 'object' &&
      current !== null &&
      current.kind === 'str'
    ) {
      ref.set({ kind: 'str', s: this.readToken(), ver: current.ver + 1 })
      return
    }
    if (
      typeof current === 'object' &&
      current !== null &&
      current.kind === 'seq' &&
      current.seq === 'carray'
    ) {
      const token = this.readToken()
      if (token.length + 1 > current.items.length) {
        this.fail(
          'Buffer overflow',
          `The word "${token.slice(0, 20)}" does not fit in a char array of size ${current.items.length}.`,
        )
      }
      for (let i = 0; i < current.items.length; i += 1)
        current.items[i] = i < token.length ? token.charCodeAt(i) : 0
      bump(current)
      this.trackWrite(ref.origin)
      return
    }
    if (type.k === 'int' && type.char === true) {
      ref.set(this.stdin.charCodeAt(this.inPos))
      this.inPos += 1
      return
    }
    if (type.k === 'int' || type.k === 'bool') {
      const match = /[+-]?\d+/y
      match.lastIndex = this.inPos
      const found = match.exec(this.stdin)
      if (found === null) {
        this.inFail = true
        this.note(
          `cin could not read a number: the input has "${this.stdin.slice(this.inPos, this.inPos + 12).split('\n')[0] ?? ''}" here.`,
        )
        ref.set(type.k === 'bool' ? false : type.bits >= 64 ? 0n : 0)
        return
      }
      this.inPos = match.lastIndex
      const big = BigInt(found[0])
      if (type.k === 'bool') {
        ref.set(big !== 0n)
        return
      }
      const [lo, hi] = intRange(type)
      if (big < lo || big > hi) {
        this.inFail = true
        this.note(
          `The input ${found[0]} does not fit in ${typeName(type)}; cin fails and stores ${big < lo ? lo : hi}.`,
        )
        ref.set(
          type.bits >= 64 ? (big < lo ? lo : hi) : Number(big < lo ? lo : hi),
        )
        return
      }
      ref.set(type.bits >= 64 ? big : Number(big))
      return
    }
    if (type.k === 'float') {
      const match =
        /[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|inf(?:inity)?|nan)/iy
      match.lastIndex = this.inPos
      const found = match.exec(this.stdin)
      if (found === null) {
        this.inFail = true
        ref.set(0)
        return
      }
      this.inPos = match.lastIndex
      ref.set(Number(found[0].replace(/^([+-]?)inf(inity)?$/i, '$1Infinity')))
      return
    }
    this.fail('Cannot read', `cin cannot read into a ${typeName(type)}.`)
  }

  readToken(): string {
    this.skipSpaces()
    const start = this.inPos
    while (
      this.inPos < this.stdin.length &&
      !/\s/.test(this.stdin[this.inPos] ?? '')
    )
      this.inPos += 1
    return this.stdin.slice(start, this.inPos)
  }

  readLine(delimiter = '\n'): string | null {
    if (this.inPos >= this.stdin.length) return null
    const end = this.stdin.indexOf(delimiter, this.inPos)
    const stop = end < 0 ? this.stdin.length : end
    let line = this.stdin.slice(this.inPos, stop)
    this.inPos = end < 0 ? this.stdin.length : end + 1
    if (delimiter === '\n' && line.endsWith('\r')) line = line.slice(0, -1)
    return line
  }

  exit(code: number): never {
    throw new ExitSignal(code)
  }
}

function isExprNode(value: Expr | Stmt): value is Expr {
  return !('declarators' in value)
}

function isArithmeticLiteral(expr: Expr) {
  return expr.k === 'int' || expr.k === 'float' || expr.k === 'char'
}

function literalType(expr: Expr): CType | null {
  if (expr.k === 'int' || expr.k === 'float') return expr.type
  if (expr.k === 'char') return T.char
  return null
}

function isArithmeticType(type: CType) {
  return type.k === 'int' || type.k === 'float' || type.k === 'bool'
}

const callCache = new WeakMap<Expr, boolean>()

// Whether evaluating the expression may call a function (and so needs the
// generator path).
function containsCall(expr: Expr): boolean {
  switch (expr.k) {
    case 'call':
      return true
    case 'binary':
    case 'logical':
      return containsCall(expr.left) || containsCall(expr.right)
    case 'assign':
      return containsCall(expr.target) || containsCall(expr.value)
    case 'unary':
    case 'postfix':
      return containsCall(expr.operand)
    case 'ternary':
      return (
        containsCall(expr.cond) ||
        containsCall(expr.yes) ||
        containsCall(expr.no)
      )
    case 'comma':
      return containsCall(expr.left) || containsCall(expr.right)
    case 'member':
      return containsCall(expr.object)
    case 'index':
      return containsCall(expr.object) || containsCall(expr.index)
    case 'cast':
      return containsCall(expr.expr)
    case 'construct':
      return expr.args.some(containsCall)
    case 'initlist':
      return expr.items.some(containsCall)
    case 'sizeof':
      return false
    default:
      return false
  }
}
