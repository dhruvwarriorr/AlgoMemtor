import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ReflectionDialog } from './ReflectionDialog'

describe('ReflectionDialog', () => {
  it('renders an accessible responsive reflection surface', () => {
    const markup = renderToStaticMarkup(
      <ReflectionDialog
        isSaving={false}
        onClose={vi.fn()}
        onSave={() => Promise.resolve()}
        open
        problemLabel="100A"
      />,
    )

    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('rounded-t-2xl')
    expect(markup).toContain('sm:rounded-2xl')
    expect(markup).toContain('maxLength="1000"')
    expect(markup).toContain('Skip for now')
    expect(markup).toContain('Save reflection')
  })

  it('does not render when closed', () => {
    const markup = renderToStaticMarkup(
      <ReflectionDialog
        isSaving={false}
        onClose={vi.fn()}
        onSave={() => Promise.resolve()}
        open={false}
        problemLabel="100A"
      />,
    )

    expect(markup).toBe('')
  })
})
