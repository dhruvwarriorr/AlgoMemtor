import type { PropsWithChildren } from 'react'

import { cn } from '@/lib/utils'

type PageContainerProps = PropsWithChildren<{
  className?: string
}>

function PageContainer({ children, className }: PageContainerProps) {
  return (
    <main
      className={cn(
        'mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col gap-6 px-4 py-6 text-left sm:gap-8 sm:px-6 sm:py-8 lg:px-8',
        className,
      )}
    >
      {children}
    </main>
  )
}

export default PageContainer
export type { PageContainerProps }
