import { z } from 'zod'

const positiveIntegerFromEnvironment = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback)

const nonNegativeIntegerFromEnvironment = (fallback: number) =>
  z.coerce.number().int().nonnegative().default(fallback)

const CodeforcesProviderEnvironmentSchema = z.object({
  CODEFORCES_API_BASE_URL: z
    .string()
    .url()
    .default('https://codeforces.com/api'),
  PROVIDER_CACHE_TTL_SECONDS: positiveIntegerFromEnvironment(3600),
  PROVIDER_TIMEOUT_MS: positiveIntegerFromEnvironment(8000),
  PROVIDER_MAX_ATTEMPTS: positiveIntegerFromEnvironment(2),
  CODEFORCES_MIN_REQUEST_INTERVAL_MS: nonNegativeIntegerFromEnvironment(2100),
})

export type CodeforcesProviderConfig = {
  baseUrl: string
  cacheTtlMs: number
  timeoutMs: number
  maxAttempts: number
  minRequestIntervalMs: number
}

export const readCodeforcesProviderConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): CodeforcesProviderConfig => {
  const parsed = CodeforcesProviderEnvironmentSchema.parse(environment)
  const baseUrl = new URL(parsed.CODEFORCES_API_BASE_URL)

  if (
    baseUrl.protocol !== 'https:' ||
    baseUrl.hostname !== 'codeforces.com' ||
    baseUrl.username !== '' ||
    baseUrl.password !== '' ||
    baseUrl.port !== '' ||
    baseUrl.search !== '' ||
    baseUrl.hash !== ''
  ) {
    throw new Error(
      'CODEFORCES_API_BASE_URL must be an HTTPS URL on codeforces.com without credentials, query parameters, fragments, or a custom port.',
    )
  }

  return {
    baseUrl: baseUrl.toString(),
    cacheTtlMs: parsed.PROVIDER_CACHE_TTL_SECONDS * 1000,
    timeoutMs: parsed.PROVIDER_TIMEOUT_MS,
    maxAttempts: parsed.PROVIDER_MAX_ATTEMPTS,
    minRequestIntervalMs: parsed.CODEFORCES_MIN_REQUEST_INTERVAL_MS,
  }
}
