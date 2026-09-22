import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from 'motion/react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import { LogoMark } from '@/components/brand/LogoMark'
import { Wordmark } from '@/components/brand/Wordmark'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

import { ExploreMenu } from './ExploreMenu'
import { ThemeToggle } from './ThemeToggle'

const sectionLinks = [
  { label: 'Journey', href: '/#journey' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Principles', href: '/#principles' },
] as const

function Brand() {
  return (
    <Link
      aria-label="AlgoMemtor home"
      className="flex min-w-0 items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      to="/"
    >
      <LogoMark />
      <Wordmark className="text-[1.05rem]" />
    </Link>
  )
}

function AuthActions({ compact = false }: { compact?: boolean }) {
  const { status } = useAuth()
  const size = compact ? 'sm' : 'default'

  if (status === 'authenticated') {
    return (
      <Link
        className={buttonVariants({ variant: 'default', size })}
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
      <NavLink
        className={cn(
          buttonVariants({ variant: 'outline', size }),
          'hidden sm:inline-flex',
        )}
        to="/login"
      >
        Log in
      </NavLink>
      <NavLink
        className={buttonVariants({ variant: 'default', size })}
        to="/login"
      >
        Get started
        <ArrowUpRight aria-hidden="true" />
      </NavLink>
    </>
  )
}

// Landing header: a floating glass pill that drops in, then firms up once the
// page scrolls.
function FloatingTopbar() {
  const reduceMotion = useReducedMotion()
  const { scrollY } = useScroll()
  const [solid, setSolid] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => setSolid(y > 30))

  return (
    <motion.header
      animate={{ y: 0, opacity: 1 }}
      className="pointer-events-none fixed inset-x-0 top-5 z-40 flex justify-center px-4"
      initial={reduceMotion ? false : { y: -40, opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className={cn(
          'pointer-events-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 rounded-full border pr-2 pl-3 transition-[background-color,border-color,box-shadow] duration-300',
          solid
            ? 'border-white/12 bg-[#151517]/85 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.8)] backdrop-blur-xl'
            : 'border-white/8 bg-white/[0.03] backdrop-blur-md',
        )}
      >
        <Brand />
        <nav
          aria-label="Page sections"
          className="hidden items-center gap-0.5 lg:flex"
        >
          <ExploreMenu />
          {sectionLinks.map((item) => (
            <a
              className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium text-white/65 outline-none transition-colors duration-300 hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <AuthActions compact />
        </div>
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
