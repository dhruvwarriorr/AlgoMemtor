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
  it('renders only the brand scene and the footer', () => {
    for (const status of [
      'unauthenticated',
      'authenticated',
      'loading',
    ] as const) {
      const markup = renderLandingPage(status)

      expect(markup).toContain('aria-label="AlgoMemtor"')
      expect(markup).toContain('Problems belong to their original platforms.')
      expect(markup).not.toContain('One coach.')
      expect(markup).not.toContain('How it')
      // The single action lives in the top bar, not in the page body.
      expect(markup).not.toContain('Get Started')
      expect(markup).not.toContain('Go to Dashboard')
    }
  })

  it('plays the skippable intro only for guests', () => {
    const guest = renderLandingPage('unauthenticated')
    expect(guest).toContain('AlgoMemtor introduction')
    expect(guest).toContain('Skip intro')

    expect(renderLandingPage('authenticated')).not.toContain(
      'AlgoMemtor introduction',
    )
    expect(renderLandingPage('loading')).not.toContain(
      'AlgoMemtor introduction',
    )
  })
})
