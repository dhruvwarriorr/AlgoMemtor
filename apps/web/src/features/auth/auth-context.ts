import { createContext } from 'react'

export type AuthUser = {
  id: string
  email: string
  displayName?: string
}

export type AuthStatus = 'authenticated' | 'unauthenticated'

export type AuthContextValue = {
  user: AuthUser | null
  status: AuthStatus
  setUser: (user: AuthUser | null) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
