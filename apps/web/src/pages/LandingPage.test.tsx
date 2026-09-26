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
    passwordRecovery: false,
    sessionMessage: null,
    clearSessionMessage: () => undefined,
    signIn: () => Promise.resolve(),
    signUp: () => Promise.resolve(null),
    signInWithGoogle: () => Promise.resolve(),
    requestPasswordReset: () => Promise.resolve(),
    updatePassword: () => Promise.resolve(),
    changePassword: () => Promise.resolve(),
    setPassword: () => Promise.resolve(),
    linkGoogleAccount: () => Promise.resolve(),
    unlinkGoogleAccount: () => Promise.resolve(),
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
  it('renders the brand scene, the story and the footer', () => {
    for (const status of [
      'unauthenticated',
      'authenticated',
      'loading',
    ] as const) {
      const markup = renderLandingPage(status)

      expect(markup).toContain('aria-label="AlgoMemtor"')
      expect(markup).toContain('Why AlgoMemtor')
      expect(markup).toContain('Every solve makes the next pick sharper.')
      expect(markup).toContain('A mentor for every step of practice.')
      expect(markup).toContain('Your practice stays yours.')
      expect(markup).toContain('not affiliated with these platforms')
      expect(markup).toContain('Problems belong to their original platforms.')
    }
  })

  it('ends with the same action as the top bar', () => {
    const guest = renderLandingPage('unauthenticated')
    expect(guest).toContain('Start practising')
    expect(guest).toContain('href="/login"')
    expect(guest).not.toContain('Open your dashboard')

    const learner = renderLandingPage('authenticated')
    expect(learner).toContain('Open your dashboard')
    expect(learner).toContain('href="/dashboard"')
    expect(learner).not.toContain('Start practising')

    const loading = renderLandingPage('loading')
    expect(loading).not.toContain('Start practising')
    expect(loading).not.toContain('Open your dashboard')
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
