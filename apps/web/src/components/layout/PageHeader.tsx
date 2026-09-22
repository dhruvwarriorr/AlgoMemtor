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
        'animate-rise flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="break-words text-[2.1rem] leading-[1.05] text-foreground sm:text-[2.6rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl break-words text-base leading-7 text-muted-foreground">
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
