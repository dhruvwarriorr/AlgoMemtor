import { z } from 'zod'

const positiveIntegerFromEnvironment = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback)

const nonNegativeIntegerFromEnvironment = (fallback: number) =>
  z.coerce.number().int().nonnegative().default(fallback)

const booleanFromEnvironment = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .default(fallback ? 'true' : 'false')
    .transform((value) => value === 'true')

const CodeforcesProviderEnvironmentSchema = z.object({
  CODEFORCES_API_BASE_URL: z
    .string()
    .url()
    .default('https://codeforces.com/api'),
  PROVIDER_CACHE_TTL_SECONDS: positiveIntegerFromEnvironment(3600),
  PROVIDER_TIMEOUT_MS: positiveIntegerFromEnvironment(8000),
  PROVIDER_MAX_ATTEMPTS: positiveIntegerFromEnvironment(2),
  CODEFORCES_MIN_REQUEST_INTERVAL_MS: nonNegativeIntegerFromEnvironment(2100),
  PROVIDER_ACTIVITY_MIN_REFRESH_INTERVAL_MS:
    positiveIntegerFromEnvironment(900_000),
})

const UnifiedProviderEnvironmentSchema =
  CodeforcesProviderEnvironmentSchema.extend({
    CODECHEF_API_BASE_URL: z.string().url().default('https://www.codechef.com'),
    LEETCODE_GRAPHQL_URL: z
      .string()
      .url()
      .default('https://leetcode.com/graphql'),
    PROVIDER_CODEFORCES_ENABLED: booleanFromEnvironment(true),
    PROVIDER_CODECHEF_ENABLED: booleanFromEnvironment(true),
    PROVIDER_LEETCODE_ENABLED: booleanFromEnvironment(true),
    CODECHEF_MIN_REQUEST_INTERVAL_MS: nonNegativeIntegerFromEnvironment(1000),
    LEETCODE_MIN_REQUEST_INTERVAL_MS: nonNegativeIntegerFromEnvironment(1000),
    CODECHEF_CATALOG_LIMIT: positiveIntegerFromEnvironment(5000),
    LEETCODE_CATALOG_PAGE_SIZE: positiveIntegerFromEnvironment(100),
    LEETCODE_CATALOG_MAX_PAGES: positiveIntegerFromEnvironment(10),
    PROVIDER_CATALOG_CACHE_TTL_SECONDS: positiveIntegerFromEnvironment(21_600),
    PROVIDER_CONTEST_CACHE_TTL_SECONDS: positiveIntegerFromEnvironment(900),
    PROVIDER_CONTENT_CACHE_TTL_SECONDS:
      positiveIntegerFromEnvironment(2_592_000),
  })

export type CodeforcesProviderConfig = {
  baseUrl: string
  cacheTtlMs: number
  timeoutMs: number
  maxAttempts: number
  minRequestIntervalMs: number
  activityMinRefreshIntervalMs: number
  catalogEnabled: boolean
  contentEnabled: boolean
  profileEnabled: boolean
  activityEnabled: boolean
  contestsEnabled: boolean
}

export type ProviderCapabilityConfig = {
  catalog: boolean
  content: boolean
  profile: boolean
  activity: boolean
  contests: boolean
}

export type UnifiedProviderConfig = {
  catalogCacheTtlMs: number
  contestCacheTtlMs: number
  contentCacheTtlMs: number
  codeforces: CodeforcesProviderConfig
  codechef: {
    baseUrl: string
    cacheTtlMs: number
    timeoutMs: number
    maxAttempts: number
    minRequestIntervalMs: number
    catalogLimit: number
    catalogEnabled: boolean
    contentEnabled: boolean
    profileEnabled: boolean
    activityEnabled: boolean
    contestsEnabled: boolean
  }
  leetcode: {
    baseUrl: string
    cacheTtlMs: number
    timeoutMs: number
    maxAttempts: number
    minRequestIntervalMs: number
    pageSize: number
    maxPages: number
    catalogEnabled: boolean
    contentEnabled: boolean
    profileEnabled: boolean
    activityEnabled: boolean
    contestsEnabled: boolean
  }
  enabled: {
    codeforces: boolean
    codechef: boolean
    leetcode: boolean
  }
  capabilities: {
    codeforces: ProviderCapabilityConfig
    codechef: ProviderCapabilityConfig
    leetcode: ProviderCapabilityConfig
  }
}

const capabilityNames = [
  'catalog',
  'content',
  'profile',
  'activity',
  'contests',
] as const

