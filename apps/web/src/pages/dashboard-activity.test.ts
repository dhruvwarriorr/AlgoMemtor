import type { ProviderActivityEvent } from '@algomemtor/shared-contracts'
import { describe, expect, it } from 'vitest'

import { dashboardActivity } from './dashboard-activity'

const event = (
  id: string,
  eventType: ProviderActivityEvent['eventType'],
  verdict?: string,
): ProviderActivityEvent => ({
  id,
  provider: 'codeforces',
  externalId: '123A',
  eventType,
  occurredAt: '2026-09-22T10:00:00.000Z',
  source: 'provider',
  completeness: 'partial',
  ...(verdict === undefined ? {} : { verdict }),
})

describe('dashboardActivity', () => {
  it('does not show an accepted submission and same-day solve twice', () => {
    const result = dashboardActivity([
      event('solve', 'solved'),
      event('accepted', 'submission', 'OK'),
      event('failed', 'submission', 'WRONG_ANSWER'),
    ])
    expect(result.map((item) => item.id)).toEqual(['accepted', 'failed'])
  })

  it('omits undated events', () => {
    expect(
      dashboardActivity([{ ...event('unknown', 'solved'), occurredAt: null }]),
    ).toEqual([])
  })
})
