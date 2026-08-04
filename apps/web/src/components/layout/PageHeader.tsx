import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

function PageHeader({
  title,
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>

      {action ? (
        <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
          {action}
        </div>
      ) : null}
    </header>
  )
}

export default PageHeader
export type { PageHeaderProps }
