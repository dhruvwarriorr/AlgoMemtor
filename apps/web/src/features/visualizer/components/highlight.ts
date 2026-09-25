import type { VisualizerLanguage } from '../trace'

export type TokenKind =
  'keyword' | 'type' | 'number' | 'string' | 'comment' | 'directive' | 'plain'

export type CodeToken = { text: string; kind: TokenKind }

const cppKeywords = new Set(
  'if else for while do return break continue switch case default struct class public private protected using namespace typedef const constexpr static auto template typename true false nullptr new delete this operator sizeof inline void'.split(
    ' ',
  ),
)
const cppTypes = new Set(
  'int long short char bool float double unsigned signed string vector map set pair queue stack deque priority_queue array unordered_map unordered_set multiset multimap tuple size_t ll ull function greater less'.split(
    ' ',
  ),
)
const pythonKeywords = new Set(
  'if elif else for while return break continue def class import from as in not and or is None True False pass lambda with try except finally raise global nonlocal yield del assert'.split(
    ' ',
  ),
)
const pythonTypes = new Set(
  'int str list dict set tuple float bool range len print input map sorted enumerate zip min max sum abs'.split(
    ' ',
  ),
)

// A small, safe tokenizer for display colours only; it never affects
// execution.
export function highlightLine(
  line: string,
  language: VisualizerLanguage,
): CodeToken[] {
  const tokens: CodeToken[] = []
  const keywords = language === 'cpp' ? cppKeywords : pythonKeywords
  const types = language === 'cpp' ? cppTypes : pythonTypes
  if (language === 'cpp' && /^\s*#/.test(line))
    return [{ text: line, kind: 'directive' }]
  const pattern =
    language === 'cpp'
      ? /(\/\/.*$|\/\*.*?\*\/|"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|\b\d[\d.eE']*[uUlLfF]*\b|0x[0-9a-fA-F]+|[A-Za-z_]\w*)/g
      : /(#.*$|"""|'''|"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|\b\d[\d._eEjJ]*\b|[A-Za-z_]\w*)/g
  let last = 0
  for (
    let match = pattern.exec(line);
    match !== null;
    match = pattern.exec(line)
  ) {
    if (match.index > last)
      tokens.push({ text: line.slice(last, match.index), kind: 'plain' })
    const text = match[0]
    let kind: TokenKind = 'plain'
    if (
      text.startsWith('//') ||
      text.startsWith('/*') ||
      (language === 'python' && text.startsWith('#'))
    ) {
      kind = 'comment'
    } else if (text.startsWith('"') || text.startsWith("'")) kind = 'string'
    else if (/^\d|^0x/.test(text)) kind = 'number'
    else if (keywords.has(text)) kind = 'keyword'
    else if (types.has(text)) kind = 'type'
    tokens.push({ text, kind })
    last = match.index + text.length
  }
  if (last < line.length) tokens.push({ text: line.slice(last), kind: 'plain' })
  return tokens
}

export const tokenClass: Record<TokenKind, string> = {
  keyword: 'text-[#8b3fd9] dark:text-[#c792ea]',
  type: 'text-[#0369a1] dark:text-[#7dd3fc]',
  number: 'text-[#b45309] dark:text-[#f5b36b]',
  string: 'text-[#15803d] dark:text-[#86efac]',
  comment: 'text-muted-foreground italic',
  directive: 'text-[#9d174d] dark:text-[#f9a8d4]',
  plain: '',
}
