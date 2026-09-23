import { ArrowUpRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import { LogoMark } from '@/components/brand/LogoMark'
import { Wordmark } from '@/components/brand/Wordmark'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

import { ThemeToggle } from './ThemeToggle'

function Brand({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <Link
      aria-label="AlgoMemtor home"
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring',
        iconOnly && 'rounded-full',
      )}
      to="/"
    >
      <LogoMark className={iconOnly ? 'size-12 sm:size-14' : undefined} />
      {iconOnly ? null : <Wordmark className="text-[1.05rem]" />}
    </Link>
  )
}

function AuthActions({
  compact = false,
  showLogin = true,
  landing = false,
}: {
  compact?: boolean
  showLogin?: boolean
  landing?: boolean
}) {
  const { status } = useAuth()
  const size = landing ? 'lg' : compact ? 'sm' : 'default'

  if (status === 'authenticated') {
    return (
      <Link
        className={cn(
          buttonVariants({ variant: 'default', size }),
          landing && 'h-12 rounded-xl px-5 text-base sm:h-14 sm:px-6',
        )}
        to="/dashboard"
      >
        Dashboard
        <ArrowUpRight aria-hidden="true" />
      </Link>
    )
  }
  if (status !== 'unauthenticated') return null

  return (
    <>
      {showLogin ? (
        <NavLink
          className={cn(
            buttonVariants({ variant: 'outline', size }),
            'hidden sm:inline-flex',
          )}
          to="/login"
        >
          Log in
        </NavLink>
      ) : null}
      <NavLink
        className={cn(
          buttonVariants({ variant: 'default', size }),
          landing && 'h-12 rounded-xl px-5 text-base sm:h-14 sm:px-6',
        )}
        to="/login"
      >
        Get started
        <ArrowUpRight aria-hidden="true" />
      </NavLink>
    </>
  )
}

// The landing header keeps the mark and primary action at opposite edges.
function FloatingTopbar() {
  const reduceMotion = useReducedMotion()

  return (
    <motion.header
      animate={{ y: 0, opacity: 1 }}
      className="pointer-events-none fixed inset-x-0 top-4 z-40 flex items-center justify-between px-4 sm:top-6 sm:px-8 lg:px-12"
      initial={reduceMotion ? false : { y: -40, opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="pointer-events-auto">
        <Brand iconOnly />
      </div>
      <div className="pointer-events-auto">
        <AuthActions landing showLogin={false} />
      </div>
    </motion.header>
  )
}

// Other public pages (login, onboarding, 404): a flat bar with a bottom border.
function FlatTopbar() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Brand />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <AuthActions />
        </div>
      </div>
    </header>
  )
}

function Topbar() {
  return useLocation().pathname === '/' ? <FloatingTopbar /> : <FlatTopbar />
}

export default Topbar
