import { describe, expect, it } from 'vitest'

import { readCodeforcesProviderConfig } from './provider-config.js'

describe('readCodeforcesProviderConfig', () => {
  it('uses rate-safe defaults for anonymous metadata access', () => {
    expect(readCodeforcesProviderConfig({})).toEqual({
      baseUrl: 'https://codeforces.com/api',
      cacheTtlMs: 3_600_000,
      timeoutMs: 8000,
      maxAttempts: 2,
      minRequestIntervalMs: 2100,
      activityMinRefreshIntervalMs: 900_000,
      catalogEnabled: true,
      contentEnabled: true,
      profileEnabled: true,
      activityEnabled: true,
      contestsEnabled: true,
    })
  })

  it.each([
    'http://codeforces.com/api',
    'https://codeforces.example/api',
    'https://user:password@codeforces.com/api',
    'https://codeforces.com:444/api',
    'https://codeforces.com/api?key=value',
  ])('rejects an unsafe API base URL: %s', (baseUrl) => {
    expect(() =>
      readCodeforcesProviderConfig({ CODEFORCES_API_BASE_URL: baseUrl }),
    ).toThrow()
  })
})
