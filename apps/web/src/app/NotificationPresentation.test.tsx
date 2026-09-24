import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AnimatedList } from '@/components/ui/animated-list'

import { NotificationGlyph } from './NotificationGlyph'

describe('notification presentation', () => {
  it('renders each live notification immediately instead of staging a demo sequence', () => {
    const markup = renderToStaticMarkup(
      <AnimatedList aria-live="polite">
        <div key="first">First notification</div>
        <div key="second">Second notification</div>
      </AnimatedList>,
    )

    expect(markup).toContain('First notification')
    expect(markup).toContain('Second notification')
    expect(markup).toContain('aria-live="polite"')
  })

  it('uses a distinct decorative signal mark for each tone', () => {
    const tones = ['info', 'success', 'error'] as const
    const marks = tones.map((tone) =>
      renderToStaticMarkup(<NotificationGlyph tone={tone} />),
    )

    expect(new Set(marks).size).toBe(3)
    expect(marks.every((mark) => mark.includes('aria-hidden="true"'))).toBe(
      true,
    )
  })
})
