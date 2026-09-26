// Mello reads the page the learner is on when they ask a question, so the
// coach can answer about what is on screen. The text travels as the coach
// request's transientContext, which is used for that turn and never saved.

// Kept short: every character is reading time for a local model.
export const pageContextLimit = 4_000

// Never read form fields, hidden or decorative content, or Mello itself.
const skipSelector = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'input',
  'textarea',
  'select',
  '[aria-hidden="true"]',
  '[hidden]',
  '[data-mello-ignore]',
].join(',')

export type PageSnapshot = {
  title: string
  path: string
  headings: string[]
  text: string
}

// Drop what adds length but no meaning: a line repeated right after itself
// (a number drawn twice) and lines that recur many times (calendar cells).
export function condense(text: string) {
  const counts = new Map<string, number>()
  const kept: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line === kept.at(-1)) continue
    const seen = counts.get(line) ?? 0
    counts.set(line, seen + 1)
    if (seen >= 2) continue
    kept.push(line)
  }
  return kept.join('\n')
}

export function composePageContext(snapshot: PageSnapshot) {
  const header = [
    'The learner has this AlgoMemtor page open while asking. "This page", "here" and "this" refer to it; answer from what it shows (read by Mello when they asked; not saved):',
    `Title: ${snapshot.title || 'Untitled'}`,
    `Address: ${snapshot.path}`,
    snapshot.headings.length > 0
      ? `Headings: ${snapshot.headings.join(' · ')}`
      : null,
    'Visible text:',
  ]
    .filter((line) => line !== null)
    .join('\n')
  const room = Math.max(0, pageContextLimit - header.length - 2)
  const text = condense(snapshot.text)
  const body =
    text.length > room ? `${text.slice(0, Math.max(0, room - 1))}…` : text
  return `${header}\n${body || '(no readable text)'}`
}

const blockDisplays = new Set([
  'block',
  'flex',
  'grid',
  'list-item',
  'table',
  'table-row',
  'flow-root',
])

function isRendered(element: Element) {
  if ('checkVisibility' in element) {
    return element.checkVisibility({ visibilityProperty: true })
  }
  return true
}

// Walk the visible text of the main content, one line per block.
export function readPageSnapshot(
  root: Element | null = document.getElementById('main-content'),
): PageSnapshot {
  const scope = root ?? document.body
  const lines: string[] = []
  let current = ''
  let currentBlock: Element | null = null
  let length = 0

  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent || parent.closest(skipSelector)) {
        return NodeFilter.FILTER_REJECT
      }
      return node.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
    },
  })

  const visibility = new Map<Element, boolean>()
  for (
    let node = walker.nextNode();
    node !== null && length < pageContextLimit * 1.5;
    node = walker.nextNode()
  ) {
    const parent = node.parentElement
    if (!parent) continue
    let visible = visibility.get(parent)
    if (visible === undefined) {
      visible = isRendered(parent)
      visibility.set(parent, visible)
    }
    if (!visible) continue
    let block: Element | null = parent
    while (
      block &&
      block !== scope &&
      !blockDisplays.has(getComputedStyle(block).display)
    ) {
      block = block.parentElement
    }
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (block !== currentBlock && current) {
      lines.push(current)
      current = ''
    }
    currentBlock = block
    current = current ? `${current} ${text}` : text
    length += text.length + 1
  }
  if (current) lines.push(current)

  const headings = Array.from(scope.querySelectorAll('h1, h2, h3'))
    .filter((heading) => !heading.closest(skipSelector))
    .map((heading) => heading.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)
    .slice(0, 12)

  return {
    title: document.title,
    path: `${window.location.pathname}${window.location.search}`,
    headings,
    text: lines.join('\n'),
  }
}

// Greetings and thanks do not need the page, and sending it would skip the
// coach's quick small-talk path.
export function wantsPageContext(question: string) {
  const text = question.trim().toLowerCase()
  return !/^(hi|hii+|hey|hello|yo|thanks|thank you|thx|ok|okay|cool|bye|good (morning|night|evening))\b[\s!.?]*$/.test(
    text,
  )
}
