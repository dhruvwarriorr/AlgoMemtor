// Pure helpers that read an ExecutionTrace: value formatting, what changed
// at a step, step descriptions, loop compression for the timeline, array
// pointers and the expected-output comparison. Everything here describes the
// recorded trace; nothing is inferred beyond it.

import type {
  ExecutionTrace,
  TraceAccess,
  TraceBranch,
  TraceFrame,
  TraceStep,
  TraceValue,
} from './trace'

const MAX_INLINE = 12

export function formatValue(
  trace: ExecutionTrace,
  id: number | undefined,
  depth = 0,
): string {
  if (id === undefined) return '—'
  const value = trace.values[id]
  if (value === undefined) return '?'
  return formatTraceValue(trace, value, depth)
}

function formatTraceValue(
  trace: ExecutionTrace,
  value: TraceValue,
  depth: number,
): string {
  const python = trace.language === 'python'
  switch (value.kind) {
    case 'number':
      return value.text
    case 'bool':
      return python
        ? value.value
          ? 'True'
          : 'False'
        : value.value
          ? 'true'
          : 'false'
    case 'char':
      return `'${value.text}'`
    case 'string':
      return JSON.stringify(value.text).replace(/\\\\/g, '\\')
    case 'none':
      return value.text
    case 'unset':
      return 'unset'
    case 'opaque':
      return value.text
    case 'sequence': {
      if (depth > 2) return '[…]'
      const shown = value.items
        .slice(0, MAX_INLINE)
        .map((item) => formatValue(trace, item, depth + 1))
      const more =
        value.length > shown.length
          ? `, … ${value.length - shown.length} more`
          : ''
      const [open, close] =
        value.shape === 'tuple'
          ? ['(', ')']
          : value.shape === 'set'
            ? ['{', '}']
            : ['[', ']']
      return `${open}${shown.join(', ')}${more}${close}`
    }
    case 'mapping': {
      if (depth > 2) return '{…}'
      const shown = value.entries
        .slice(0, MAX_INLINE)
        .map(
          ([key, item]) =>
            `${formatValue(trace, key, depth + 1)}: ${formatValue(trace, item, depth + 1)}`,
        )
      const more =
        value.length > shown.length
          ? `, … ${value.length - shown.length} more`
          : ''
      return `{${shown.join(', ')}${more}}`
    }
    case 'record': {
      if (depth > 2) return '{…}'
      if (value.type === 'pair' || value.type === 'tuple') {
        return `(${value.fields.map(([, item]) => formatValue(trace, item, depth + 1)).join(', ')})`
      }
      return `${value.type}{${value.fields
        .map(
          ([name, item]) => `${name}: ${formatValue(trace, item, depth + 1)}`,
        )
        .join(', ')}}`
    }
  }
}

export function isContainer(value: TraceValue | undefined): boolean {
  return value?.kind === 'sequence' || value?.kind === 'mapping'
}

// ---- changes --------------------------------------------------------------------------

export type VariableChange = {
  frame: number
  name: string
  before: number | undefined
  after: number
}

function frameById(frames: TraceFrame[], id: number) {
  return frames.find((frame) => frame.id === id)
}

// Variables whose value differs from the previous step (new ones included).
export function changesAt(
  trace: ExecutionTrace,
  index: number,
): VariableChange[] {
  const step = trace.steps[index]
  if (step === undefined) return []
  const previous = index > 0 ? trace.steps[index - 1] : undefined
  const changes: VariableChange[] = []
  for (const frame of step.frames) {
    if (frame.elided === true) continue
    const before =
      previous === undefined ? undefined : frameById(previous.frames, frame.id)
    // A frame that just started shows its arguments as the call itself.
    if (before === undefined && step.event === 'call') continue
    for (const [name, id] of frame.vars) {
      const old = before?.vars.find(([key]) => key === name)?.[1]
      if (old !== id)
        changes.push({ frame: frame.id, name, before: old, after: id })
    }
  }
  return changes
}

export function changeKey(frame: number, name: string) {
  return `${frame}:${name}`
}

