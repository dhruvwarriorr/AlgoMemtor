// A small token-level preprocessor: #include and #pragma are ignored (every
// supported header is always available), #define/#undef expand object- and
// function-like macros, and #if/#ifdef/#ifndef/#elif/#else/#endif select
// code. Expanded tokens keep the line of the macro use.

import { CppCompileError, tokenize, type Token } from './lexer'

type Macro = {
  params: string[] | null
  variadic: boolean
  body: Token[]
}

// Judges define ONLINE_JUDGE, so local-only blocks (freopen of input files)
// are skipped the way they would be on the judge.
const predefined: Record<string, string> = {
  ONLINE_JUDGE: '1',
  __cplusplus: '202002L',
  __GNUC__: '13',
}

export function preprocess(source: string): Token[] {
  const raw = tokenize(source)
  const macros = new Map<string, Macro>()
  for (const [name, value] of Object.entries(predefined)) {
    macros.set(name, {
      params: null,
      variadic: false,
      body: tokenize(value).slice(0, -1),
    })
  }

  // Each entry: whether this level is active, and whether a branch of it
  // has already been taken.
  const conditions: {
    active: boolean
    taken: boolean
    parentActive: boolean
  }[] = []
  const isActive = () =>
    conditions.length === 0 || (conditions.at(-1)?.active ?? true)

  const kept: Token[] = []
  for (const token of raw) {
    if (token.kind !== 'directive') {
      if (isActive()) kept.push(token)
      continue
    }
    const match = /^(\w+)\s*([\s\S]*)$/.exec(token.value)
    const directive = match?.[1] ?? ''
    const rest = (match?.[2] ?? '').trim()
    switch (directive) {
      case 'ifdef':
      case 'ifndef': {
        const parentActive = isActive()
        const defined = macros.has(rest.split(/\s+/)[0] ?? '')
        const value = directive === 'ifdef' ? defined : !defined
        conditions.push({
          active: parentActive && value,
          taken: value,
          parentActive,
        })
        break
      }
      case 'if': {
        const parentActive = isActive()
        const value = parentActive && evaluateCondition(rest, macros, token)
        conditions.push({
          active: parentActive && value,
          taken: value,
          parentActive,
        })
        break
      }
      case 'elif': {
        const top = conditions.at(-1)
        if (top === undefined) {
          throw new CppCompileError('#elif without #if.', token.line)
        }
        if (top.taken || !top.parentActive) {
          top.active = false
        } else {
          const value = evaluateCondition(rest, macros, token)
          top.active = value
          top.taken = value
        }
        break
      }
      case 'else': {
        const top = conditions.at(-1)
        if (top === undefined) {
          throw new CppCompileError('#else without #if.', token.line)
        }
        top.active = top.parentActive && !top.taken
        top.taken = true
        break
      }
      case 'endif':
        if (conditions.pop() === undefined) {
          throw new CppCompileError('#endif without #if.', token.line)
        }
        break
      default:
        if (!isActive()) break
        if (directive === 'define') {
          defineMacro(rest, macros, token)
        } else if (directive === 'undef') {
          macros.delete(rest.split(/\s+/)[0] ?? '')
        } else if (
          directive === 'include' ||
          directive === 'pragma' ||
          directive === 'line' ||
          directive === 'warning' ||
          directive === ''
        ) {
          // Headers are built in; pragmas have no effect here.
        } else if (directive === 'error') {
          throw new CppCompileError(`#error ${rest}`, token.line)
        } else {
          throw new CppCompileError(
            `Unknown preprocessor directive #${directive}.`,
            token.line,
          )
        }
    }
  }
  if (conditions.length > 0) {
    throw new CppCompileError('Missing #endif.', raw.at(-1)?.line ?? 1)
  }
  return expand(kept, macros)
}

