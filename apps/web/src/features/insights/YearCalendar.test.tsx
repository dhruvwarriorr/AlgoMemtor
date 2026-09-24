import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { YearCalendar } from './InsightsCharts'

afterEach(() => {
  vi.useRealTimers()
})

describe('YearCalendar', () => {
  it('offers the last 12 months and every year since the first activity', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 24, 12))
    const markup = renderToStaticMarkup(
      <YearCalendar
        firstActivityAt="2024-11-02T10:00:00.000Z"
        solvedOverTime={{ '2026-09-20': 2, '2025-03-01': 1 }}
      />,
    )
    expect(markup).toContain('Last 12 months')
    expect(markup).toContain('<option value="2026">2026</option>')
    expect(markup).toContain('<option value="2025">2025</option>')
    expect(markup).toContain('<option value="2024">2024</option>')
    expect(markup).not.toContain('<option value="2023">')
    // Only the 12-month window is counted by default.
    expect(markup).toContain('2 solves')
  })
})
