import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

import {
  AuthContext,
  type AuthStatus,
  type AuthContextValue,
  type AuthUser,
} from './auth-context'

type AuthState = {
  user: AuthUser | null
  status: AuthStatus
}

function stateFromSession(session: Session | null): AuthState {
  return session
    ? { user: session.user, status: 'authenticated' }
    : { user: null, status: 'unauthenticated' }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    status: 'loading',
  })

  useEffect(() => {
    let isMounted = true
    let receivedAuthEvent = false

    const sessionRequest = supabase.auth.getSession()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true

      if (isMounted) {
        setAuthState(stateFromSession(session))
      }
    })

    void sessionRequest.then(
      ({ data, error }) => {
        if (!isMounted || receivedAuthEvent) {
          return
        }

        setAuthState(
          error ? stateFromSession(null) : stateFromSession(data.session),
        )
      },
      () => {
        if (isMounted && !receivedAuthEvent) {
          setAuthState(stateFromSession(null))
        }
      },
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw error
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      throw error
    }

    return data.session
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw error
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...authState,
      signIn,
      signUp,
      signOut,
    }),
    [authState, signIn, signOut, signUp],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
