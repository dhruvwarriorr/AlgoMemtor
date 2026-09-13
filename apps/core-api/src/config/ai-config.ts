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

    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.protocol !== 'https:' &&
        !(parsed.protocol === 'http:' && isLoopback))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'AI_API_URL must be HTTPS or an HTTP loopback URL.',
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
    timeoutMs: positiveInteger(8000).parse(environment.AI_RANKING_TIMEOUT_MS),
    configured: internalServiceToken.length > 0,
  }
}
