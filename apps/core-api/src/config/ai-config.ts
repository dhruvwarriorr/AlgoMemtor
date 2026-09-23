import { z } from 'zod'

const safeBaseUrl = z
  .string()
  .trim()
  .url()
  .transform((value, context) => {
    const parsed = new URL(value)
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(
      parsed.hostname,
    )
    // A single-label name (such as `ai-api`) only resolves as a service name
    // on a private container network, never across the public internet.
    const isPrivateServiceName = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(
      parsed.hostname,
    )

    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.protocol !== 'https:' &&
        !(parsed.protocol === 'http:' && (isLoopback || isPrivateServiceName)))
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'AI_API_URL must be HTTPS, HTTP loopback, or HTTP to a private service name.',
      })
      return z.NEVER
    }

    return parsed.toString()
  })

const positiveInteger = (fallback: number) =>
  z.coerce.number().int().positive().catch(fallback)

export const readAiRecommendationConfig = (
  environment: NodeJS.ProcessEnv = process.env,
) => {
  const baseUrl = safeBaseUrl.parse(
    environment.AI_API_URL ?? 'http://localhost:8000',
  )
  const internalServiceToken = environment.INTERNAL_SERVICE_TOKEN?.trim() ?? ''

  return {
    baseUrl,
    internalServiceToken,
    // Ranking p50 is ~9s and p90 ~40s on Flash-Lite; a short timeout silently
    // turns most AI rankings into deterministic fallbacks.
    timeoutMs: positiveInteger(25_000).parse(environment.AI_RANKING_TIMEOUT_MS),
    configured: internalServiceToken.length > 0,
  }
}
