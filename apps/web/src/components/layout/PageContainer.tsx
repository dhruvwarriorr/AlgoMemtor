import type { PropsWithChildren } from 'react'

import { cn } from '@/lib/utils'

export type PageAccent = 'sky' | 'green' | 'violet' | 'amber' | 'rose' | 'teal'

type PageContainerProps = PropsWithChildren<{
  className?: string
  // The page's accent colour for the revamp kit (see `data-accent` in
  // index.css). Pages keep the brand sky when they do not set one.
  accent?: PageAccent
}>

function PageContainer({ children, className, accent }: PageContainerProps) {
  return (
    <main
      className={cn(
        'flex w-full min-w-0 flex-1 flex-col gap-8 px-5 py-6 text-left sm:px-8 sm:py-8 lg:px-10 lg:py-9',
        className,
      )}
      data-accent={accent}
      id="main-content"
    >
      {children}
    </main>
  )
}

export default PageContainer
export type { PageContainerProps }
