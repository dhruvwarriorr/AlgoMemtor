import { ArrowUpRight } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import { LogoMark } from '@/components/brand/LogoMark'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

import { ThemeToggle } from './ThemeToggle'

const sectionLinks = [
  { label: 'Your coach', href: '/#coach' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Principles', href: '/#principles' },
] as const

// Public header: floating pills that sit inside the landing hero.
function Topbar() {
  const location = useLocation()
  const { status } = useAuth()
  const isLanding = location.pathname === '/'

  return (
    <header
      className={cn(
        'sticky top-0 z-30 w-full px-3 pt-3 sm:px-5',
        isLanding && 'pt-6 sm:px-8 lg:px-12',
      )}
    >
      <div className="flex h-14 w-full items-center justify-between gap-3">
        <Link
          aria-label="AlgoMemtor home"
          className="glass-pill flex h-12 min-w-0 items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          to="/"
        >
          <LogoMark />
          <span className="font-heading text-[1.05rem] font-bold tracking-[-0.03em] text-foreground">
            AlgoMemtor
          </span>
        </Link>

        <nav
          aria-label="Page sections"
          className="glass-pill hidden h-12 items-center gap-0.5 rounded-full p-1.5 lg:flex"
        >
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

        <div className="glass-pill flex h-12 items-center gap-1 rounded-full p-1.5">
          <ThemeToggle />
          {status === 'authenticated' ? (
            <Link
              className={buttonVariants({ variant: 'ink' })}
              to="/dashboard"
            >
              Dashboard
              <ArrowUpRight aria-hidden="true" />
            </Link>
          ) : status === 'unauthenticated' ? (
            <NavLink className={buttonVariants({ variant: 'ink' })} to="/login">
              Login
            </NavLink>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export default Topbar
