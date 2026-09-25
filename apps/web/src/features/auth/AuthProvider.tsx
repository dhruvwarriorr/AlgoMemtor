import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import type { Session } from '@supabase/supabase-js'

import {
  authRecoveryRedirectUrl,
  authRedirectUrl,
  authSettingsRedirectUrl,
  supabase,
} from '@/lib/supabase'

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
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [sessionMessage, setSessionMessage] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    let receivedAuthEvent = false

    const sessionRequest = supabase.auth.getSession()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      receivedAuthEvent = true

      if (isMounted) {
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecovery(true)
        } else if (event === 'SIGNED_OUT') {
          setPasswordRecovery(false)
        }
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
    setPasswordRecovery(false)
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
    setPasswordRecovery(false)
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
    setPasswordRecovery(false)
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRecoveryRedirectUrl,
    })

    if (error) {
      throw error
    }

    setSessionMessage(null)
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      throw error
    }

    setPasswordRecovery(false)
    setSessionMessage(null)
  }, [])

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const { data, error: userError } = await supabase.auth.getUser()
      const email = data.user?.email
      if (userError || !email) {
        throw new Error(
          'Your account has no email address for password sign-in.',
        )
      }
      // Re-authenticate with the current password so a stolen, unlocked
      // session alone cannot change it.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (verifyError) {
        throw new Error(
          verifyError.code === 'invalid_credentials' ||
            /invalid login credentials/i.test(verifyError.message)
            ? 'Your current password is incorrect.'
            : verifyError.message,
        )
      }
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (error) {
        throw error
      }
      setSessionMessage(null)
    },
    [],
  )

  const setPassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      throw error
    }
    setSessionMessage(null)
  }, [])

  const unlinkGoogleAccount = useCallback(async () => {
    const { data, error: identitiesError } =
      await supabase.auth.getUserIdentities()
    if (identitiesError) {
      throw identitiesError
    }
    const google = data.identities.find(
      (identity) => identity.provider === 'google',
    )
    if (google === undefined) return
    if (data.identities.length < 2) {
      throw new Error(
        'Set a password before disconnecting Google so you can still sign in.',
      )
    }
    const { error } = await supabase.auth.unlinkIdentity(google)
    if (error) {
      throw error
    }
  }, [])

  const linkGoogleAccount = useCallback(async () => {
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: authSettingsRedirectUrl },
    })

    if (error) {
      throw error
    }

    setSessionMessage(null)
  }, [])

  const signOut = useCallback(async () => {
    setSessionMessage(null)
    setPasswordRecovery(false)
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw error
    }
  }, [])

  const clearSessionMessage = useCallback(() => setSessionMessage(null), [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...authState,
      passwordRecovery,
      sessionMessage,
      clearSessionMessage,
      signIn,
      signUp,
      signInWithGoogle,
      requestPasswordReset,
      updatePassword,
      changePassword,
      setPassword,
      linkGoogleAccount,
      unlinkGoogleAccount,
      signOut,
    }),
    [
      authState,
      changePassword,
      clearSessionMessage,
      linkGoogleAccount,
      passwordRecovery,
      requestPasswordReset,
      sessionMessage,
      signIn,
      signInWithGoogle,
      signOut,
      signUp,
      setPassword,
      unlinkGoogleAccount,
      updatePassword,
    ],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
