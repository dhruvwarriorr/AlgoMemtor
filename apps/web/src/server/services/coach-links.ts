import {
  isSafeCoachPublicUrl,
  type ExternalProblemSummary,
  type ProblemContent,
  type ProviderKey,
} from '@algomemtor/shared-contracts'

// Links a learner pastes into the coach. Platform problem links are resolved
// to catalog identities and read through the provider adapters (the same
// path as the problem detail page); the statement is transient context for
// one turn and is never stored.

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi
const MAX_LINKS = 3

export function extractCoachUrls(text: string): string[] {
  const urls: string[] = []
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0].replace(/[.,;:!?]+$/, '')
    const candidate = raw.replace(/^http:\/\//i, 'https://')
    if (!isSafeCoachPublicUrl(candidate) || urls.includes(candidate)) continue
    urls.push(candidate)
    if (urls.length === MAX_LINKS) break
  }
  return urls
}

export type LinkedProblemReference = {
  url: string
  provider: ProviderKey
  externalId?: string
  // LeetCode links carry a slug; the catalog maps it to the numeric ID.
  leetcodeSlug?: string
}

export function providerProblemFromUrl(
  value: string,
): LinkedProblemReference | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^(?:www|m)\./, '')
  const path = url.pathname
  if (host === 'codeforces.com' || host === 'codeforces.ml') {
    const match =
      /\/(?:problemset\/problem|contest|gym)\/(\d+)\/(?:problem\/)?([A-Za-z][0-9]?)\b/.exec(
        path,
      )
    return match?.[1] !== undefined && match[2] !== undefined
      ? {
          url: value,
          provider: 'codeforces',
          externalId: `${match[1]}${match[2].toUpperCase()}`,
        }
      : null
  }
  if (host === 'codechef.com') {
    const match = /\/problems\/([A-Za-z0-9_]+)/.exec(path)
    return match?.[1] === undefined
      ? null
      : {
          url: value,
          provider: 'codechef',
          externalId: match[1].toUpperCase(),
        }
  }
  if (host === 'cses.fi') {
    const match = /\/problemset\/(?:task|view|result)\/(\d+)/.exec(path)
    return match?.[1] === undefined
      ? null
      : { url: value, provider: 'cses', externalId: match[1] }
  }
  if (host === 'leetcode.com' || host === 'leetcode.cn') {
    const match = /\/problems\/([a-z0-9-]+)/i.exec(path)
    return match?.[1] === undefined
      ? null
      : {
          url: value,
          provider: 'leetcode',
          leetcodeSlug: match[1].toLowerCase(),
        }
  }
  return null
}

export function leetcodeIdForSlug(
  slug: string,
  catalog: readonly ExternalProblemSummary[],
) {
  return catalog.find(
    (problem) =>
      problem.provider === 'leetcode' &&
      problem.canonicalUrl.toLowerCase().includes(`/problems/${slug}/`),
  )?.externalId
}

const htmlToText = (html: string) =>
  html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|pre|tr)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim()

export type LinkedProblem = {
  provider: ProviderKey
  externalId: string
  title: string
  url: string
  statement: string
}

// Plain text for the model: statement, constraints and samples, bounded.
export function linkedProblemFromContent(
  content: ProblemContent,
  maxLength = 9_000,
): LinkedProblem {
  const statement =
    content.statementText ??
    (content.statementHtml === undefined
      ? ''
      : htmlToText(content.statementHtml))
  const parts = [
    statement,
    content.constraints.length > 0
      ? `Constraints:\n${content.constraints.map((item) => `- ${item}`).join('\n')}`
      : '',
    ...content.examples
      .slice(0, 3)
      .map(
        (example, index) =>
          `Example ${index + 1}\nInput:\n${example.input}\nOutput:\n${example.output}${
            example.explanation ? `\nExplanation: ${example.explanation}` : ''
          }`,
      ),
  ].filter((part) => part.trim() !== '')
  const text = parts.join('\n\n')
  return {
    provider: content.provider,
    externalId: content.externalId,
    title: content.title.slice(0, 200),
    url: content.canonicalUrl,
    statement:
      text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n…`,
  }
}

// Answer links stay clickable when they are safe public https URLs. With an
// allowlist, only those URLs do. Unsafe links (other schemes, credentials,
// private or internal hosts) are reduced to their site name.
export function allowedCoachAnswerUrl(
  value: string,
  allowed?: ReadonlySet<string>,
) {
  return (
    isSafeCoachPublicUrl(value) &&
    (allowed === undefined ||
      allowed.has(value) ||
      allowed.has(value.replace(/\/+$/, '')))
  )
}
