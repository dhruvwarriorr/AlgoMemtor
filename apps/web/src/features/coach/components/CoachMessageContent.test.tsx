import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CoachMessageContent } from './CoachMessageContent'

describe('CoachMessageContent', () => {
  it('renders assistant Markdown as structured content', () => {
    const html = renderToStaticMarkup(
      <CoachMessageContent
        content={
          '### Next step\n\nUse **Sliding Window**:\n\n- Expand right\n- Shrink left'
        }
        role="assistant"
      />,
    )

    expect(html).toContain('<h3')
    expect(html).toContain('<strong')
    expect(html).toContain('<ul')
    expect(html).not.toContain('### Next step')
    expect(html).not.toContain('**Sliding Window**')
  })

  it('keeps learner messages as plain text', () => {
    const html = renderToStaticMarkup(
      <CoachMessageContent content="**Keep this literal**" role="user" />,
    )

    expect(html).toContain('**Keep this literal**')
    expect(html).not.toContain('<strong')
  })
})
