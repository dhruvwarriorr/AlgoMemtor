import { useState, type CSSProperties, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Flame, Sparkles, Target, TrendingUp } from 'lucide-react'
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
      <section className="sky-surface relative flex min-h-64 flex-col justify-end overflow-hidden rounded-xl p-7 sm:p-10 lg:min-h-[36rem] lg:justify-between">
        <span
          aria-hidden="true"
          className="cloud animate-drift -top-6 -left-16 w-[26rem]"
        />
        <span
          aria-hidden="true"
          className="cloud animate-drift top-1/3 -right-24 hidden w-[24rem] [--drift:-40px] sm:block"
        />
        <BrandShowcase />
        <div className="relative">
          <p className="max-w-md font-heading text-3xl leading-[1.05] font-bold tracking-[-0.035em] sm:text-5xl">
            Your coach remembers where you left off.
          </p>
          <p className="mt-4 max-w-sm text-[#101012]/75 dark:text-[#f4f1ea]/75">
            Your roadmap, streak, memory and next problem are saved to your
            account.
          </p>
        </div>
      </section>

      <section className="flex flex-col justify-center rounded-xl border border-border bg-card p-6 sm:p-10 lg:px-14">
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

// Big animated mark with the kinds of signals the coach keeps for you. Purely
// decorative sample values, hidden from assistive technology.
function BrandShowcase() {
  const chip =
    'animate-float absolute flex items-center gap-2.5 rounded-lg border border-white/60 bg-white/80 px-3 py-2 text-left shadow-[0_18px_40px_-20px_rgb(16_16_18/0.45)] backdrop-blur-md dark:border-white/10 dark:bg-[#18181b]/85'
  return (
    <div
      aria-hidden="true"
      className="relative hidden flex-1 place-items-center lg:grid"
    >
      <div className="relative grid size-[22rem] place-items-center">
        {[22, 17, 12].map((size, index) => (
          <span
            className="absolute rounded-full border border-[#101012]/10 dark:border-white/10"
            key={size}
            style={{
              width: `${size}rem`,
              height: `${size}rem`,
              opacity: 1 - index * 0.15,
            }}
          />
        ))}
        <span className="absolute size-44 rounded-full bg-primary/25 blur-3xl" />
        <LogoMark className="relative size-36 shadow-[0_30px_60px_-24px_rgb(255_77_18/0.6)]" />

        <div
          className={`${chip} -top-2 left-0`}
          style={{ '--tilt': '-3deg' } as CSSProperties}
        >
          <span className="grid size-8 place-items-center rounded-md bg-go-soft text-go-foreground">
            <TrendingUp className="size-4" />
          </span>
          <span>
            <span className="block text-[0.68rem] text-muted-foreground">
              Rating
            </span>
            <span className="block font-heading text-sm font-bold">
              1665 <span className="text-go">+49</span>
            </span>
          </span>
        </div>

        <div
          className={`${chip} top-8 -right-6 [animation-delay:-2s]`}
          style={{ '--tilt': '3deg' } as CSSProperties}
        >
          <span className="grid size-8 place-items-center rounded-md bg-sun-soft text-sun-foreground">
            <Flame className="size-4" />
          </span>
          <span>
            <span className="block text-[0.68rem] text-muted-foreground">
              Solve streak
            </span>
            <span className="block font-heading text-sm font-bold">
              12 days
            </span>
          </span>
        </div>

        <div
          className={`${chip} bottom-20 -left-10 [animation-delay:-4s]`}
          style={{ '--tilt': '2deg' } as CSSProperties}
        >
          <span className="grid size-8 place-items-center rounded-md bg-primary/15 text-primary">
            <Target className="size-4" />
          </span>
          <span>
            <span className="block text-[0.68rem] text-muted-foreground">
              Next problem
            </span>
            <span className="block font-heading text-sm font-bold">
              Binary search · 1400
            </span>
          </span>
        </div>

        <div
          className={`${chip} -right-6 -bottom-4 max-w-52 [animation-delay:-1s]`}
          style={{ '--tilt': '-2deg' } as CSSProperties}
        >
          <span className="coach-orb size-8 shrink-0" />
          <span className="text-xs leading-snug">
            <span className="flex items-center gap-1 text-[0.68rem] text-muted-foreground">
              <Sparkles className="size-3 text-primary" /> Coach
            </span>
            Your WA pattern is off-by-one. Try the invariant first.
          </span>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
