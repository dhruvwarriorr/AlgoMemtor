import { ArrowUpRight } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

import { LogoMark } from '@/components/brand/LogoMark'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

import { ExploreMenu } from './ExploreMenu'
import { ThemeToggle } from './ThemeToggle'

const sectionLinks = [
  { label: 'Your coach', href: '/#coach' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Principles', href: '/#principles' },
] as const

// Public header: a flat, full-width bar with a thin bottom border — the
// Browserbase navbar treatment — instead of a floating glass pill.
function Topbar() {
  const { status } = useAuth()

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          aria-label="AlgoMemtor home"
          className="flex min-w-0 items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          to="/"
        >
          <LogoMark />
          <span className="font-heading text-[1.05rem] font-bold tracking-[-0.03em] text-foreground">
            AlgoMemtor
          </span>
        </Link>

        <nav
          aria-label="Page sections"
          className="hidden items-center gap-0.5 lg:flex"
        >
          <ExploreMenu />
          {sectionLinks.map((item) => (
            <a
              className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-foreground/75 outline-none transition-colors duration-300 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {status === 'authenticated' ? (
            <Link
              className={buttonVariants({ variant: 'default' })}
              to="/dashboard"
            >
              Dashboard
              <ArrowUpRight aria-hidden="true" />
            </Link>
          ) : status === 'unauthenticated' ? (
            <>
              <NavLink
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'hidden sm:inline-flex',
                )}
                to="/login"
              >
                Log in
              </NavLink>
              <NavLink
                className={buttonVariants({ variant: 'default' })}
                to="/login"
              >
                Get started
                <ArrowUpRight aria-hidden="true" />
              </NavLink>
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export default Topbar
