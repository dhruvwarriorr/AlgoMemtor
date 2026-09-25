// One friendly sentence per step, with the program's own values put into the
// source it is running: `a[mid] < target` becomes `23 < 40`. Only recorded
// values are used; anything that cannot be read from the trace stays as
// written.

import { branchAt, changesAt, formatValue, shorten } from '../analysis'
import type {
  ExecutionTrace,
  TraceFrame,
  TraceStep,
  TraceValue,
  VisualizerLanguage,
} from '../trace'
import type { Narration } from './types'

const KEYWORDS = new Set([
  'true',
  'false',
  'True',
  'False',
  'None',
  'null',
  'nullptr',
  'NULL',
  'and',
  'or',
  'not',
  'in',
  'is',
  'new',
  'this',
  'self',
  'return',
  'int',
  'long',
  'char',
  'auto',
  'var',
  'final',
  'const',
  'double',
  'bool',
  'boolean',
  'String',
  'string',
])

type Lookup = (name: string) => TraceValue | undefined

export function lookupIn(trace: ExecutionTrace, step: TraceStep): Lookup {
  const top = step.frames.at(-1)
  const global = step.frames.find((frame) => frame.id === 0)
  const find = (frame: TraceFrame | undefined, name: string) => {
    const id = frame?.vars.find(([key]) => key === name)?.[1]
    return id === undefined ? undefined : trace.values[id]
  }
  return (name) => find(top, name) ?? find(global, name)
}

const TOKEN =
  /\s+|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?[lLfFuU]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|->|::|&&|\|\||\+\+|--|<=|>=|==|!=|<<|>>|[-+*/%<>=!&|^~?:.,;()[\]{}]/g

function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? []
}

function isScalar(value: TraceValue | undefined): boolean {
  return (
    value !== undefined &&
    (value.kind === 'number' ||
      value.kind === 'bool' ||
      value.kind === 'char' ||
      value.kind === 'none' ||
      (value.kind === 'string' && value.length <= 24))
  )
}

function fieldOf(
  trace: ExecutionTrace,
  value: TraceValue | undefined,
  name: string,
): TraceValue | undefined {
  if (value?.kind !== 'record') return undefined
  const id = value.fields.find(([key]) => key === name)?.[1]
  return id === undefined ? undefined : trace.values[id]
}

function lengthOf(value: TraceValue | undefined): number | undefined {
  if (value === undefined) return undefined
  if (value.kind === 'sequence' || value.kind === 'mapping') return value.length
  if (value.kind === 'string') return value.length
  return undefined
}

function itemAt(
  trace: ExecutionTrace,
  value: TraceValue | undefined,
  index: TraceValue | number | undefined,
): TraceValue | undefined {
  if (value === undefined || index === undefined) return undefined
  const key =
    typeof index === 'number'
      ? index
      : index.kind === 'number' && /^-?\d+$/.test(index.text)
        ? Number(index.text)
        : undefined
  if (value.kind === 'sequence' && key !== undefined) {
    const position = key < 0 ? value.length + key : key
    const id = value.items[position]
    return id === undefined ? undefined : trace.values[id]
  }
  if (value.kind === 'string' && key !== undefined) {
    const position = key < 0 ? value.length + key : key
    const char = value.text[position]
    return char === undefined
      ? undefined
      : { kind: 'char', text: char, code: char.charCodeAt(0) }
  }
  if (value.kind === 'mapping' && typeof index !== 'number') {
    const wanted = formatScalar(trace, index)
    for (const [keyId, itemId] of value.entries) {
      const entryKey = trace.values[keyId]
      if (entryKey !== undefined && formatScalar(trace, entryKey) === wanted) {
        return trace.values[itemId]
      }
    }
  }
  return undefined
}

function formatScalar(trace: ExecutionTrace, value: TraceValue): string {
  switch (value.kind) {
    case 'number':
      return value.text
    case 'bool':
      return trace.language === 'python'
        ? value.value
          ? 'True'
          : 'False'
        : String(value.value)
    case 'char':
      return `'${value.text}'`
    case 'string':
      return JSON.stringify(value.text)
    case 'none':
      return value.text
    default:
      return '?'
  }
}

