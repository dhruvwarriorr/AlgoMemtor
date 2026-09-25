// Tokenizer for the competitive-programming C++ subset the visualizer runs.
// Preprocessor lines become single `directive` tokens; everything else keeps
// its source line so every step maps back to the learner's code.

export type TokenKind =
  'ident' | 'number' | 'string' | 'char' | 'punct' | 'directive' | 'eof'

export type Token = {
  kind: TokenKind
  value: string
  line: number
  col: number
}

export class CppCompileError extends Error {
  readonly line: number
  readonly column: number | undefined
  readonly unsupported: boolean

  constructor(
    message: string,
    line: number,
    column?: number,
    unsupported = false,
  ) {
    super(message)
    this.name = 'CppCompileError'
    this.line = line
    this.column = column
    this.unsupported = unsupported
  }
}

// Longest first so `<<=` wins over `<<` and `<`.
const punctuators = [
  '<<=',
  '>>=',
  '...',
  '->*',
  '<=>',
  '::',
  '->',
  '++',
  '--',
  '<<',
  '>>',
  '<=',
  '>=',
  '==',
  '!=',
  '&&',
  '||',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '##',
  '{',
  '}',
  '(',
  ')',
  '[',
  ']',
  ';',
  ',',
  '.',
  '?',
  ':',
  '+',
  '-',
  '*',
  '/',
  '%',
  '&',
  '|',
  '^',
  '~',
  '!',
  '=',
  '<',
  '>',
  '#',
]

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c)
const isIdentPart = (c: string) => /[A-Za-z0-9_$]/.test(c)
const isDigit = (c: string) => c >= '0' && c <= '9'

export function tokenize(source: string, lineOffset = 0): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1 + lineOffset
  let col = 1
  // Only whitespace has been seen on this line so far, so `#` starts a
  // directive.
  let lineStart = true
  const n = source.length

  const advance = (count: number) => {
    for (let k = 0; k < count; k += 1) {
      if (source[i] === '\n') {
        line += 1
        col = 1
        lineStart = true
      } else {
        col += 1
      }
      i += 1
    }
  }

  while (i < n) {
    const c = source[i] ?? ''
    // Line continuation outside directives.
    if (c === '\\' && source[i + 1] === '\n') {
      advance(2)
      continue
    }
    if (c === '\n') {
      advance(1)
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      advance(1)
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') advance(1)
      continue
    }
    if (c === '/' && source[i + 1] === '*') {
      const startLine = line
      advance(2)
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) advance(1)
      if (i >= n) {
        throw new CppCompileError('Unterminated /* comment.', startLine)
      }
      advance(2)
      continue
    }
    const startLine = line
    const startCol = col
    if (c === '#' && lineStart) {
      // Collect the directive up to the end of the line, honouring `\`
      // continuations and dropping comments.
      let text = ''
      advance(1)
      while (i < n && source[i] !== '\n') {
        if (source[i] === '\\' && source[i + 1] === '\n') {
          advance(2)
          text += ' '
          continue
        }
        if (source[i] === '/' && source[i + 1] === '/') {
          while (i < n && source[i] !== '\n') advance(1)
          break
        }
        if (source[i] === '/' && source[i + 1] === '*') {
          advance(2)
          while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
            advance(1)
          }
          advance(2)
          text += ' '
          continue
        }
        text += source[i]
        advance(1)
      }
      tokens.push({
        kind: 'directive',
        value: text.trim(),
        line: startLine,
        col: startCol,
      })
      continue
    }
    lineStart = false

    if (isIdentStart(c)) {
      let j = i + 1
      while (j < n && isIdentPart(source[j] ?? '')) j += 1
      const word = source.slice(i, j)
      // Raw string literals are rare in contest code; reject clearly.
      if ((word === 'R' || word === 'u8R') && source[j] === '"') {
        throw new CppCompileError(
          'Raw string literals are not supported by the visualizer.',
          startLine,
          startCol,
          true,
        )
      }
      // Wide/UTF prefixes on literals: drop the prefix.
      if (
        (word === 'L' || word === 'u' || word === 'U' || word === 'u8') &&
        (source[j] === '"' || source[j] === "'")
      ) {
        advance(j - i)
        continue
      }
      tokens.push({
        kind: 'ident',
        value: word,
        line: startLine,
        col: startCol,
      })
      advance(j - i)
      continue
    }

    if (isDigit(c) || (c === '.' && isDigit(source[i + 1] ?? ''))) {
      let j = i
      const isHex =
        c === '0' && (source[i + 1] === 'x' || source[i + 1] === 'X')
      const isBinary =
        c === '0' && (source[i + 1] === 'b' || source[i + 1] === 'B')
      if (isHex || isBinary) j += 2
      while (j < n) {
        const d = source[j] ?? ''
        if (/[0-9A-Za-z_.']/.test(d)) {
          j += 1
          continue
        }
        // Exponent sign: 1e-9, 2E+5 (not in hex).
        if (
          (d === '+' || d === '-') &&
          !isHex &&
          /[eE]/.test(source[j - 1] ?? '')
        ) {
          j += 1
          continue
        }
        break
      }
      tokens.push({
        kind: 'number',
        value: source.slice(i, j).replaceAll("'", ''),
        line: startLine,
        col: startCol,
      })
      advance(j - i)
      continue
    }

    if (c === '"' || c === "'") {
      const quote = c
      let j = i + 1
      let value = ''
      while (j < n && source[j] !== quote) {
        if (source[j] === '\n') {
          throw new CppCompileError(
            quote === '"'
              ? 'Missing closing " in a string literal.'
              : "Missing closing ' in a character literal.",
            startLine,
            startCol,
          )
        }
        if (source[j] === '\\') {
          const [text, used] = readEscape(source, j + 1)
          value += text
          j += 1 + used
          continue
        }
        value += source[j]
        j += 1
      }
      if (j >= n) {
        throw new CppCompileError('Unterminated literal.', startLine, startCol)
      }
      tokens.push({
        kind: quote === '"' ? 'string' : 'char',
        value,
        line: startLine,
        col: startCol,
      })
      advance(j + 1 - i)
      continue
    }

    const punct = punctuators.find((p) => source.startsWith(p, i))
    if (punct === undefined) {
      throw new CppCompileError(
        `Unexpected character '${c}'.`,
        startLine,
        startCol,
      )
    }
    tokens.push({ kind: 'punct', value: punct, line: startLine, col: startCol })
    advance(punct.length)
  }
  tokens.push({ kind: 'eof', value: '', line, col })
  return tokens
}

function readEscape(source: string, at: number): [string, number] {
  const c = source[at] ?? ''
  const simple: Record<string, string> = {
    n: '\n',
    t: '\t',
    r: '\r',
    '0': '\0',
    '\\': '\\',
    "'": "'",
    '"': '"',
    '?': '?',
    a: '\x07',
    b: '\b',
    f: '\f',
    v: '\v',
  }
  if (c === 'x') {
    let j = at + 1
    while (j < source.length && /[0-9a-fA-F]/.test(source[j] ?? '')) j += 1
    const code = Number.parseInt(source.slice(at + 1, j), 16)
    return [
      String.fromCharCode(Number.isFinite(code) ? code & 0xff : 0),
      j - at,
    ]
  }
  if (/[0-7]/.test(c)) {
    let j = at
    while (j < at + 3 && /[0-7]/.test(source[j] ?? '')) j += 1
    return [
      String.fromCharCode(Number.parseInt(source.slice(at, j), 8) & 0xff),
      j - at,
    ]
  }
  return [simple[c] ?? c, 1]
}
