import { describe, expect, it } from 'vitest'

import { scrollLocationKey } from './scroll-location'

describe('scroll restoration keys', () => {
  it('keeps filters, pagination, and hashes isolated for browser back navigation', () => {
    expect(
      scrollLocationKey({
        pathname: '/catalog',
        search: '?topic=graphs&page=2',
        hash: '#results',
      }),
    ).toBe('algomemtor:scroll:/catalog?topic=graphs&page=2#results')
    expect(
      scrollLocationKey({
        pathname: '/catalog',
        search: '?topic=graphs&page=3',
        hash: '#results',
      }),
    ).not.toBe('algomemtor:scroll:/catalog?topic=graphs&page=2#results')
  })
})
