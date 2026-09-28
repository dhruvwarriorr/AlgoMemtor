import {
  ProblemContentSchema,
  type ProviderKey,
} from '@algomemtor/shared-contracts'

import {
  extractHtmlSectionText,
  parseProviderExamples,
  providerHtmlToText,
  sanitizeProviderHtml,
} from './provider-html-sanitizer'

const splitLines = (value: string | undefined) =>
  value === undefined
    ? []
    : value
        .split(/\n+/)
        .map((line) => line.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 100)

export const problemContentFromHtml = (input: {
  provider: ProviderKey
  externalId: string
  canonicalUrl: string
  title: string
  html: string
  sourceUrl: string
  fetchedAt?: string
  schemaVersion: string
}) => {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString()
  const statementHtml = sanitizeProviderHtml(input.html)
  const statementText = providerHtmlToText(input.html)
  const constraints = splitLines(
    extractHtmlSectionText(input.html, /\bconstraints?\s*:/i, [
      /\bexamples?\s*:/i,
      /\bfollow[- ]?up\s*:/i,
      /\boutput\s*:/i,
      /\bnote\s*:/i,
    ]),
  )
  return ProblemContentSchema.parse({
    provider: input.provider,
    externalId: input.externalId,
    canonicalUrl: input.canonicalUrl,
    title: input.title,
    ...(statementHtml === '' ? {} : { statementHtml }),
    ...(statementText === '' ? {} : { statementText }),
    constraints,
    examples: parseProviderExamples(input.html),
    hints: [],
    isPaidOnly: false,
    completeness: 'complete',
    provenance: {
      provider: input.provider,
      providerId: input.externalId,
      canonicalUrl: input.canonicalUrl,
      sourceUrl: input.sourceUrl,
      extractionStrategy: 'sanitized_html',
      schemaVersion: input.schemaVersion,
      completeness: 'complete',
      fetchedAt,
      stale: false,
    },
  })
}

export const problemContentFromLeetCode = (input: {
  externalId: string
  canonicalUrl: string
  title: string
  content?: string | null
  hints?: readonly string[] | null
  isPaidOnly: boolean
  sourceUrl: string
  fetchedAt?: string
}) => {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString()
  const contentHtml = input.isPaidOnly ? '' : (input.content ?? '')
  const statementHtml = sanitizeProviderHtml(contentHtml)
  const statementText = providerHtmlToText(contentHtml)
  const constraints = splitLines(
    extractHtmlSectionText(contentHtml, /\bconstraints?\s*:/i, [
      /\bfollow[- ]?up\s*:/i,
      /\bexample\s*\d*\s*:/i,
    ]),
  )
  const hints = (input.isPaidOnly ? [] : (input.hints ?? []))
    .map((hint) => providerHtmlToText(hint))
    .filter(Boolean)
    .slice(0, 100)
  return ProblemContentSchema.parse({
    provider: 'leetcode',
    externalId: input.externalId,
    canonicalUrl: input.canonicalUrl,
    title: input.title,
    ...(statementHtml === '' ? {} : { statementHtml }),
    ...(statementText === '' ? {} : { statementText }),
    constraints,
    examples: parseProviderExamples(contentHtml),
    hints,
    isPaidOnly: input.isPaidOnly,
    completeness:
      input.isPaidOnly || statementHtml === '' ? 'partial' : 'complete',
    provenance: {
      provider: 'leetcode',
      providerId: input.externalId,
      canonicalUrl: input.canonicalUrl,
      sourceUrl: input.sourceUrl,
      extractionStrategy: 'public_graphql',
      schemaVersion: 'leetcode-question-content-v1',
      completeness:
        input.isPaidOnly || statementHtml === '' ? 'partial' : 'complete',
      fetchedAt,
      stale: false,
    },
  })
}
