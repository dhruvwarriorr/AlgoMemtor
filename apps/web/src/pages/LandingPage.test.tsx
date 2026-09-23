import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from '@/features/auth/auth-context'

import LandingPage from './LandingPage'

function renderLandingPage(status: AuthStatus) {
  const authValue: AuthContextValue = {
    user: null,
    status,
    sessionMessage: null,
    clearSessionMessage: () => undefined,
    signIn: () => Promise.resolve(),
    signUp: () => Promise.resolve(null),
    signInWithGoogle: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  }

  return renderToStaticMarkup(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('LandingPage', () => {
  it('shows guest actions when unauthenticated', () => {
    const markup = renderLandingPage('unauthenticated')

    expect(markup).toContain('Get Started')
    expect(markup).toContain('AlgoMemtor introduction')
    expect(markup).toContain('Skip intro')
    expect(markup).toContain('One coach.')
    expect(markup).toContain('Every platform.')
    expect(markup).not.toContain('Where your practice stands')
    expect(markup).not.toContain('Login')
    expect(markup).not.toContain('Go to Dashboard')
  })

  it('shows only the dashboard action when authenticated', () => {
    const markup = renderLandingPage('authenticated')

    expect(markup).toContain('Go to Dashboard')
    expect(markup).not.toContain('AlgoMemtor introduction')
    expect(markup).toContain('href="/dashboard"')
    expect(markup).not.toContain('Get Started')
    expect(markup).not.toContain('AlgoMemtor introduction')
    expect(markup).not.toContain('Login')
  })

  it('hides actions while the session is loading', () => {
    const markup = renderLandingPage('loading')

    expect(markup).not.toContain('Get Started')
    expect(markup).not.toContain('Login')
    expect(markup).not.toContain('Go to Dashboard')
  })
})
