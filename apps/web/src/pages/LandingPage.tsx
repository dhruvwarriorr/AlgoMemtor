import { Link } from 'react-router-dom'

import PageContainer from '@/components/layout/PageContainer'
import PageHeader from '@/components/layout/PageHeader'
import { buttonVariants } from '@/components/ui/button'

function LandingPage() {
  return (
    <PageContainer className="items-center justify-center py-16 text-center sm:py-24 lg:py-32">
      <PageHeader
        action={
          <nav
            aria-label="Landing page actions"
            className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
          >
            <Link
              className={buttonVariants({
                className: 'min-h-11 w-full px-5 sm:w-auto',
                size: 'lg',
              })}
              to="/onboarding"
            >
              Get Started
            </Link>
            <Link
              className={buttonVariants({
                className: 'min-h-11 w-full px-5 sm:w-auto',
                size: 'lg',
                variant: 'outline',
              })}
              to="/login"
            >
              Login
            </Link>
          </nav>
        }
        className="mx-auto max-w-3xl items-center text-center sm:flex-col sm:items-center [&_h1]:text-3xl sm:[&_h1]:text-4xl lg:[&_h1]:text-5xl"
        description="Build your problem-solving skills with a coding mentor that learns alongside you."
        title="Learn with AlgoMemtor"
      />
    </PageContainer>
  )
}

export default LandingPage
