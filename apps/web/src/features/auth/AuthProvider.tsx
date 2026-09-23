import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import type { Session } from '@supabase/supabase-js'

import { authRedirectUrl, supabase } from '@/lib/supabase'

import {
  sessionExpiredEventName,
  sessionExpiredMessage,
} from './authenticated-fetch'

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
  const [sessionMessage, setSessionMessage] = useState<string | null>(null)

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

  useEffect(() => {
    const handleSessionExpired = () => {
      setSessionMessage(sessionExpiredMessage)
      setAuthState(stateFromSession(null))
    }

    window.addEventListener(sessionExpiredEventName, handleSessionExpired)

    return () =>
      window.removeEventListener(sessionExpiredEventName, handleSessionExpired)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw error
    }

    setSessionMessage(null)
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: authRedirectUrl },
    })

    if (error) {
      throw error
    }

    setSessionMessage(null)
    return data.session
  }, [])

  // Google sign-in creates the account on first use, so it serves both
  // login and signup.
  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl },
    })

    if (error) {
      throw error
    }

    setSessionMessage(null)
  }, [])

  const signOut = useCallback(async () => {
    setSessionMessage(null)
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw error
    }
  }, [])

  const clearSessionMessage = useCallback(() => setSessionMessage(null), [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...authState,
      sessionMessage,
      clearSessionMessage,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [
      authState,
      clearSessionMessage,
      sessionMessage,
      signIn,
      signInWithGoogle,
      signOut,
      signUp,
    ],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
