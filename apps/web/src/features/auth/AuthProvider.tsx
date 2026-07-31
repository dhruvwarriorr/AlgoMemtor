import { useMemo, useState, type PropsWithChildren } from 'react'

import {
  AuthContext,
  type AuthContextValue,
  type AuthUser,
} from './auth-context'

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null)

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status: user ? 'authenticated' : 'unauthenticated',
      setUser,
      signOut: () => setUser(null),
    }),
    [user],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
