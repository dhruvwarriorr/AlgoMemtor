type PageSkeletonProps = {
  rows?: number
  label?: string
}

function PageSkeleton({ rows = 4, label = 'Loading page' }: PageSkeletonProps) {
  const rowCount = Math.max(0, Math.floor(rows))

  return (
    <section className="w-full space-y-6 p-4 sm:p-6" role="status">
      <span className="sr-only">{label}</span>

      <div aria-hidden="true" className="animate-pulse space-y-6">
        <header className="space-y-3">
          <div className="h-8 w-2/5 rounded-md bg-muted" />
          <div className="h-4 w-3/5 rounded-md bg-muted" />
        </header>

        <div className="space-y-4">
          {Array.from({ length: rowCount }, (_, index) => (
            <div
              className="space-y-3 rounded-lg border border-border bg-background p-4"
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