export function importantSteps(trace: ExecutionTrace): boolean[] {
  return trace.steps.map((step, index) => {
    if (index === 0 || index === trace.steps.length - 1) return true
    if (step.event !== 'line') return true
    if (
      step.cond !== undefined ||
      step.notes !== undefined ||
      step.writes !== undefined
    )
      return true
    const previous = trace.steps[index - 1]
    if (
      step.out !== previous.out ||
      step.in !== previous.in ||
      step.err !== previous.err
    )
      return true
    return changesAt(trace, index).length > 0
  })
}

// ---- descriptions ---------------------------------------------------------------------

export function branchAt(
  trace: ExecutionTrace,
  line: number,
): TraceBranch | undefined {
  return trace.branches.find((branch) => branch.line === line)
}

function describeCall(trace: ExecutionTrace, step: TraceStep): string {
  const frame = step.frames.at(-1)
  if (frame === undefined) return 'A function was called.'
  const args = frame.vars
    .filter(([name]) => name !== 'this' && name !== 'self')
    .slice(0, 6)
    .map(([name, id]) => `${name} = ${shorten(formatValue(trace, id), 24)}`)
  return `${frame.name}(${args.join(', ')}) was called.`
}

export function shorten(text: string, max = 60) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export type StepDescription = {
  title: string
  detail: string[]
}

export function describeStep(
  trace: ExecutionTrace,
  index: number,
  sourceLines: readonly string[] = [],
): StepDescription {
  const step = trace.steps[index]
  if (step === undefined) return { title: 'No step', detail: [] }
  const previous = index > 0 ? trace.steps[index - 1] : undefined
  const detail: string[] = []
  let title = `Line ${step.line}`
  const branch = branchAt(trace, step.line)
  if (step.event === 'call') {
    title = `Call at line ${step.line}`
    detail.push(describeCall(trace, step))
  } else if (step.event === 'return') {
    const frame = step.frames.at(-1)
    title = `Return from ${frame?.name ?? 'function'}`
    detail.push(
      step.value === undefined
        ? `${frame?.name ?? 'The function'} finished.`
        : `${frame?.name ?? 'The function'} returned ${shorten(formatValue(trace, step.value))}.`,
    )
  } else if (step.event === 'error') {
    title = `Stopped at line ${step.line}`
    if (trace.error !== undefined)
      detail.push(`${trace.error.title}: ${trace.error.message}`)
  } else if (step.loop !== undefined && branch !== undefined) {
    const loopText =
      branch.kind === 'for' ? branch.text : `while (${branch.text})`
    if (step.cond === false) {
      title = `Loop at line ${step.line} ends`
      detail.push(
        `The loop ${shorten(loopText)} stops after ${step.loop.iteration} iteration${step.loop.iteration === 1 ? '' : 's'}.`,
      )
    } else {
      title = `Loop at line ${step.line} · iteration ${step.loop.iteration}`
      detail.push(
        `Iteration ${step.loop.iteration} of ${shorten(loopText)} begins.`,
      )
    }
  } else if (step.cond !== undefined && branch !== undefined) {
    title = `Line ${step.line} · condition is ${step.cond ? 'true' : 'false'}`
    detail.push(
      `${shorten(branch.text, 80)} is ${step.cond ? 'true, so the body runs' : 'false, so the body is skipped'}.`,
    )
  }
  if (step.event !== 'call') {
    for (const change of changesAt(trace, index).slice(0, 6)) {
      detail.push(
        change.before === undefined
          ? `${change.name} = ${shorten(formatValue(trace, change.after))}`
          : `${change.name}: ${shorten(formatValue(trace, change.before), 40)} → ${shorten(formatValue(trace, change.after), 40)}`,
      )
    }
  }
  if (previous !== undefined && step.out > previous.out) {
    detail.push(
      `Printed ${JSON.stringify(shorten(trace.stdout.slice(previous.out, step.out), 80))}.`,
    )
  }
  if (previous !== undefined && step.in > previous.in) {
    const consumed = trace.steps.length > 0 ? step.in - previous.in : 0
    detail.push(
      `Read ${consumed} character${consumed === 1 ? '' : 's'} of input.`,
    )
  }
  if (detail.length === 0 && step.event === 'line') {
    const code = (sourceLines[step.line - 1] ?? '').trim()
    detail.push(
      /^(continue|break)\b/.test(code) || /\b(continue|break);?$/.test(code)
        ? 'Control jumps: nothing changed on this step.'
        : 'No variable changed on this step.',
    )
  }
  return { title, detail }
}

