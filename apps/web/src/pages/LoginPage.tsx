import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { LogoMark } from '@/components/brand/LogoMark'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'

import { safeReturnTo } from '@/routes/return-to'

type AuthMode = 'sign-in' | 'sign-up'

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

    void navigate(safeReturnTo(location.state), { replace: true })
  }

  const inputClass =
    'h-12 w-full min-w-0 rounded-md border border-input bg-background transition-[border-color,box-shadow] hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--input))] px-4 text-base text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 disabled:opacity-60'

  return (
    <main
      className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-3 pt-3 pb-6 sm:px-5 lg:grid-cols-[1.05fr_1fr] lg:gap-6"
      id="main-content"
    >
      <section className="sky-surface flex min-h-64 flex-col justify-end rounded-[2rem] p-7 sm:p-10 lg:min-h-[36rem]">
        <span
          aria-hidden="true"
          className="cloud animate-drift -top-6 -left-16 w-[26rem]"
        />
        <span
          aria-hidden="true"
          className="cloud animate-drift top-1/3 -right-24 hidden w-[24rem] [--drift:-40px] sm:block"
        />
        <LogoMark className="size-12" />
        <p className="mt-6 max-w-md font-heading text-3xl leading-[1.05] font-bold tracking-[-0.035em] sm:text-5xl">
          Your coach remembers where you left off.
        </p>
        <p className="mt-4 max-w-sm text-[#0b1220]/75 dark:text-[#eaf1fb]/75">
          Your roadmap, streak, memory and next problem are saved to your
          account.
        </p>
      </section>

      <section className="flex flex-col justify-center rounded-[2rem] border border-border bg-card p-6 sm:p-10 lg:px-14">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-4xl text-foreground sm:text-5xl">
            {isSignUp ? 'Create account' : 'Login'}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {isSignUp
              ? 'Create an account to start learning with AlgoMemtor.'
              : 'Sign in to continue learning with AlgoMemtor.'}
          </p>

          <form
            aria-busy={isSubmitting}
            className="mt-8 flex w-full min-w-0 flex-col gap-5"
            onSubmit={(event) => void handleSubmit(event)}
          >
            {sessionMessage ? (
              <p
                className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-foreground"
                role="alert"
              >
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
                className={inputClass}
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
                className={inputClass}
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
                  className={inputClass}
                  disabled={isSubmitting}
                  id="passwordConfirmation"
                  name="passwordConfirmation"
                  required
                  type="password"
                />
              </div>
            ) : null}

            {errorMessage ? (
              <p
                className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-foreground"
                role="alert"
              >
                {errorMessage}
              </p>
            ) : null}

            {successMessage ? (
              <p
                className="rounded-md bg-go-soft px-4 py-3 text-sm text-go-foreground"
                role="status"
              >
                {successMessage}
              </p>
            ) : null}

            <Button
              className="mt-1 w-full"
              disabled={isSubmitting}
              size="lg"
              type="submit"
              variant="ink"
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

          <p className="mt-6 text-sm text-muted-foreground">
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
        </div>
      </section>
    </main>
  )
}

export default LoginPage
