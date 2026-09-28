import { useCallback, useState } from 'react'
import { useNavigate } from '@/lib/router'

import { useNotification } from '@/providers/useNotification'
import { useAuth } from '@/features/auth/useAuth'

export function useSignOut() {
  const navigate = useNavigate()
  const { notify } = useNotification()
  const { signOut } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return

    setIsSigningOut(true)
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch (error: unknown) {
      notify({
        title: 'Unable to sign out',
        description:
          error instanceof Error
            ? error.message
            : 'Please try signing out again.',
        tone: 'error',
      })
    } finally {
      setIsSigningOut(false)
    }
  }, [isSigningOut, navigate, notify, signOut])

  return { isSigningOut, signOut: handleSignOut }
}