// Short text for a timeline row.
export function stepLabel(
  trace: ExecutionTrace,
  index: number,
  sourceLines: readonly string[] = [],
): string {
  const step = trace.steps[index]
  if (step === undefined) return ''
  if (step.event === 'call')
    return describeCall(trace, step).replace(' was called.', '')
  if (step.event === 'return') {
    const frame = step.frames.at(-1)
    return step.value === undefined
      ? `${frame?.name ?? 'function'} returns`
      : `${frame?.name ?? 'function'} returns ${shorten(formatValue(trace, step.value), 24)}`
  }
  if (step.event === 'error') return trace.error?.title ?? 'Error'
  if (step.loop !== undefined) {
    return step.cond === false
      ? 'loop ends'
      : `iteration ${step.loop.iteration}`
  }
  const branch = branchAt(trace, step.line)
  if (step.cond !== undefined && branch !== undefined) {
    return `${shorten(branch.text, 28)} → ${step.cond ? 'true' : 'false'}`
  }
  const change = changesAt(trace, index)[0]
  if (change !== undefined) {
    return `${change.name} = ${shorten(formatValue(trace, change.after), 28)}`
  }
  const previous = index > 0 ? trace.steps[index - 1] : undefined
  if (previous !== undefined && step.out > previous.out) {
    return `prints ${JSON.stringify(shorten(trace.stdout.slice(previous.out, step.out), 20))}`
  }
  return shorten((sourceLines[step.line - 1] ?? '').trim(), 36)
}

// ---- timeline ---------------------------------------------------------------------------

export type LoopRun = {
  key: string
  line: number
  // Step index of each iteration's header step.
  headers: number[]
  exit: number | null
}

export type TimelineRow =
  | { kind: 'step'; index: number }
  | {
      kind: 'collapsed'
      id: string
      start: number
      end: number
      line: number
      from: number
      to: number
    }

export function loopRuns(trace: ExecutionTrace): LoopRun[] {
  const open = new Map<string, LoopRun>()
  const runs: LoopRun[] = []
  trace.steps.forEach((step, index) => {
    if (step.loop === undefined) return
    const frame = step.frames.at(-1)?.id ?? 0
    const key = `${frame}:${step.loop.line}`
    let run = open.get(key)
    if (
      step.cond !== false &&
      (run === undefined || step.loop.iteration <= run.headers.length)
    ) {
      run = { key, line: step.loop.line, headers: [], exit: null }
      open.set(key, run)
      runs.push(run)
    }
    if (run === undefined) return
    if (step.cond === false) {
      run.exit = index
      open.delete(key)
    } else {
      run.headers.push(index)
    }
  })
  return runs
}

const KEEP_FIRST = 3
const KEEP_LAST = 2
const COLLAPSE_AFTER = 8

// Long loops show their first and last iterations; the middle collapses into
// one row that can be expanded.
export function collapsibleRanges(trace: ExecutionTrace) {
  const ranges: {
    id: string
    start: number
    end: number
    line: number
    from: number
    to: number
  }[] = []
  for (const run of loopRuns(trace)) {
    const count = run.headers.length
    if (count < COLLAPSE_AFTER) continue
    const start = run.headers[KEEP_FIRST]
    const end = run.headers[count - KEEP_LAST]
    ranges.push({
      id: `${run.key}@${run.headers[0]}`,
      start,
      end,
      line: run.line,
      from: KEEP_FIRST + 1,
      to: count - KEEP_LAST,
    })
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end)
  // Drop ranges inside other ranges.
  const outer: typeof ranges = []
  for (const range of ranges) {
    const last = outer.at(-1)
    if (
      last !== undefined &&
      range.start >= last.start &&
      range.end <= last.end
    )
      continue
    outer.push(range)
  }
  return outer
}

