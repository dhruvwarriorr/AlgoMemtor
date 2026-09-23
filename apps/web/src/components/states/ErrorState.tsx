import { CloudOff } from '@/components/icons/algo-icons'

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
      className="flex w-full min-w-0 flex-col items-center justify-center rounded-xl border border-border bg-card px-4 py-12 text-center sm:px-6"
      role="alert"
    >
      <span
        aria-hidden="true"
        className="mb-4 grid size-12 place-items-center rounded-md bg-sun-soft text-sun-foreground ring-1 ring-sun/50"
      >
        <CloudOff className="size-5" strokeWidth={1.75} />
      </span>
      <h2 className="max-w-full break-words text-xl font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-2 max-w-md break-words text-muted-foreground">
        {message}
      </p>
      {onRetry ? (
        <Button className="mt-6" onClick={onRetry} type="button" variant="ink">
          {retryLabel}
        </Button>
      ) : null}
    </section>
  )
}

export { ErrorState }
export type { ErrorStateProps }
