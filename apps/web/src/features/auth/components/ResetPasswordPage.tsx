import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from '@/lib/router'

import PageContainer from '@/components/layout/PageContainer'
import { Button, buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

function authErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'Your password could not be updated. Please request a new reset link.'
}

function ResetPasswordPage() {
  const navigate = useNavigate()
  const { passwordRecovery, status, updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSubmitting) return

    if (password !== confirmation) {
      setErrorMessage('Passwords do not match.')
      return
    }

    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      await updatePassword(password)
      void navigate('/dashboard', { replace: true })
    } catch (error) {
      setErrorMessage(authErrorMessage(error))
      setIsSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <PageContainer className="items-center justify-center">
        <p className="text-sm text-muted-foreground" role="status">
          Verifying your reset link…
        </p>
      </PageContainer>
    )
  }

  if (!passwordRecovery || status !== 'authenticated') {
    return (
      <PageContainer className="items-center justify-center">
        <section className="w-full max-w-lg rounded-xl border border-border bg-card p-6 text-center sm:p-8">
          <h1 className="text-3xl text-foreground">Reset link unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This password reset link is expired or invalid. Request a new one
            from the login page.
          </p>
          <Link
            className={cn(buttonVariants({ variant: 'ink' }), 'mt-6')}
            to="/login"
          >
            Back to login
          </Link>
        </section>
      </PageContainer>
    )
  }

  return (
    <PageContainer className="items-center justify-center">
      <section className="w-full max-w-lg rounded-xl border border-border bg-card p-6 sm:p-8">
        <h1 className="text-3xl text-foreground">Choose a new password</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Use a password you do not reuse on another site.
        </p>
        <form
          className="mt-6 space-y-5"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label className="block space-y-2 text-sm font-medium text-foreground">
            New password
            <input
              autoComplete="new-password"
              className="h-12 w-full rounded-md border border-input bg-background px-4 text-base text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 disabled:opacity-60"
              disabled={isSubmitting}
              minLength={8}
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <label className="block space-y-2 text-sm font-medium text-foreground">
            Confirm new password
            <input
              autoComplete="new-password"
              className="h-12 w-full rounded-md border border-input bg-background px-4 text-base text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 disabled:opacity-60"
              disabled={isSubmitting}
              minLength={8}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              required
              type="password"
              value={confirmation}
            />
          </label>
          {errorMessage ? (
            <p
              className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger-foreground"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
          <Button disabled={isSubmitting} type="submit" variant="ink">
            {isSubmitting ? 'Updating password…' : 'Update password'}
          </Button>
        </form>
      </section>
    </PageContainer>
  )
}

export default ResetPasswordPage
