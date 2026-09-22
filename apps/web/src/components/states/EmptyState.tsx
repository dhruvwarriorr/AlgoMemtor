import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
}

function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section className="relative isolate flex w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-[color-mix(in_oklab,var(--sky-deep)_35%,var(--border))] bg-[linear-gradient(180deg,var(--sky-soft),var(--card)_75%)] px-4 py-12 text-center sm:px-6">
      <span
        aria-hidden="true"
        className="cloud -top-6 left-1/2 w-56 -translate-x-1/2 opacity-70"
      />
      <h2 className="max-w-full break-words text-xl font-semibold text-foreground">
        {title}
      </h2>
      {description ? (
        <p className="mt-2 max-w-md break-words text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  )
}

export { EmptyState }
export type { EmptyStateProps }
