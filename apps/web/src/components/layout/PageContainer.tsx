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
        'flex w-full min-w-0 flex-1 flex-col gap-8 px-5 py-6 text-left sm:px-8 sm:py-8 lg:px-10 lg:py-9',
        className,
      )}
    >
      {children}
    </main>
  )
}

export default PageContainer
export type { PageContainerProps }