// Integer arithmetic on literals, for index expressions such as `i + 1`.
function arithmetic(text: string, python: boolean): number | undefined {
  const tokens = text.match(/\d+|\/\/|[-+*/%()]/g)
  if (tokens === null || tokens.join('') !== text.replace(/\s+/g, '')) {
    return undefined
  }
  let position = 0
  const peek = () => tokens[position]
  const primary = (): number | undefined => {
    const token = tokens[position]
    position += 1
    if (token === '(') {
      const value = sum()
      if (tokens[position] !== ')') return undefined
      position += 1
      return value
    }
    if (token === '-') {
      const value = primary()
      return value === undefined ? undefined : -value
    }
    if (token !== undefined && /^\d+$/.test(token)) return Number(token)
    return undefined
  }
  const product = (): number | undefined => {
    let value = primary()
    while (
      value !== undefined &&
      ['*', '/', '%', '//'].includes(peek() ?? '')
    ) {
      const op = tokens[position]
      position += 1
      const right = primary()
      if (right === undefined || (op !== '*' && right === 0)) return undefined
      if (op === '*') value *= right
      else if (op === '%')
        value = python ? ((value % right) + right) % right : value % right
      else if (op === '//' || python) value = Math.floor(value / right)
      else value = Math.trunc(value / right)
    }
    return value
  }
  const sum = (): number | undefined => {
    let value = product()
    while (value !== undefined && (peek() === '+' || peek() === '-')) {
      const op = tokens[position]
      position += 1
      const right = product()
      if (right === undefined) return undefined
      value = op === '+' ? value + right : value - right
    }
    return value
  }
  const result = sum()
  return position === tokens.length ? result : undefined
}

type Resolved = { value: TraceValue | number | undefined; text: string }

// Puts recorded values into a source expression. Returns the new text and
// whether anything was substituted.
export function substitute(
  trace: ExecutionTrace,
  source: string,
  lookup: Lookup,
): { text: string; changed: boolean } {
  const tokens = tokenize(source)
  const python = trace.language === 'python'
  let changed = false
  let position = 0

  // Reads a bracketed index expression and returns its substituted text.
  const readIndex = (): {
    text: string
    value: number | TraceValue | undefined
  } => {
    let depth = 1
    const inner: string[] = []
    while (position < tokens.length) {
      const token = tokens[position]
      position += 1
      if (token === '[') depth += 1
      if (token === ']') {
        depth -= 1
        if (depth === 0) break
      }
      inner.push(token)
    }
    const raw = inner.join('')
    const { text } = substitute(trace, raw, lookup)
    const number = arithmetic(text, python)
    if (number !== undefined) return { text, value: number }
    const direct = lookup(raw.trim())
    if (direct !== undefined && isScalar(direct)) return { text, value: direct }
    return { text, value: undefined }
  }

  const chain = (name: string): Resolved => {
    let value: TraceValue | number | undefined = lookup(name)
    let text = name
    while (position < tokens.length) {
      const token = tokens[position]
      if (token === '[') {
        position += 1
        const index = readIndex()
        text += `[${index.text}]`
        value =
          typeof value === 'number'
            ? undefined
            : itemAt(trace, value, index.value)
        continue
      }
      if (
        (token === '.' || token === '->') &&
        /^[A-Za-z_$]/.test(tokens[position + 1] ?? '')
      ) {
        const member = tokens[position + 1]
        const call =
          tokens[position + 2] === '(' && tokens[position + 3] === ')'
        if (
          (member === 'size' || member === 'length') &&
          (call || member === 'length')
        ) {
          const length: number | undefined =
            typeof value === 'number' ? undefined : lengthOf(value)
          position += call ? 4 : 2
          text += `${token}${member}${call ? '()' : ''}`
          value = length
          continue
        }
        if (call) break
        position += 2
        text += `${token}${member}`
        value =
          typeof value === 'number' ? undefined : fieldOf(trace, value, member)
        continue
      }
      break
    }
    return { value, text }
  }

  const output: string[] = []
  while (position < tokens.length) {
    const token = tokens[position]
    position += 1
    if (/^[A-Za-z_$]/.test(token) && !KEYWORDS.has(token)) {
      // len(x) in Python.
      if (token === 'len' && tokens[position] === '(') {
        const close = tokens.indexOf(')', position)
        const inner = tokens
          .slice(position + 1, close)
          .join('')
          .trim()
        const length = /^[A-Za-z_]\w*$/.test(inner)
          ? lengthOf(lookup(inner))
          : undefined
        if (length !== undefined && close > position) {
          position = close + 1
          output.push(String(length))
          changed = true
          continue
        }
      }
      // A function call keeps its name.
      if (tokens[position] === '(') {
        output.push(token)
        continue
      }
      // A member of something else (obj.field) is handled by the chain.
      const previous = output.at(-1)
      if (previous === '.' || previous === '->' || previous === '::') {
        output.push(token)
        continue
      }
      const resolved = chain(token)
      const value = resolved.value
      if (typeof value === 'number') {
        output.push(String(value))
        changed = true
      } else if (value !== undefined && isScalar(value)) {
        output.push(formatScalar(trace, value))
        changed = true
      } else {
        output.push(resolved.text)
        if (resolved.text !== token) changed = true
      }
      continue
    }
    output.push(token)
  }
  return { text: output.join('').replace(/\s+/g, ' ').trim(), changed }
}

