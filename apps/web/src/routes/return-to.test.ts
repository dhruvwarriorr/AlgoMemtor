import { describe, expect, it } from 'vitest'

import { postOnboardingDestination, safeReturnTo } from './return-to'

describe('route return destinations', () => {
  it('returns the protected route with its query and hash', () => {
    expect(
      safeReturnTo({
        pathname: '/problems',
        search: '?topic=graphs',
        hash: '#results',
      }),
    ).toBe('/problems?topic=graphs#results')
  })

  it('rejects malformed or external destinations', () => {
    expect(safeReturnTo(null)).toBe('/dashboard')
    expect(safeReturnTo({ pathname: 'https://example.com' })).toBe('/dashboard')
    expect(safeReturnTo({ pathname: '//example.com' })).toBe('/dashboard')
  })

  it('returns deep links after onboarding instead of losing the original route', () => {
    expect(
      postOnboardingDestination({
        from: {
          pathname: '/settings',
          search: '?section=providers',
        },
      }),
    ).toBe('/settings?section=providers')
  })

  it('uses the dashboard as the safe fallback after onboarding', () => {
    expect(postOnboardingDestination({ pathname: '/onboarding' })).toBe(
      '/dashboard',
    )
    expect(postOnboardingDestination(null)).toBe('/dashboard')
  })
})
