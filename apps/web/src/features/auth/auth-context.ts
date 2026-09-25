import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthUser = User

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export type AuthContextValue = {
  user: AuthUser | null
  status: AuthStatus
  passwordRecovery: boolean
  sessionMessage: string | null
  clearSessionMessage: () => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<Session | null>
  // Redirects to Google; the session is restored when Supabase returns the
  // browser to the dashboard.
  signInWithGoogle: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  // Verifies the current password with a fresh sign-in, then changes it.
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>
  // Adds a password to an account that only signs in with Google.
  setPassword: (newPassword: string) => Promise<void>
  // Redirects to Google and returns to the settings page after linking.
  linkGoogleAccount: () => Promise<void>
  unlinkGoogleAccount: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
