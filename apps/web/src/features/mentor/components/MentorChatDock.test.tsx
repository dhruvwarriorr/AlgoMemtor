import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MentorChatDock, type DockMode } from './MentorChatDock'

const modes: DockMode[] = [
  {
    id: 'ask',
    label: 'Ask a question',
    placeholder: 'Ask',
    submitLabel: 'Ask',
  },
  {
    id: 'attempt',
    label: 'I tried this',
    placeholder: 'What did you try?',
    submitLabel: 'Get feedback',
  },
]

const render = (
  open: boolean,
  extra: Partial<Parameters<typeof MentorChatDock>[0]> = {},
) =>
  renderToStaticMarkup(
    <MentorChatDock
      launcherLabel="Ask about this solution"
      messages={[
        {
          id: '1',
          role: 'learner',
          content: 'Why sort?',
          label: 'I tried this',
        },
        { id: '2', role: 'mentor', content: 'Sorting fixes the order.' },
      ]}
      mode="attempt"
      modes={modes}
      onOpenChange={() => undefined}
      onSubmit={() => true}
      open={open}
      pending={false}
      title="Your mentor"
      {...extra}
    />,
  )

describe('MentorChatDock', () => {
  it('shows a bottom-right launcher with the thread size when closed', () => {
    const markup = render(false)
    expect(markup).toContain('Ask about this solution')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('role="dialog"')
  })

  it('renders both modes, the thread and the active composer when open', () => {
    const markup = render(true)
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('Ask a question')
    expect(markup).toMatch(/aria-selected="true"[^>]*>I tried this/)
    expect(markup).toContain('Sorting fixes the order.')
    expect(markup).toContain('placeholder="What did you try?"')
    expect(markup).toContain('Get feedback')
  })

  it('explains why sending is disabled', () => {
    const markup = render(true, {
      disabled: true,
      disabledReason: 'Choose whether to reveal the full solution first.',
    })
    expect(markup).toContain(
      'Choose whether to reveal the full solution first.',
    )
  })
})
