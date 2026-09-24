export type CoachCodeBlock = {
  index: number
  language: string
  code: string
}

export type CoachAnswerSegment =
  { type: 'text'; text: string } | ({ type: 'code' } & CoachCodeBlock)

const fence = /^([ \t]*)(`{3,}|~{3,})([^\n`]*)\n/gm

// Splits a coach answer into prose and fenced code so the chat can show the
// prose while code lives in the side panel. An unclosed final fence (a cut
// off answer) is still treated as code.
export function splitCoachAnswer(content: string): {
  segments: CoachAnswerSegment[]
  codeBlocks: CoachCodeBlock[]
} {
  const segments: CoachAnswerSegment[] = []
  const codeBlocks: CoachCodeBlock[] = []
  let cursor = 0
  fence.lastIndex = 0
  for (;;) {
    const open = fence.exec(content)
    if (open === null) break
    const marker = open[2] ?? '```'
    const bodyStart = open.index + open[0].length
    const closePattern = new RegExp(
      `^[ \\t]*${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`,
      'm',
    )
    const rest = content.slice(bodyStart)
    const close = closePattern.exec(rest)
    const bodyEnd = close === null ? content.length : bodyStart + close.index
    const blockEnd = close === null ? content.length : bodyEnd + close[0].length
    const before = content.slice(cursor, open.index)
    if (before.trim() !== '') segments.push({ type: 'text', text: before })
    const block = {
      index: codeBlocks.length,
      language: (open[3] ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '',
      code: content.slice(bodyStart, bodyEnd).replace(/\n$/, ''),
    }
    if (block.code.trim() !== '') {
      codeBlocks.push(block)
      segments.push({ type: 'code', ...block })
    }
    cursor = blockEnd
    fence.lastIndex = blockEnd
  }
  const tail = content.slice(cursor)
  if (tail.trim() !== '') segments.push({ type: 'text', text: tail })
  return { segments, codeBlocks }
}

const languageNames: Record<string, string> = {
  cpp: 'C++',
  'c++': 'C++',
  cc: 'C++',
  c: 'C',
  py: 'Python',
  python: 'Python',
  python3: 'Python',
  java: 'Java',
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  go: 'Go',
  rust: 'Rust',
  rs: 'Rust',
  kotlin: 'Kotlin',
  kt: 'Kotlin',
  text: 'Text',
  txt: 'Text',
}

export function codeLanguageLabel(language: string) {
  return languageNames[language] ?? (language === '' ? 'Code' : language)
}

const latexSymbols: Record<string, string> = {
  '\\log': 'log',
  '\\ln': 'ln',
  '\\min': 'min',
  '\\max': 'max',
  '\\gcd': 'gcd',
  '\\bmod': 'mod',
  '\\pmod': 'mod',
  '\\mod': 'mod',
  '\\leq': '≤',
  '\\le': '≤',
  '\\geq': '≥',
  '\\ge': '≥',
  '\\neq': '≠',
  '\\ne': '≠',
  '\\approx': '≈',
  '\\cdots': '…',
  '\\ldots': '…',
  '\\dots': '…',
  '\\cdot': '·',
  '\\times': '×',
  '\\pm': '±',
  '\\infty': '∞',
  '\\rightarrow': '→',
  '\\Rightarrow': '⇒',
  '\\to': '→',
  '\\in': '∈',
  '\\sum': 'Σ',
  '\\oplus': '⊕',
  '\\lfloor': '⌊',
  '\\rfloor': '⌋',
  '\\lceil': '⌈',
  '\\rceil': '⌉',
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\lambda': 'λ',
  '\\pi': 'π',
  '\\Theta': 'Θ',
  '\\Omega': 'Ω',
  '\\left': '',
  '\\right': '',
  '\\,': ' ',
  '\\;': ' ',
  '\\quad': ' ',
}
const superscripts: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  n: 'ⁿ',
}
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function plainFormula(formula: string) {
  let text = formula
  for (let pass = 0; pass < 3; pass += 1) {
    text = text
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
      .replace(
        /\\(?:text|mathrm|mathbf|mathit|mathcal|operatorname|textbf)\{([^{}]*)\}/g,
        '$1',
      )
  }
  for (const command of Object.keys(latexSymbols).sort(
    (left, right) => right.length - left.length,
  )) {
    text = text.replace(
      new RegExp(`${escapeRegExp(command)}(?![A-Za-z])`, 'g'),
      latexSymbols[command] ?? '',
    )
  }
  return text
    .replace(/\^\{?([0-9+\-n]{1,3})\}?/g, (_match, power: string) =>
      [...power].map((char) => superscripts[char] ?? char).join(''),
    )
    .replace(/\^\{([^{}]*)\}/g, '^($1)')
    .replace(/_\{([^{}]*)\}/g, '_$1')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// The chat renders Markdown without a math engine, so "$O(N \log N)$" would
// show dollar signs and backslashes. Code is left untouched, and "$5 and $10"
// stays money: TeX spans hug their content and carry a math character.
export function plainMath(content: string) {
  return content
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part) =>
      part.startsWith('`')
        ? part
        : part.replace(
            /\$\$([^$]{1,400})\$\$|\$([^$\n]{1,200})\$|\\\((.{1,200}?)\\\)/g,
            (match, block?: string, inline?: string, paren?: string) => {
              const formula = block ?? inline ?? paren ?? ''
              if (
                inline !== undefined &&
                (formula !== formula.trim() ||
                  !/[\\^_=()+*/<>a-zA-Z]/.test(formula))
              ) {
                return match
              }
              return plainFormula(formula)
            },
          ),
    )
    .join('')
}
