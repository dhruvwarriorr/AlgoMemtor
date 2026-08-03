import { Link } from 'react-router-dom'

import { buttonVariants } from '@/components/ui/button'

function NotFoundPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
      <section className="w-full max-w-lg rounded-xl border border-border bg-background p-6 text-center sm:p-10">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1>Page not found</h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          The page you are looking for does not exist or may have moved.
        </p>

        <Link
          className={buttonVariants({ className: 'mt-6', size: 'lg' })}
          to="/dashboard"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  )
}

export default NotFoundPage