function forCondition(text: string, language: VisualizerLanguage) {
  if (language === 'python') return null
  const parts = text.split(';')
  if (parts.length === 3) return parts[1].trim() || null
  return null
}

function argsOf(trace: ExecutionTrace, frame: TraceFrame | undefined) {
  if (frame === undefined) return ''
  return frame.vars
    .filter(([name]) => name !== 'this' && name !== 'self')
    .slice(0, 4)
    .map(([name, id]) => `${name} = ${shorten(formatValue(trace, id), 16)}`)
    .join(', ')
}

function printed(trace: ExecutionTrace, from: number, to: number) {
  const text = trace.stdout.slice(from, to)
  return JSON.stringify(shorten(text.replace(/\n$/, ''), 60))
}

export function narrate(
  trace: ExecutionTrace,
  index: number,
  sourceLines: readonly string[],
): Narration {
  const step = trace.steps[index]
  if (step === undefined) return { tone: 'info', headline: 'Nothing to show.' }
  const previous = index > 0 ? trace.steps[index - 1] : undefined
  const lookup = lookupIn(trace, step)
  const top = step.frames.at(-1)
  const source = (sourceLines[step.line - 1] ?? '').trim()
  const branch = branchAt(trace, step.line)
  const changes = step.event === 'call' ? [] : changesAt(trace, index)
  const changeText = changes
    .slice(0, 3)
    .map((change) =>
      change.before === undefined
        ? `${change.name} = ${shorten(formatValue(trace, change.after), 28)}`
        : `${change.name}: ${shorten(formatValue(trace, change.before), 18)} → ${shorten(formatValue(trace, change.after), 18)}`,
    )
  const outputDetail =
    previous !== undefined && step.out > previous.out
      ? `Printed ${printed(trace, previous.out, step.out)}`
      : undefined

  if (step.event === 'error') {
    return {
      tone: 'error',
      headline: trace.error?.title ?? 'The program stopped here',
      detail: [
        trace.error?.message ?? '',
        ...(trace.error?.details?.slice(0, 2) ?? []),
      ].filter((line) => line !== ''),
      code: source || undefined,
    }
  }
  if (step.event === 'call') {
    const args = argsOf(trace, top)
    return {
      tone: 'call',
      headline: `Call ${top?.name ?? 'function'}(${args})`,
      detail: [
        step.frames.length > 2
          ? `The call stack is now ${step.frames.length - 1} deep.`
          : 'A new frame starts with its own variables.',
      ],
    }
  }
  if (step.event === 'return') {
    const value =
      step.value === undefined
        ? undefined
        : shorten(formatValue(trace, step.value), 40)
    return {
      tone: 'return',
      headline:
        value === undefined
          ? `${top?.name ?? 'The function'} finishes`
          : `${top?.name ?? 'The function'} returns ${value}`,
      detail: [
        step.frames.length > 2
          ? `Back to ${step.frames.at(-2)?.name ?? 'the caller'}.`
          : 'Back to the caller.',
      ],
    }
  }

  const notes = step.notes ?? []
  const withNotes = (narration: Narration): Narration =>
    notes.length > 0
      ? {
          ...narration,
          tone: narration.tone === 'info' ? 'warning' : narration.tone,
          detail: [...(narration.detail ?? []), ...notes],
        }
      : narration

  if (branch !== undefined && step.cond !== undefined) {
    const isLoop = step.loop !== undefined
    const condition =
      branch.kind === 'for'
        ? forCondition(branch.text, trace.language)
        : branch.text
    const evaluated =
      condition === null ? null : substitute(trace, condition, lookup)
    const verdict = step.cond ? 'true' : 'false'
    if (isLoop) {
      const iteration = step.loop?.iteration ?? 0
      if (step.cond === false) {
        return withNotes({
          tone: 'loop',
          headline:
            condition === null
              ? `The loop ends after ${iteration} iteration${iteration === 1 ? '' : 's'}`
              : `${condition} is false, so the loop ends`,
          code: condition ?? undefined,
          evaluated: evaluated?.changed === true ? evaluated.text : undefined,
          detail: changeText,
        })
      }
      const loopVar =
        branch.kind === 'for' && trace.language === 'python'
          ? changeText[0]
          : undefined
      return withNotes({
        tone: 'loop',
        headline: `Iteration ${iteration}${loopVar !== undefined ? `: ${loopVar}` : ''}`,
        code: condition ?? undefined,
        evaluated: evaluated?.changed === true ? evaluated.text : undefined,
        detail: loopVar !== undefined ? changeText.slice(1) : changeText,
      })
    }
    const body =
      branch.kind === 'switch'
        ? 'a case matches'
        : step.cond
          ? branch.kind === 'while' || branch.kind === 'do'
            ? 'the loop goes on'
            : 'the body runs'
          : branch.kind === 'while' || branch.kind === 'do'
            ? 'the loop stops'
            : 'the body is skipped'
    return withNotes({
      tone: step.cond ? 'true' : 'false',
      headline: `${shorten(condition ?? branch.text, 48)} is ${verdict}, so ${body}`,
      code: condition ?? branch.text,
      evaluated: evaluated?.changed === true ? evaluated.text : undefined,
      detail: changeText,
    })
  }

  if (previous !== undefined && step.in > previous.in && changes.length > 0) {
    return withNotes({
      tone: 'input',
      headline: `Read ${changeText.slice(0, 2).join(', ')} from the input`,
      code: source || undefined,
      detail: outputDetail === undefined ? [] : [outputDetail],
    })
  }
  if (outputDetail !== undefined && changes.length === 0) {
    return withNotes({
      tone: 'output',
      headline: outputDetail,
      code: source || undefined,
    })
  }
  if (changes.length > 0) {
    const first = changes[0]
    const headline =
      changes.length === 1 && first !== undefined
        ? first.before === undefined
          ? `${first.name} is set to ${shorten(formatValue(trace, first.after), 32)}`
          : `${first.name} changes from ${shorten(formatValue(trace, first.before), 20)} to ${shorten(formatValue(trace, first.after), 20)}`
        : `${changes.length} values change`
    const assignment = /^(.*?)(?:\+=|-=|\*=|\/=|%=|=(?!=))(.+?);?$/.exec(source)
    const rhs = assignment?.[2]?.trim()
    const evaluated =
      rhs === undefined || previous === undefined
        ? undefined
        : substitute(trace, rhs, lookupIn(trace, previous))
    return withNotes({
      tone: 'info',
      headline,
      code: rhs,
      evaluated: evaluated?.changed === true ? evaluated.text : undefined,
      detail: [
        ...(changes.length > 1 ? changeText : []),
        ...(outputDetail === undefined ? [] : [outputDetail]),
      ],
    })
  }
  if (index === trace.steps.length - 1 && trace.status === 'finished') {
    return {
      tone: 'done',
      headline: 'The program finished',
      code: source || undefined,
    }
  }
  const jump = /^(continue|break)\b|\b(continue|break);?$/.test(source)
  return withNotes({
    tone: 'info',
    headline: jump
      ? `${/continue/.test(source) ? 'continue' : 'break'}: jump`
      : source === ''
        ? `Line ${step.line}`
        : `Runs ${shorten(source, 48)}`,
    code: source || undefined,
  })
}
