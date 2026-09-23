import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthUser = User

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export type AuthContextValue = {
  user: AuthUser | null
  status: AuthStatus
  sessionMessage: string | null
  clearSessionMessage: () => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<Session | null>
  // Redirects to Google; the session is restored when Supabase returns the
  // browser to the dashboard.
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