const readCapabilityFlags = (
  environment: NodeJS.ProcessEnv,
  provider: 'CODEFORCES' | 'CODECHEF' | 'LEETCODE',
): ProviderCapabilityConfig =>
  Object.fromEntries(
    capabilityNames.map((capability) => {
      const key = `PROVIDER_${provider}_${capability.toUpperCase()}_ENABLED`
      const value = environment[key]
      if (value !== undefined && value !== 'true' && value !== 'false') {
        throw new Error(`${key} must be either true or false.`)
      }
      return [capability, value !== 'false']
    }),
  ) as ProviderCapabilityConfig

export const readCodeforcesProviderConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): CodeforcesProviderConfig => {
  const parsed = CodeforcesProviderEnvironmentSchema.parse(environment)
  const capabilities = readCapabilityFlags(environment, 'CODEFORCES')
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
    activityMinRefreshIntervalMs:
      parsed.PROVIDER_ACTIVITY_MIN_REFRESH_INTERVAL_MS,
    catalogEnabled: capabilities.catalog,
    contentEnabled: capabilities.content,
    profileEnabled: capabilities.profile,
    activityEnabled: capabilities.activity,
    contestsEnabled: capabilities.contests,
  }
}

const assertPublicProviderUrl = (
  value: string,
  hostname: string,
  label: string,
) => {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.hostname !== hostname ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(
      `${label} must be an HTTPS URL on ${hostname} without credentials, query parameters, fragments, or a custom port.`,
    )
  }
  return url.toString()
}

export const readUnifiedProviderConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): UnifiedProviderConfig => {
  const parsed = UnifiedProviderEnvironmentSchema.parse(environment)
  const codeforcesCapabilities = readCapabilityFlags(environment, 'CODEFORCES')
  const codechefCapabilities = readCapabilityFlags(environment, 'CODECHEF')
  const leetcodeCapabilities = readCapabilityFlags(environment, 'LEETCODE')
  return {
    catalogCacheTtlMs: parsed.PROVIDER_CATALOG_CACHE_TTL_SECONDS * 1000,
    contestCacheTtlMs: parsed.PROVIDER_CONTEST_CACHE_TTL_SECONDS * 1000,
    contentCacheTtlMs: parsed.PROVIDER_CONTENT_CACHE_TTL_SECONDS * 1000,
    codeforces: readCodeforcesProviderConfig(environment),
    codechef: {
      baseUrl: assertPublicProviderUrl(
        parsed.CODECHEF_API_BASE_URL,
        'www.codechef.com',
        'CODECHEF_API_BASE_URL',
      ),
      cacheTtlMs: parsed.PROVIDER_CACHE_TTL_SECONDS * 1000,
      timeoutMs: parsed.PROVIDER_TIMEOUT_MS,
      maxAttempts: parsed.PROVIDER_MAX_ATTEMPTS,
      minRequestIntervalMs: parsed.CODECHEF_MIN_REQUEST_INTERVAL_MS,
      catalogLimit: Math.min(parsed.CODECHEF_CATALOG_LIMIT, 10_000),
      catalogEnabled: codechefCapabilities.catalog,
      contentEnabled: codechefCapabilities.content,
      profileEnabled: codechefCapabilities.profile,
      activityEnabled: codechefCapabilities.activity,
      contestsEnabled: codechefCapabilities.contests,
    },
    leetcode: {
      baseUrl: assertPublicProviderUrl(
        parsed.LEETCODE_GRAPHQL_URL,
        'leetcode.com',
        'LEETCODE_GRAPHQL_URL',
      ),
      cacheTtlMs: parsed.PROVIDER_CACHE_TTL_SECONDS * 1000,
      timeoutMs: parsed.PROVIDER_TIMEOUT_MS,
      maxAttempts: parsed.PROVIDER_MAX_ATTEMPTS,
      minRequestIntervalMs: parsed.LEETCODE_MIN_REQUEST_INTERVAL_MS,
      pageSize: Math.min(parsed.LEETCODE_CATALOG_PAGE_SIZE, 100),
      maxPages: Math.min(parsed.LEETCODE_CATALOG_MAX_PAGES, 50),
      catalogEnabled: leetcodeCapabilities.catalog,
      contentEnabled: leetcodeCapabilities.content,
      profileEnabled: leetcodeCapabilities.profile,
      activityEnabled: leetcodeCapabilities.activity,
      contestsEnabled: leetcodeCapabilities.contests,
    },
    enabled: {
      codeforces: parsed.PROVIDER_CODEFORCES_ENABLED,
      codechef: parsed.PROVIDER_CODECHEF_ENABLED,
      leetcode: parsed.PROVIDER_LEETCODE_ENABLED,
    },
    capabilities: {
      codeforces: codeforcesCapabilities,
      codechef: codechefCapabilities,
      leetcode: leetcodeCapabilities,
    },
  }
}
