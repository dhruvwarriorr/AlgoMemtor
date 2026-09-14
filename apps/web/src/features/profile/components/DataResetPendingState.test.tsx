import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { DataResetPendingState } from './DataResetPendingState'

describe('DataResetPendingState', () => {
  it('explains that cleanup is pending and offers a retry action', () => {
    const markup = renderToStaticMarkup(
      <DataResetPendingState isChecking={false} onRetry={vi.fn()} />,
    )

    expect(markup).toContain('Finishing your data reset')
    expect(markup).toContain('temporarily hidden while cleanup finishes')
    expect(markup).toContain('We will continue checking automatically.')
    expect(markup).toContain('Check again')
    expect(markup).toContain('role="status"')
  })

  it('reports status-check errors and shows the checking state', () => {
    const markup = renderToStaticMarkup(
      <DataResetPendingState hasError isChecking onRetry={vi.fn()} />,
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('We could not check the cleanup status right now.')
    expect(markup).toContain('Checking…')
  })
})
