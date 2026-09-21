import type { PropsWithChildren } from 'react'

import { cn } from '@/lib/utils'

type PageContainerProps = PropsWithChildren<{
  className?: string
}>

function PageContainer({ children, className }: PageContainerProps) {
  return (
    <main
      id="main-content"
      className={cn(
        'mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col gap-6 px-4 py-5 text-left sm:px-6 sm:py-7 lg:px-8',
        className,
      )}
    >
      {children}
    </main>
  )
}

export default PageContainer
export type { PageContainerProps }
