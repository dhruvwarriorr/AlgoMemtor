import { describe, expect, it } from 'vitest'

import { readAiRecommendationConfig } from './ai-config.js'

describe('AI recommendation configuration', () => {
  it('is disabled without an internal token and keeps bounded defaults', () => {
    expect(readAiRecommendationConfig({})).toEqual({
      baseUrl: 'http://localhost:8000/',
      internalServiceToken: '',
      timeoutMs: 60_000,
      configured: false,
    })
  })

  it('accepts HTTPS and loopback service URLs', () => {
    expect(
      readAiRecommendationConfig({
        AI_API_URL: 'https://ai.example.com',
        AI_RANKING_TIMEOUT_MS: '4500',
        INTERNAL_SERVICE_TOKEN: '  shared-secret  ',
      }),
    ).toMatchObject({
      baseUrl: 'https://ai.example.com/',
      internalServiceToken: 'shared-secret',
      timeoutMs: 4500,
      configured: true,
    })
    expect(
      readAiRecommendationConfig({ AI_API_URL: 'http://[::1]:8000' }).baseUrl,
    ).toBe('http://[::1]:8000/')
  })

  it.each([
    'http://ai.example.com',
    'https://user:password@ai.example.com',
    'https://ai.example.com?token=secret',
    'https://ai.example.com#fragment',
  ])('rejects unsafe service URL %s', (baseUrl) => {
    expect(() => readAiRecommendationConfig({ AI_API_URL: baseUrl })).toThrow()
  })

  it('falls back to twenty-five seconds for invalid timeout values', () => {
    expect(
      readAiRecommendationConfig({ AI_RANKING_TIMEOUT_MS: 'invalid' })
        .timeoutMs,
    ).toBe(60_000)
  })

  it('allows plain HTTP only to a private container service name', () => {
    expect(
      readAiRecommendationConfig({ AI_API_URL: 'http://ai-api:8000' }).baseUrl,
    ).toBe('http://ai-api:8000/')
    expect(() =>
      readAiRecommendationConfig({ AI_API_URL: 'http://ai-api.example.com' }),
    ).toThrow()
    expect(() =>
      readAiRecommendationConfig({ AI_API_URL: 'http://203.0.113.5:8000' }),
    ).toThrow()
  })
})
