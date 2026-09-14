import { Button } from '@/components/ui/button'
import PageContainer from '@/components/layout/PageContainer'
import type { DeleteAllDataStatus } from '@/features/progress/contracts'

type DataResetPendingStateProps = {
  isChecking: boolean
  onRetry: () => void
  hasError?: boolean
  isRetrying?: boolean
  status?: DeleteAllDataStatus
}

export function DataResetPendingState({
  hasError = false,
  isRetrying = false,
  isChecking,
  onRetry,
  status = 'pending',
}: DataResetPendingStateProps) {
  const failed = status === 'failed'
  return (
    <PageContainer className="items-center justify-center text-center">
      <section
        aria-live="polite"
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 sm:p-8"
        role={hasError || failed ? 'alert' : 'status'}
      >
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {failed ? 'Data reset needs a retry' : 'Finishing your data reset'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          {failed
            ? 'Background cleanup did not finish. Your learner data remains hidden until the cleanup succeeds. You remain signed in.'
            : 'Your request was accepted and your AlgoMemtor data is temporarily hidden while cleanup finishes. You remain signed in; onboarding will become available when the reset is complete.'}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {hasError
            ? 'We could not check the cleanup status right now.'
            : failed
              ? 'Retry the cleanup to continue.'
              : isChecking
                ? 'Checking the cleanup status…'
                : 'We will continue checking automatically.'}
        </p>
        <Button
          className="mt-5"
          disabled={isChecking || isRetrying}
          onClick={onRetry}
          type="button"
          variant="outline"
        >
          {isRetrying
            ? 'Retrying…'
            : failed
              ? 'Retry cleanup'
              : isChecking
                ? 'Checking…'
                : 'Check again'}
        </Button>
      </section>
    </PageContainer>
  )
}
