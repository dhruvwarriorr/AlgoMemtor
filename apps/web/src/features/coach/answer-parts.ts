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
