const allowedTags = new Set([
  'article',
  'aside',
  'blockquote',
  'br',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
])

const removableBlock =
  /<(?:script|style|iframe|object|embed|form|input|button|textarea|select|svg|math|noscript|template)\b[^>]*>[\s\S]*?<\/(?:script|style|iframe|object|embed|form|input|button|textarea|select|svg|math|noscript|template)>/gi

const escapeAttribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

const decodeEntities = (value: string) =>
  value
    .replaceAll(/&nbsp;/gi, ' ')
    .replaceAll(/&amp;/gi, '&')
    .replaceAll(/&lt;/gi, '<')
    .replaceAll(/&gt;/gi, '>')
    .replaceAll(/&quot;/gi, '"')
    .replaceAll(/&#39;/gi, "'")
    .replaceAll(/&#(\d+);/g, (_, decimal: string) => {
      const codePoint = Number(decimal)
      return Number.isSafeInteger(codePoint) &&
        codePoint >= 0 &&
        codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : ''
    })

const safeUrl = (value: string) => {
  try {
    const url = new URL(value, 'https://provider.invalid')
    if (url.protocol !== 'https:') return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

const sanitizeOpeningTag = (raw: string) => {
  const match = /^<\s*([a-z0-9]+)([\s\S]*?)\/?\s*>$/i.exec(raw)
  if (match === null) return ''
  const tag = match[1]?.toLowerCase()
  if (tag === undefined || !allowedTags.has(tag)) return ''
  const attributes = match[2] ?? ''
  const safeAttributes: string[] = []
  const attributePattern =
    /([a-z_:][-a-z0-9_:]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi
  for (const attribute of attributes.matchAll(attributePattern)) {
    const name = attribute[1]?.toLowerCase()
    if (name === undefined || name.startsWith('on') || name === 'style')
      continue
    if (name === 'href' || name === 'src') {
      const value = attribute[2] ?? attribute[3] ?? attribute[4]
      if (value === undefined || safeUrl(value) === undefined) continue
      safeAttributes.push(
        `${name}="${escapeAttribute(safeUrl(value) ?? value)}"`,
      )
      continue
    }
    if (
      name !== 'class' &&
      name !== 'id' &&
      name !== 'colspan' &&
      name !== 'rowspan'
    )
      continue
    const value = attribute[2] ?? attribute[3] ?? attribute[4]
    if (value === undefined) continue
    safeAttributes.push(`${name}="${escapeAttribute(value.slice(0, 256))}"`)
  }
  return `<${tag}${safeAttributes.length === 0 ? '' : ` ${safeAttributes.join(' ')}`}>`
}

export const sanitizeProviderHtml = (html: string, maxLength = 200_000) => {
  const withoutBlocks = html.replaceAll(removableBlock, '')
  const withoutComments = withoutBlocks.replaceAll(/<!--[\s\S]*?-->/g, '')
  const sanitized = withoutComments.replaceAll(/<[^>]*>/g, (tag) => {
    if (/^<\s*\//.test(tag)) {
      const name = /^<\s*\/\s*([a-z0-9]+)/i.exec(tag)?.[1]?.toLowerCase()
      return name !== undefined && allowedTags.has(name) ? `</${name}>` : ''
    }
    return sanitizeOpeningTag(tag)
  })
  return sanitized.slice(0, maxLength)
}

export const providerHtmlToText = (html: string) =>
  decodeEntities(
    sanitizeProviderHtml(html)
      .replaceAll(/<br\s*\/>/gi, '\n')
      .replaceAll(/<\/p>/gi, '\n\n')
      .replaceAll(/<\/li>/gi, '\n')
      .replaceAll(/<[^>]+>/g, '')
      .replaceAll(/[ \t]+/g, ' ')
      .replaceAll(/\n[ \t]+/g, '\n')
      .replaceAll(/\n{3,}/g, '\n\n')
      .trim(),
  )

export const extractHtmlSectionText = (
  html: string,
  heading: RegExp,
  stopHeadings: readonly RegExp[] = [],
) => {
  const text = providerHtmlToText(html)
  const start = text.search(heading)
  if (start < 0) return undefined
  const after = text.slice(start).replace(heading, '').trim()
  const stop = stopHeadings
    .map((pattern) => after.search(pattern))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]
  return (stop === undefined ? after : after.slice(0, stop)).trim() || undefined
}

export const parseProviderExamples = (html: string) => {
  const examples: Array<{
    input: string
    output: string
    explanation?: string
  }> = []
  for (const match of html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)) {
    const text = providerHtmlToText(match[1] ?? '')
    const inputMatch = /(?:^|\n)\s*Input:\s*([\s\S]*?)(?=\s+Output:|$)/i.exec(
      text,
    )
    const outputMatch =
      /(?:^|\n)\s*Output:\s*([\s\S]*?)(?=\s+Explanation:|$)/i.exec(text)
    const explanationMatch = /(?:^|\n)\s*Explanation:\s*([\s\S]*)$/i.exec(text)
    const input = (inputMatch?.[1] ?? text).trim()
    const output = (outputMatch?.[1] ?? '').trim()
    if (input === '' && output === '') continue
    examples.push({
      input,
      output,
      ...(explanationMatch?.[1]?.trim()
        ? { explanation: explanationMatch[1].trim() }
        : {}),
    })
  }
  return examples
}
