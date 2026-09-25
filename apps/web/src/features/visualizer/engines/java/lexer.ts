// Tokenizer for Java source. It produces the same tokens as the C++ lexer so
// the Java parser can build the shared AST. Annotations (@Override) are
// dropped; there is no preprocessor.

import { CppCompileError, type Token } from '../cpp/lexer'

const punctuators = [
  '>>>=',
  '<<=',
  '>>=',
  '>>>',
  '...',
  '->',
  '::',
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
]

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c)
const isIdentPart = (c: string) => /[A-Za-z0-9_$]/.test(c)
const isDigit = (c: string) => c >= '0' && c <= '9'

const numberPatterns = [
  /0[xX][0-9a-fA-F_]+[lL]?/y,
  /0[bB][01_]+[lL]?/y,
  /(?:\d[\d_]*(?:\.(?:\d[\d_]*)?)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?[fFdDlL]?/y,
]

export class JavaCompileError extends CppCompileError {}

export function tokenizeJava(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let col = 1
  const n = source.length

  const advance = (count: number) => {
    for (let k = 0; k < count; k += 1) {
      if (source[i] === '\n') {
        line += 1
        col = 1
      } else {
        col += 1
      }
      i += 1
    }
  }

  const fail = (message: string, atLine = line, atCol = col): never => {
    throw new JavaCompileError(message, atLine, atCol)
  }

  while (i < n) {
    const c = source[i] ?? ''
    if (c === '\n' || c === ' ' || c === '\t' || c === '\r' || c === '\f') {
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
      if (i >= n) fail('Unterminated /* comment.', startLine)
      advance(2)
      continue
    }
    const startLine = line
    const startCol = col
    // Annotations such as @Override or @SuppressWarnings("unchecked").
    if (c === '@') {
      advance(1)
      while (i < n && isIdentPart(source[i] ?? '')) advance(1)
      if (source[i] === '(') {
        let depth = 0
        do {
          if (source[i] === '(') depth += 1
          if (source[i] === ')') depth -= 1
          advance(1)
        } while (i < n && depth > 0)
      }
      continue
    }
    if (isIdentStart(c)) {
      let j = i + 1
      while (j < n && isIdentPart(source[j] ?? '')) j += 1
      tokens.push({
        kind: 'ident',
        value: source.slice(i, j),
        line: startLine,
        col: startCol,
      })
      advance(j - i)
      continue
    }
    if (isDigit(c) || (c === '.' && isDigit(source[i + 1] ?? ''))) {
      const match = numberPatterns
        .map((pattern) => {
          pattern.lastIndex = i
          return pattern.exec(source)
        })
        .find((found) => found !== null)
      const text = match?.[0] ?? c
      tokens.push({
        kind: 'number',
        value: text.replaceAll('_', ''),
        line: startLine,
        col: startCol,
      })
      advance(text.length)
      continue
    }
    if (c === '"' && source.startsWith('"""', i)) {
      fail(
        'Text blocks (""") are not supported by the visualizer.',
        startLine,
        startCol,
      )
    }
    if (c === '"' || c === "'") {
      const quote = c
      let j = i + 1
      let value = ''
      while (j < n && source[j] !== quote) {
        if (source[j] === '\n') {
          fail(
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
      if (j >= n) fail('Unterminated literal.', startLine, startCol)
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
    if (punct === undefined)
      fail(`Unexpected character '${c}'.`, startLine, startCol)
    tokens.push({
      kind: 'punct',
      value: punct as string,
      line: startLine,
      col: startCol,
    })
    advance((punct as string).length)
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
    b: '\b',
    f: '\f',
    s: ' ',
    '0': '\0',
    '\\': '\\',
    "'": "'",
    '"': '"',
  }
  if (c === 'u') {
    let j = at
    while (source[j] === 'u') j += 1
    const hex = source.slice(j, j + 4)
    const code = Number.parseInt(hex, 16)
    return [String.fromCharCode(Number.isFinite(code) ? code : 0), j + 4 - at]
  }
  if (/[0-7]/.test(c)) {
    let j = at
    while (j < at + 3 && /[0-7]/.test(source[j] ?? '')) j += 1
    return [
      String.fromCharCode(Number.parseInt(source.slice(at, j), 8)),
      j - at,
    ]
  }
  return [simple[c] ?? c, 1]
}
