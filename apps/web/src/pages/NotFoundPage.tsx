import { Link } from 'react-router-dom'

import PageContainer from '@/components/layout/PageContainer'
import { buttonVariants } from '@/components/ui/button'

function NotFoundPage() {
  return (
    <PageContainer className="items-center justify-center py-16 text-center">
      <section className="w-full max-w-lg rounded-xl border border-border bg-background p-6 text-center sm:p-10">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Page not found
        </h1>
        <p className="mx-auto mt-3 max-w-md break-words text-muted-foreground">
          The page you are looking for does not exist or may have moved.
        </p>

        <Link
          className={buttonVariants({
            className: 'mt-6 min-h-11 w-full sm:w-auto',
            size: 'lg',
          })}
          to="/dashboard"
        >
          Return to dashboard
        </Link>
      </section>
    </PageContainer>
  )
}

export default NotFoundPage
