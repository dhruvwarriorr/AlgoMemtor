import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Menu } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

import { useNotification } from '@/app/useNotification'
import { Button, buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

import MobileSidebar from './MobileSidebar'

const primaryNavigationItems = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Problems', to: '/problems' },
  { label: 'Coach', to: '/coach' },
  { label: 'Progress', to: '/progress' },
  { label: 'Insights', to: '/analytics' },
] as const

const secondaryNavigationItems = [
  { label: 'Activity', to: '/activity' },
  { label: 'Contests', to: '/contests' },
  { label: 'Recommendations', to: '/recommendations' },
  { label: 'Bookmarks', to: '/bookmarks' },
  { label: 'Memory', to: '/memory' },
  { label: 'Profile', to: '/profile' },
  { label: 'Settings', to: '/settings' },
] as const

const navigationItems = [
  ...primaryNavigationItems,
  ...secondaryNavigationItems,
] as const

function Topbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notify } = useNotification()
  const { signOut, status } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false)
    window.requestAnimationFrame(() => menuButtonRef.current?.focus())
  }, [])

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) {
      return
    }

    setIsSigningOut(true)
    try {
      await signOut()
      await navigate('/', { replace: true })
    } catch (error: unknown) {
      notify({
        title: 'Unable to sign out',
        description:
          error instanceof Error
            ? error.message
            : 'Please try signing out again.',
        tone: 'error',
      })
    } finally {
      setIsSigningOut(false)
    }
  }, [isSigningOut, navigate, notify, signOut])

  useEffect(() => {
    const desktopViewport = window.matchMedia('(min-width: 64rem)')

    function handleViewportChange(event: MediaQueryListEvent) {
      if (event.matches) {
        setIsMobileMenuOpen(false)
      }
    }

    desktopViewport.addEventListener('change', handleViewportChange)

    return () =>
      desktopViewport.removeEventListener('change', handleViewportChange)
  }, [])

  return (
    <>
      <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <NavLink
            className="min-w-0 rounded-md text-lg font-semibold tracking-[-0.035em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-xl"
            to="/"
          >
            AlgoMemtor
          </NavLink>

          <div className="hidden min-w-0 items-center gap-6 lg:flex">
            <nav aria-label="Main navigation">
              <ul className="flex items-center gap-1">
                {primaryNavigationItems.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      className={({ isActive }) =>
                        cn(
                          'inline-flex rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          isActive
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )
                      }
                      to={item.to}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
                <li>
                  <details className="group relative">
                    <summary
                      className={cn(
                        'flex cursor-pointer list-none items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden',
                        secondaryNavigationItems.some((item) =>
                          location.pathname.startsWith(item.to),
                        ) && 'bg-muted text-foreground',
                      )}
                    >
                      More
                      <ChevronDown
                        aria-hidden="true"
                        className="size-3.5 transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 grid w-52 gap-1 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
                      {secondaryNavigationItems.map((item) => (
                        <NavLink
                          className={({ isActive }) =>
                            cn(
                              'rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                              isActive
                                ? 'bg-muted text-foreground'
                                : 'text-muted-foreground',
                            )
                          }
                          key={item.to}
                          to={item.to}
                        >
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  </details>
                </li>
              </ul>
            </nav>

            {status === 'authenticated' ? (
              <Button
                disabled={isSigningOut}
                onClick={() => void handleSignOut()}
                type="button"
                variant="outline"
              >
                {isSigningOut ? 'Signing out…' : 'Sign out'}
              </Button>
            ) : status === 'unauthenticated' ? (
              <NavLink
                className={({ isActive }) =>
                  buttonVariants({
                    variant: isActive ? 'default' : 'outline',
                  })
                }
                to="/login"
              >
                Login / Sign Up
              </NavLink>
            ) : null}
          </div>

          <Button
            aria-controls="mobile-navigation"
            aria-expanded={isMobileMenuOpen}
            aria-label="Open navigation menu"
            className="lg:hidden"
            onClick={() => setIsMobileMenuOpen(true)}
            ref={menuButtonRef}
            size="icon-lg"
            type="button"
            variant="outline"
          >
            <Menu aria-hidden="true" />
          </Button>
        </div>
      </header>

      <MobileSidebar
        authStatus={status}
        items={navigationItems}
        isOpen={isMobileMenuOpen}
        isSigningOut={isSigningOut}
        onClose={closeMobileMenu}
        onSignOut={() => void handleSignOut()}
      />
    </>
  )
}

export default Topbar
