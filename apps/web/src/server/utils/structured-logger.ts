export type SafeLogValue =
  string | number | boolean | readonly string[] | null | undefined

export type SafeLogFields = Record<string, SafeLogValue>

export interface StructuredLogger {
  info(event: string, fields?: SafeLogFields): void
  warn(event: string, fields?: SafeLogFields): void
  error(event: string, fields?: SafeLogFields): void
}

const permittedFields = new Set([
  'requestId',
  'service',
  'route',
  'provider',
  'cacheStatus',
  'latencyMs',
  'durationMs',
  'httpStatus',
  'resultCount',
  'discovered',
  'added',
  'confirmedSolved',
  'complete',
  'invalidProblemCount',
  'invalidStatisticsCount',
  'unsupportedProblemCount',
  'attempt',
  'errorCode',
  'errorName',
  'dbCode',
  'retryable',
  'stale',
  'model',
  'fallback',
  'fallbackReason',
  'candidateIds',
  'returnedIds',
  'candidateCount',
  'selectedCount',
  'inputTokens',
  'outputTokens',
  'estimatedCostUsd',
  // Browser-connector sync outcomes; the detail is text the extension writes.
  'status',
  'detail',
])

const sanitizeFields = (fields: SafeLogFields = {}) =>
  Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) => permittedFields.has(key) && value !== undefined,
    ),
  )

const write = (
  level: 'info' | 'warn' | 'error',
  event: string,
  fields?: SafeLogFields,
) => {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeFields(fields),
  })

  if (level === 'error') {
    console.error(entry)
    return
  }

  if (level === 'warn') {
    console.warn(entry)
    return
  }

  console.info(entry)
}

export const structuredLogger: StructuredLogger = {
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields),
}
