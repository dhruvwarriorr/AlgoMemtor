type PageSkeletonProps = {
  rows?: number
  label?: string
  withHeader?: boolean
}

function PageSkeleton({
  rows = 4,
  label = 'Loading page',
  withHeader = false,
}: PageSkeletonProps) {
  const rowCount = Math.max(0, Math.floor(rows))

  return (
    <section className="w-full min-w-0 space-y-6" role="status">
      <span className="sr-only">{label}</span>

      <div aria-hidden="true" className="min-w-0 animate-pulse space-y-6">
        {withHeader ? (
          <header className="space-y-3 rounded-3xl bg-sky-soft p-6 sm:p-8">
            <div className="h-9 w-2/5 rounded-md bg-card/70" />
            <div className="h-4 w-3/5 rounded-md bg-card/60" />
          </header>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: rowCount }, (_, index) => (
            <div
              className="space-y-3 rounded-xl border border-border bg-card p-5"
              key={index}
            >
              <div className="h-5 w-1/3 rounded-md bg-muted" />
              <div className="h-4 w-full rounded-md bg-muted" />
              <div className="h-4 w-4/5 rounded-md bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export { PageSkeleton }
export type { PageSkeletonProps }
