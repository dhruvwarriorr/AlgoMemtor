import { motion, useReducedMotion } from 'motion/react'
import { Link, NavLink } from 'react-router-dom'

import { LogoMark } from '@/components/brand/LogoMark'
import { cn } from '@/lib/utils'

import { AccountMenu } from './AccountMenu'
import { topNavItems } from './nav-items'

// Signed-in top bar: brand on the left, pages and the profile menu grouped on
// the right. The active page sits on a raised pill, like a product navbar.
function AppTopbar() {
  const reduceMotion = useReducedMotion()

  return (
    <header className="sticky top-0 z-30 h-(--app-header) w-full border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          aria-label="AlgoMemtor home"
          className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          to="/dashboard"
        >
          <LogoMark />
        </Link>

        <div className="flex min-w-0 items-center gap-2 lg:gap-3">
          <nav aria-label="Main navigation" className="hidden lg:block">
            <ul className="isolate flex items-center gap-1">
              {topNavItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    className={({ isActive }) =>
                      cn(
                        'group/nav relative inline-flex h-10 items-center gap-2 rounded-md px-4 text-[0.95rem] font-medium whitespace-nowrap outline-none transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-ring',
                        isActive
                          ? 'text-foreground'
                          : 'text-foreground/60 hover:bg-card/60 hover:text-foreground',
                      )
                    }
                    to={item.to}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          // The active pill glides between pages.
                          <motion.span
                            aria-hidden="true"
                            className="absolute inset-0 -z-10 rounded-md bg-card shadow-soft ring-1 ring-border"
                            layoutId={reduceMotion ? undefined : 'nav-pill'}
                            transition={{
                              type: 'spring',
                              stiffness: 420,
                              damping: 34,
                            }}
                          />
                        ) : null}
                        <item.icon
                          aria-hidden="true"
                          className={cn(
                            'size-4 transition-colors',
                            isActive
                              ? 'text-primary [--icon-node:var(--go)]'
                              : 'text-foreground/45 group-hover/nav:text-foreground/70',
                          )}
                          strokeWidth={1.8}
                        />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <span
            aria-hidden="true"
            className="hidden h-6 w-px bg-border lg:block"
          />
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}

export { AppTopbar }
