import { Button } from '@/components/ui/button'

type ErrorStateProps = {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
}

function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  return (
    <section
      className="flex w-full flex-col items-center justify-center rounded-lg border border-border bg-background px-4 py-10 text-center sm:px-6"
      role="alert"
    >
      <h2 className="text-xl font-medium text-foreground">{title}</h2>
      <p className="mt-2 max-w-md text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button className="mt-6" onClick={onRetry} type="button">
          {retryLabel}
        </Button>
      ) : null}
    </section>
  )
}

export { ErrorState }
export type { ErrorStateProps }
