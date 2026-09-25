import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import {
  AuthContext,
  type AuthContextValue,
} from '@/features/auth/auth-context'

import LoginPage from './LoginPage'

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
}

describe('LoginPage', () => {
  it('keeps Google sign-in and exposes the password reset entry point', () => {
    const markup = renderToStaticMarkup(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(markup).toContain('Continue with Google')
    expect(markup).toContain('Forgot password?')
  })
})