function defineMacro(text: string, macros: Map<string, Macro>, at: Token) {
  const nameMatch = /^([A-Za-z_]\w*)/.exec(text)
  if (nameMatch === null) {
    throw new CppCompileError('Invalid #define.', at.line)
  }
  const name = nameMatch[1] ?? ''
  let rest = text.slice(name.length)
  let params: string[] | null = null
  let variadic = false
  // Function-like only when `(` follows the name with no space.
  if (rest.startsWith('(')) {
    const close = rest.indexOf(')')
    if (close < 0) {
      throw new CppCompileError(
        `Invalid macro parameters for ${name}.`,
        at.line,
      )
    }
    params = rest
      .slice(1, close)
      .split(',')
      .map((param) => param.trim())
      .filter((param) => param !== '')
    if (params.at(-1) === '...') {
      variadic = true
      params = params.slice(0, -1)
    }
    rest = rest.slice(close + 1)
  }
  const body = tokenize(rest.trim(), at.line - 1)
    .slice(0, -1)
    .map((token) => ({ ...token, line: at.line }))
  macros.set(name, { params, variadic, body })
}

function expand(tokens: readonly Token[], macros: Map<string, Macro>): Token[] {
  const output: Token[] = []
  expandInto(tokens, macros, new Set(), output, null)
  return output
}

// Expands `tokens` into `output`. Macros in `hidden` are not re-expanded
// (they are being expanded already). `line` overrides token lines for text
// that came from a macro body.
function expandInto(
  tokens: readonly Token[],
  macros: Map<string, Macro>,
  hidden: ReadonlySet<string>,
  output: Token[],
  line: number | null,
) {
  let i = 0
  let budget = 200_000
  while (i < tokens.length) {
    budget -= 1
    if (budget < 0) {
      throw new CppCompileError(
        'Macro expansion is too large.',
        tokens[i]?.line ?? 1,
      )
    }
    const token = tokens[i]
    const macro =
      token.kind === 'ident' && !hidden.has(token.value)
        ? macros.get(token.value)
        : undefined
    if (macro === undefined) {
      output.push(line === null ? token : { ...token, line })
      i += 1
      continue
    }
    const useLine = line ?? token.line
    if (macro.params === null) {
      const nextHidden = new Set(hidden).add(token.value)
      expandInto(macro.body, macros, nextHidden, output, useLine)
      i += 1
      continue
    }
    // Function-like macro without arguments is just the name.
    if (tokens[i + 1]?.value !== '(') {
      output.push(line === null ? token : { ...token, line })
      i += 1
      continue
    }
    const args: Token[][] = [[]]
    let depth = 0
    let j = i + 2
    for (; j < tokens.length; j += 1) {
      const current = tokens[j]
      if (current.kind === 'eof') break
      if (current.value === '(' && current.kind === 'punct') depth += 1
      if (current.value === ')' && current.kind === 'punct') {
        if (depth === 0) break
        depth -= 1
      }
      if (
        current.value === ',' &&
        current.kind === 'punct' &&
        depth === 0 &&
        !(macro.variadic && args.length > macro.params.length)
      ) {
        args.push([])
        continue
      }
      args.at(-1)?.push(current)
    }
    if (tokens[j]?.value !== ')') {
      throw new CppCompileError(
        `Missing ) in the use of macro ${token.value}.`,
        token.line,
      )
    }
    if (
      args.length === 1 &&
      args[0]?.length === 0 &&
      macro.params.length === 0
    ) {
      args.pop()
    }
    const substituted = substitute(macro, args, useLine, token)
    const nextHidden = new Set(hidden).add(token.value)
    expandInto(substituted, macros, nextHidden, output, useLine)
    i = j + 1
  }
}

function substitute(
  macro: Macro,
  args: Token[][],
  line: number,
  at: Token,
): Token[] {
  const params = macro.params ?? []
  const lookup = (name: string): Token[] | undefined => {
    if (macro.variadic && name === '__VA_ARGS__') {
      const extra = args.slice(params.length)
      const joined: Token[] = []
      extra.forEach((arg, index) => {
        if (index > 0) {
          joined.push({ kind: 'punct', value: ',', line, col: at.col })
        }
        joined.push(...arg)
      })
      return joined
    }
    const index = params.indexOf(name)
    return index < 0 ? undefined : (args[index] ?? [])
  }
  const result: Token[] = []
  const body = macro.body
  for (let k = 0; k < body.length; k += 1) {
    const token = body[k]
    if (token.value === '#' && token.kind === 'punct') {
      const next = body[k + 1]
      const arg = next === undefined ? undefined : lookup(next.value)
      if (arg !== undefined) {
        result.push({
          kind: 'string',
          value: arg.map(tokenText).join(' '),
          line,
          col: at.col,
        })
        k += 1
        continue
      }
    }
    if (token.value === '##' && token.kind === 'punct') {
      const left = result.pop()
      const next = body[k + 1]
      k += 1
      if (left === undefined || next === undefined) continue
      const rightTokens = lookup(next.value) ?? [next]
      const pasted = tokenText(left) + rightTokens.map(tokenText).join('')
      result.push(
        ...tokenize(pasted)
          .slice(0, -1)
          .map((t) => ({ ...t, line })),
      )
      continue
    }
    const arg = token.kind === 'ident' ? lookup(token.value) : undefined
    if (arg !== undefined) {
      result.push(...arg.map((t) => ({ ...t, line })))
    } else {
      result.push({ ...token, line })
    }
  }
  return result
}

