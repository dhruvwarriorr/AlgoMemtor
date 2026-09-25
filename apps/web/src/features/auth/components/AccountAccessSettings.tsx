import { useEffect, useState, type FormEvent } from 'react'
import type { UserIdentity } from '@supabase/supabase-js'

import { Check, Lock } from '@/components/icons/algo-icons'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { supabase } from '@/lib/supabase'

const MIN_PASSWORD_LENGTH = 8

function authErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'The account change could not be completed. Please try again.'
}

const fieldClass =
  'h-11 w-full rounded-md border border-input bg-background px-3.5 text-base text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 disabled:opacity-60 sm:text-sm'

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
      <path
        d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.98-4.32 2.98-7.33Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.5c-.9.6-2.05.96-3.39.96-2.6 0-4.81-1.76-5.6-4.12H3.07v2.58A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.4 13.9A6 6 0 0 1 6.08 12c0-.66.12-1.3.32-1.9V7.52H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.48L6.4 13.9Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2 10 10 0 0 0 3.07 7.52L6.4 10.1C7.19 7.74 9.4 5.98 12 5.98Z"
        fill="#EA4335"
      />
    </svg>
  )
}

function PasswordForm({
  hasPassword,
  email,
}: {
  hasPassword: boolean
  email: string | undefined
}) {
  const { changePassword, requestPasswordReset, setPassword } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [resetPending, setResetPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setError(null)
    setSuccess(null)
    if (hasPassword && current === '') {
      setError('Enter your current password.')
      return
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Use at least ${MIN_PASSWORD_LENGTH} characters for your new password.`,
      )
      return
    }
    if (next !== confirmation) {
      setError('The new passwords do not match.')
      return
    }
    if (hasPassword && next === current) {
      setError('Choose a new password that is different from the current one.')
      return
    }
    setPending(true)
    try {
      if (hasPassword) {
        await changePassword(current, next)
      } else {
        await setPassword(next)
      }
      setCurrent('')
      setNext('')
      setConfirmation('')
      setSuccess(
        hasPassword
          ? 'Your password was changed.'
          : 'Password set. You can now also sign in with your email.',
      )
    } catch (caught) {
      setError(authErrorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  async function sendReset() {
    if (!email || resetPending) return
    setError(null)
    setSuccess(null)
    setResetPending(true)
    try {
      await requestPasswordReset(email)
      setSuccess(
        'If an account exists for this email, we sent a password reset link.',
      )
    } catch (caught) {
      setError(authErrorMessage(caught))
    } finally {
      setResetPending(false)
    }
  }

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      {hasPassword ? (
        <label className="grid gap-2 text-sm font-medium text-foreground">
          Current password
          <input
            autoComplete="current-password"
            className={fieldClass}
            disabled={pending}
            name="current-password"
            onChange={(event) => setCurrent(event.target.value)}
            type="password"
            value={current}
          />
        </label>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-foreground">
          New password
          <input
            autoComplete="new-password"
            className={fieldClass}
            disabled={pending}
            minLength={MIN_PASSWORD_LENGTH}
            name="new-password"
            onChange={(event) => setNext(event.target.value)}
            type="password"
            value={next}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-foreground">
          Confirm new password
          <input
            autoComplete="new-password"
            className={fieldClass}
            disabled={pending}
            minLength={MIN_PASSWORD_LENGTH}
            name="confirm-password"
            onChange={(event) => setConfirmation(event.target.value)}
            type="password"
            value={confirmation}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        At least {MIN_PASSWORD_LENGTH} characters. Use a password you do not
        reuse on another site.
      </p>
      {error ? (
        <p
          className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-foreground"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="inline-flex items-center gap-2 rounded-md bg-go-soft px-4 py-3 text-sm text-go-foreground"
          role="status"
        >
          <Check aria-hidden="true" className="size-4" /> {success}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} type="submit">
          <Lock aria-hidden="true" />
          {pending
            ? 'Saving…'
            : hasPassword
              ? 'Change password'
              : 'Set password'}
        </Button>
        {hasPassword && email ? (
          <button
            className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
            disabled={resetPending}
            onClick={() => void sendReset()}
            type="button"
          >
            {resetPending
              ? 'Sending reset link…'
              : 'Forgot your current password? Email me a reset link'}
          </button>
        ) : null}
      </div>
    </form>
  )
}

export function AccountAccessSettings() {
  const { linkGoogleAccount, status, unlinkGoogleAccount, user } = useAuth()
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null)
  const [identityError, setIdentityError] = useState<string | null>(null)
  const [googlePending, setGooglePending] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let isMounted = true

    void supabase.auth.getUserIdentities().then(({ data, error }) => {
      if (!isMounted) return

      if (error) {
        // Unknown identities: keep the safer defaults (password sign-in
        // assumed, Google connectable) rather than guessing Google-only.
        setIdentityError(authErrorMessage(error))
        setIdentities(null)
        return
      }

      setIdentities(data.identities)
    })

    return () => {
      isMounted = false
    }
  }, [user?.id, reloadKey])

  const googleIdentity = identities?.find(
    (identity) => identity.provider === 'google',
  )
  const hasPassword =
    identities?.some((identity) => identity.provider === 'email') ?? true
  const googleLinked =
    identities === null
      ? identityError === null
        ? null
        : false
      : googleIdentity !== undefined

  async function connectGoogle() {
    if (googlePending || status !== 'authenticated') return

    setIdentityError(null)
    setGooglePending(true)

    try {
      await linkGoogleAccount()
    } catch (error) {
      setIdentityError(authErrorMessage(error))
      setGooglePending(false)
    }
  }

  async function disconnectGoogle() {
    if (googlePending) return
    setIdentityError(null)
    setGooglePending(true)
    try {
      await unlinkGoogleAccount()
      setReloadKey((value) => value + 1)
    } catch (error) {
      setIdentityError(authErrorMessage(error))
    } finally {
      setGooglePending(false)
    }
  }

  const googleEmail =
    typeof googleIdentity?.identity_data?.email === 'string'
      ? googleIdentity.identity_data.email
      : undefined

  return (
    <div className="grid gap-6">
      <section
        aria-labelledby="account-signin-heading"
        className="rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <h3
          className="text-lg font-semibold text-foreground"
          id="account-signin-heading"
        >
          Sign-in email
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {user?.email ?? 'No email on this account'}
        </p>
      </section>

      <section
        aria-labelledby="account-google-heading"
        className="rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-background">
              <GoogleMark />
            </span>
            <div className="min-w-0">
              <h3
                className="text-lg font-semibold text-foreground"
                id="account-google-heading"
              >
                Google
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {googleLinked
                  ? `Connected${googleEmail ? ` as ${googleEmail}` : ''}. You can sign in with Google.`
                  : 'Connect Google to sign in to AlgoMemtor with one click.'}
              </p>
            </div>
          </div>
          {googleLinked === null ? (
            <Button disabled type="button" variant="outline">
              Checking…
            </Button>
          ) : googleLinked ? (
            <Button
              disabled={googlePending || !hasPassword}
              onClick={() => void disconnectGoogle()}
              title={
                hasPassword
                  ? undefined
                  : 'Set a password first so you can still sign in.'
              }
              type="button"
              variant="outline"
            >
              {googlePending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          ) : (
            <Button
              disabled={googlePending || status !== 'authenticated'}
              onClick={() => void connectGoogle()}
              type="button"
            >
              {googlePending ? 'Opening Google…' : 'Connect Google'}
            </Button>
          )}
        </div>
        {googleLinked && !hasPassword ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Google is your only sign-in method. Set a password below before
            disconnecting it.
          </p>
        ) : null}
        {identityError ? (
          <p className="mt-3 text-sm text-danger-foreground" role="alert">
            {identityError}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="account-password-heading"
        className="rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <h3
          className="text-lg font-semibold text-foreground"
          id="account-password-heading"
        >
          {hasPassword ? 'Reset password' : 'Set a password'}
        </h3>
        <p className="mt-1 mb-5 text-sm leading-6 text-muted-foreground">
          {hasPassword
            ? 'Confirm your current password, then choose a new one.'
            : 'You sign in with Google. Add a password to also sign in with your email.'}
        </p>
        <PasswordForm email={user?.email} hasPassword={hasPassword} />
      </section>
    </div>
  )
}
