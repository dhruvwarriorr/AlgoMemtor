import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'

type AuthMode = 'sign-in' | 'sign-up'

function requestedDestination(state: unknown): string {
  if (!state || typeof state !== 'object' || !('from' in state)) {
    return '/dashboard'
  }

  const { from } = state

  if (!from || typeof from !== 'object' || !('pathname' in from)) {
    return '/dashboard'
  }

  const { pathname } = from

  if (
    typeof pathname !== 'string' ||
    !pathname.startsWith('/') ||
    pathname.startsWith('//')
  ) {
    return '/dashboard'
  }

  const search =
    'search' in from && typeof from.search === 'string' ? from.search : ''
  const hash = 'hash' in from && typeof from.hash === 'string' ? from.hash : ''

  return `${pathname}${search}${hash}`
}

function authErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'Unable to continue. Please check your details and try again.'
}

function formString(formData: FormData, name: string): string {
  const value = formData.get(name)

  return typeof value === 'string' ? value : ''
}

function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { clearSessionMessage, sessionMessage, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const isSignUp = mode === 'sign-up'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    const form = event.currentTarget
    const formData = new FormData(form)
    const email = formString(formData, 'email').trim()
    const password = formString(formData, 'password')
    const passwordConfirmation = formString(formData, 'passwordConfirmation')

    if (isSignUp && password !== passwordConfirmation) {
      setSuccessMessage(null)
      setErrorMessage('Passwords do not match.')
      return
    }

    setErrorMessage(null)
    setSuccessMessage(null)
    setIsSubmitting(true)

    try {
      if (isSignUp) {
        const session = await signUp(email, password)

        if (!session) {
          form.reset()
          setSuccessMessage(
            'Account created. Check your email to confirm your account, then sign in.',
          )
          setIsSubmitting(false)
          return
        }
      } else {
        await signIn(email, password)
      }
    } catch (error) {
      setErrorMessage(authErrorMessage(error))
      setIsSubmitting(false)
      return
    }

    void navigate(requestedDestination(location.state), { replace: true })
  }

  return (
    <PageContainer className="max-w-lg">
      <PageHeader
        description={
          isSignUp
            ? 'Create an account to start learning with AlgoMemtor.'
            : 'Sign in to continue learning with AlgoMemtor.'
        }
        title={isSignUp ? 'Create account' : 'Login'}
      />

      <form
        aria-busy={isSubmitting}
        className="flex w-full min-w-0 flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6"
        onSubmit={(event) => void handleSubmit(event)}
      >
        {sessionMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {sessionMessage}
          </p>
        ) : null}

        <div className="flex min-w-0 flex-col gap-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="email"
          >
            Email
          </label>
          <input
            autoComplete="email"
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            disabled={isSubmitting}
            id="email"
            name="email"
            required
            type="email"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="password"
          >
            Password
          </label>
          <input
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            disabled={isSubmitting}
            id="password"
            name="password"
            required
            type="password"
          />
        </div>

        {isSignUp ? (
          <div className="flex min-w-0 flex-col gap-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="passwordConfirmation"
            >
              Confirm password
            </label>
            <input
              autoComplete="new-password"
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              disabled={isSubmitting}
              id="passwordConfirmation"
              name="passwordConfirmation"
              required
              type="password"
            />
          </div>
        ) : null}

        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p
            className="text-sm text-green-700 dark:text-green-400"
            role="status"
          >
            {successMessage}
          </p>
        ) : null}

        <Button
          className="min-h-11 w-full"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting
            ? isSignUp
              ? 'Creating account…'
              : 'Signing in…'
            : isSignUp
              ? 'Create account'
              : 'Login'}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {isSignUp ? 'Already have an account?' : 'New to AlgoMemtor?'}{' '}
        <button
          className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
          disabled={isSubmitting}
          onClick={() => {
            setMode(isSignUp ? 'sign-in' : 'sign-up')
            clearSessionMessage()
            setErrorMessage(null)
            setSuccessMessage(null)
          }}
          type="button"
        >
          {isSignUp ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </PageContainer>
  )
}

export default LoginPage
