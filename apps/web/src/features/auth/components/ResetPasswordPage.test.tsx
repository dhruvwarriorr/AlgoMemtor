import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import {
  AuthContext,
  type AuthContextValue,
} from '@/features/auth/auth-context'

import ResetPasswordPage from './ResetPasswordPage'

function renderResetPage(overrides: Partial<AuthContextValue> = {}) {
  const authValue: AuthContextValue = {
    user: null,
    status: 'unauthenticated',
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
    ...overrides,
  }

  return renderToStaticMarkup(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('ResetPasswordPage', () => {
  it('does not expose the password form without a recovery session', () => {
    const markup = renderResetPage()

    expect(markup).toContain('Reset link unavailable')
    expect(markup).not.toContain('Choose a new password')
  })

  it('renders the password form during a recovery session', () => {
    const markup = renderResetPage({
      passwordRecovery: true,
      status: 'authenticated',
    })

    expect(markup).toContain('Choose a new password')
    expect(markup).toContain('Update password')
  })
})
