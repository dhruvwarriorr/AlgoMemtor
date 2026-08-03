import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
}

function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section className="flex w-full flex-col items-center justify-center rounded-lg border border-border bg-background px-4 py-10 text-center sm:px-6">
      <h2 className="text-xl font-medium text-foreground">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-md text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  )
}

export { EmptyState }
export type { EmptyStateProps }