function tokenText(token: Token): string {
  if (token.kind === 'string') return JSON.stringify(token.value)
  if (token.kind === 'char') return `'${token.value}'`
  return token.value
}

// #if expressions: integers, defined(X), macros, and C operators.
function evaluateCondition(
  text: string,
  macros: Map<string, Macro>,
  at: Token,
): boolean {
  const withDefined = text.replace(
    /defined\s*\(\s*(\w+)\s*\)|defined\s+(\w+)/g,
    (_, a: string | undefined, b: string | undefined) =>
      macros.has(a ?? b ?? '') ? '1' : '0',
  )
  const tokens = expand(tokenize(withDefined, at.line - 1), macros)
  let position = 0
  const peek = () => tokens[position]
  const next = () => tokens[position++]
  const fail = (): never => {
    throw new CppCompileError(`Cannot evaluate #if ${text}.`, at.line)
  }
  const precedence: Record<string, number> = {
    '||': 1,
    '&&': 2,
    '|': 3,
    '^': 4,
    '&': 5,
    '==': 6,
    '!=': 6,
    '<': 7,
    '>': 7,
    '<=': 7,
    '>=': 7,
    '<<': 8,
    '>>': 8,
    '+': 9,
    '-': 9,
    '*': 10,
    '/': 10,
    '%': 10,
  }
  const primary = (): number => {
    const token = next()
    if (token === undefined) return fail()
    if (token.value === '(') {
      const value = binary(0)
      if (next()?.value !== ')') fail()
      return value
    }
    if (token.value === '!') return primary() === 0 ? 1 : 0
    if (token.value === '-') return -primary()
    if (token.value === '+') return primary()
    if (token.value === '~') return ~primary()
    if (token.kind === 'number') {
      const value = Number.parseInt(token.value.replace(/[uUlL]+$/, ''))
      return Number.isFinite(value) ? value : fail()
    }
    if (token.kind === 'ident') return 0
    return fail()
  }
  const binary = (minimum: number): number => {
    let left = primary()
    for (;;) {
      const op = peek()
      const level = op === undefined ? undefined : precedence[op.value]
      if (op === undefined || level === undefined || level <= minimum) break
      next()
      const right = binary(level)
      left = applyOperator(op.value, left, right)
    }
    if (peek()?.value === '?') {
      next()
      const yes = binary(0)
      if (next()?.value !== ':') fail()
      const no = binary(0)
      return left !== 0 ? yes : no
    }
    return left
  }
  const value = binary(0)
  return value !== 0
}

function applyOperator(op: string, a: number, b: number): number {
  switch (op) {
    case '||':
      return a !== 0 || b !== 0 ? 1 : 0
    case '&&':
      return a !== 0 && b !== 0 ? 1 : 0
    case '|':
      return a | b
    case '^':
      return a ^ b
    case '&':
      return a & b
    case '==':
      return a === b ? 1 : 0
    case '!=':
      return a !== b ? 1 : 0
    case '<':
      return a < b ? 1 : 0
    case '>':
      return a > b ? 1 : 0
    case '<=':
      return a <= b ? 1 : 0
    case '>=':
      return a >= b ? 1 : 0
    case '<<':
      return a << b
    case '>>':
      return a >> b
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return b === 0 ? 0 : Math.trunc(a / b)
    default:
      return b === 0 ? 0 : a % b
  }
}
