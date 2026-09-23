import { ArrowLeft } from '@/components/icons/algo-icons'
import { Link } from 'react-router-dom'

import PageContainer from '@/components/layout/PageContainer'
import { buttonVariants } from '@/components/ui/button'

function NotFoundPage() {
  return (
    <PageContainer className="justify-center">
      <section className="sky-surface flex min-h-[70dvh] flex-col items-center justify-center rounded-xl px-6 py-16 text-center">
        <span
          aria-hidden="true"
          className="cloud animate-drift top-10 -left-20 w-[24rem]"
        />
        <span
          aria-hidden="true"
          className="cloud animate-drift -right-24 bottom-6 w-[28rem] [--drift:-40px]"
        />
        <p className="font-heading text-[7rem] leading-none font-bold tracking-[-0.01em] opacity-90 sm:text-[10rem]">
          404
        </p>
        <h1 className="mt-4 break-words text-3xl sm:text-4xl">
          Page not found
        </h1>
        <p className="mx-auto mt-3 max-w-md break-words opacity-75">
          The page you are looking for does not exist or may have moved.
        </p>

        <Link
          className={buttonVariants({
            className: 'mt-8 w-full sm:w-auto',
            size: 'lg',
            variant: 'ink',
          })}
          to="/dashboard"
        >
          <ArrowLeft aria-hidden="true" />
          Return to dashboard
        </Link>
      </section>
    </PageContainer>
  )
}

export default NotFoundPage
