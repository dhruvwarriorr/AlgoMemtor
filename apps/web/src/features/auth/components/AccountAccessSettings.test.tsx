import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({
    changePassword: vi.fn(),
    linkGoogleAccount: vi.fn(),
    requestPasswordReset: vi.fn(),
    setPassword: vi.fn(),
    status: 'authenticated',
    unlinkGoogleAccount: vi.fn(),
    user: { id: 'learner-1', email: 'learner@example.com' },
  }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUserIdentities: vi.fn(() => new Promise(() => undefined)),
    },
  },
}))

import { AccountAccessSettings } from './AccountAccessSettings'

describe('AccountAccessSettings', () => {
  it('offers Google sign-in and a password change that asks for the current password', () => {
    const markup = renderToStaticMarkup(<AccountAccessSettings />)

    expect(markup).toContain('Google')
    expect(markup).toContain('learner@example.com')
    expect(markup).toContain('Current password')
    expect(markup).toContain('New password')
    expect(markup).toContain('Confirm new password')
    expect(markup).toContain('Change password')
    expect(markup).toContain('Email me a reset link')
  })
})