export function buildTimeline(
  trace: ExecutionTrace,
  important: boolean[] | null,
  expanded: ReadonlySet<string>,
  current: number,
): TimelineRow[] {
  const rows: TimelineRow[] = []
  const ranges = collapsibleRanges(trace).filter(
    (range) =>
      !expanded.has(range.id) &&
      !(current >= range.start && current < range.end),
  )
  let rangeIndex = 0
  for (let index = 0; index < trace.steps.length; index += 1) {
    while (
      rangeIndex < ranges.length &&
      (ranges[rangeIndex]?.end ?? 0) <= index
    )
      rangeIndex += 1
    const range = ranges[rangeIndex]
    if (range !== undefined && index === range.start) {
      rows.push({ kind: 'collapsed', ...range })
      index = range.end - 1
      rangeIndex += 1
      continue
    }
    if (important !== null && !important[index] && index !== current) continue
    rows.push({ kind: 'step', index })
  }
  return rows
}

// ---- navigation --------------------------------------------------------------------------

export function findStep(
  trace: ExecutionTrace,
  from: number,
  direction: 1 | -1,
  test: (step: TraceStep, index: number) => boolean,
): number | null {
  for (
    let index = from + direction;
    index >= 0 && index < trace.steps.length;
    index += direction
  ) {
    if (test(trace.steps[index], index)) return index
  }
  return null
}

// ---- arrays --------------------------------------------------------------------------------

export type Pointer = { name: string; index: number }

const windowPairs = [
  ['l', 'r'],
  ['left', 'right'],
  ['lo', 'hi'],
  ['low', 'high'],
  ['start', 'end'],
  ['L', 'R'],
  ['i', 'j'],
  ['s', 'e'],
]

export function pointersFor(
  trace: ExecutionTrace,
  frames: TraceFrame[],
  frame: TraceFrame,
  name: string,
  length: number,
): Pointer[] {
  const hints = trace.indexHints[name] ?? []
  const pointers: Pointer[] = []
  const lookup = (hint: string) =>
    frame.vars.find(([key]) => key === hint)?.[1] ??
    frames
      .find((item) => item.id === 0)
      ?.vars.find(([key]) => key === hint)?.[1]
  for (const hint of hints) {
    if (hint === name) continue
    const id = lookup(hint)
    const value = id === undefined ? undefined : trace.values[id]
    if (value?.kind !== 'number' || !/^-?\d+$/.test(value.text)) continue
    const index = Number(value.text)
    if (index < 0 || index > length) continue
    pointers.push({ name: hint, index })
  }
  return pointers
}

// A highlighted window between a known pair of pointers such as l and r.
export function windowRange(pointers: Pointer[]): [number, number] | null {
  for (const [a, b] of windowPairs) {
    const left = pointers.find((pointer) => pointer.name === a)
    const right = pointers.find((pointer) => pointer.name === b)
    if (left !== undefined && right !== undefined && a !== 'i') {
      return [
        Math.min(left.index, right.index),
        Math.max(left.index, right.index),
      ]
    }
  }
  return null
}

export function accessIndexes(
  accesses: TraceAccess[] | undefined,
  frame: number,
  name: string,
): (number | string)[][] {
  if (accesses === undefined) return []
  return accesses
    .filter((access) => access.frame === frame && access.name === name)
    .map((access) => access.path)
}

// ---- output ---------------------------------------------------------------------------------

export type OutputComparison =
  | { status: 'match' }
  | {
      status: 'mismatch'
      token: number
      expected: string | null
      actual: string | null
      outputLine: number
      // Step whose output first went wrong; null when output ended early.
      step: number | null
    }

type Token = { text: string; start: number; line: number }

