import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { YearCalendar } from './InsightsCharts'
import { calendarYears } from './insights-format'

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
    // The range picker shows its current choice; its years are listed below.
    expect(markup).toContain('Last 12 months')
    expect(markup).toContain('aria-haspopup="listbox"')
    expect(
      calendarYears(2026, '2024-11-02T10:00:00.000Z', {
        '2026-09-20': 2,
        '2025-03-01': 1,
      }),
    ).toEqual([2026, 2025, 2024])
    // Only the 12-month window is counted by default.
    expect(markup).toContain('2 solves')
  })
})