function tokens(text: string): Token[] {
  const result: Token[] = []
  const pattern = /\S+/g
  let line = 1
  let lastIndex = 0
  for (
    let match = pattern.exec(text);
    match !== null;
    match = pattern.exec(text)
  ) {
    for (let i = lastIndex; i < match.index; i += 1)
      if (text[i] === '\n') line += 1
    lastIndex = match.index
    result.push({ text: match[0], start: match.index, line })
  }
  return result
}

function sameToken(expected: string, actual: string): boolean {
  if (expected === actual) return true
  // Judges usually accept small floating-point differences.
  const a = Number(expected)
  const b = Number(actual)
  if (
    /^-?\d*\.\d+(e[+-]?\d+)?$/i.test(expected) &&
    Number.isFinite(a) &&
    Number.isFinite(b)
  ) {
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a))
  }
  return false
}

// Compares output token by token, ignoring differences in whitespace, the way
// most judges do.
export function compareOutput(
  trace: ExecutionTrace,
  expected: string,
): OutputComparison {
  const want = tokens(expected)
  const got = tokens(trace.stdout)
  const count = Math.max(want.length, got.length)
  for (let index = 0; index < count; index += 1) {
    const w = want[index]
    const g = got[index]
    if (w !== undefined && g !== undefined && sameToken(w.text, g.text))
      continue
    let step: number | null = null
    if (g !== undefined) {
      const position = g.start
      const found = trace.steps.findIndex((item) => item.out > position)
      step = found < 0 ? null : found
    }
    return {
      status: 'mismatch',
      token: index + 1,
      expected: w?.text ?? null,
      actual: g?.text ?? null,
      outputLine: g?.line ?? w?.line ?? 1,
      step,
    }
  }
  return { status: 'match' }
}

// ---- mentor context ----------------------------------------------------------------------

// A plain-text description of one step for the Doubt Helper. It carries only
// what the trace recorded.
export function stepContext(
  trace: ExecutionTrace,
  index: number,
  sourceLines: readonly string[],
  expected: string,
  limit = 1_900,
): string {
  const step = trace.steps[index]
  if (step === undefined) return ''
  const description = describeStep(trace, index, sourceLines)
  const lines: string[] = [
    `I ran my code on a test case in the Test Case Visualizer. At step ${index + 1} of ${trace.steps.length} (line ${step.line}):`,
    `\`${shorten((sourceLines[step.line - 1] ?? '').trim(), 160)}\``,
    `${description.title}. ${description.detail.slice(0, 3).join(' ')}`,
  ]
  const frame = step.frames.at(-1)
  if (frame !== undefined && frame.vars.length > 0) {
    lines.push(
      `Variables in ${frame.name}: ${frame.vars
        .slice(0, 12)
        .map(([name, id]) => `${name} = ${shorten(formatValue(trace, id), 60)}`)
        .join(', ')}`,
    )
  }
  const global = step.frames.find((item) => item.id === 0)
  if (global !== undefined && global !== frame && global.vars.length > 0) {
    lines.push(
      `Globals: ${global.vars
        .slice(0, 8)
        .map(([name, id]) => `${name} = ${shorten(formatValue(trace, id), 50)}`)
        .join(', ')}`,
    )
  }
  if (step.notes !== undefined) lines.push(`Warning: ${step.notes.join(' ')}`)
  lines.push(
    `Output so far: ${JSON.stringify(shorten(trace.stdout.slice(0, step.out), 120))}`,
  )
  if (expected.trim() !== '') {
    lines.push(
      `Expected output: ${JSON.stringify(shorten(expected.trim(), 120))}`,
    )
    lines.push(
      `Actual output: ${JSON.stringify(shorten(trace.stdout.trim(), 120))}`,
    )
  }
  if (trace.error !== undefined) {
    lines.push(
      `The run ended with ${trace.error.title}: ${shorten(trace.error.message, 160)}`,
    )
  }
  lines.push('Why does this happen here, and what should I look at?')
  let text = lines.join('\n')
  if (text.length > limit) text = `${text.slice(0, limit - 1)}…`
  return text
}
