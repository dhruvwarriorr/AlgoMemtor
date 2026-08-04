import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import MobileSidebar from './MobileSidebar'

const navigationItems = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Problems', to: '/problems' },
  { label: 'Progress', to: '/progress' },
  { label: 'Settings', to: '/settings' },
] as const

function Topbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false)
    window.requestAnimationFrame(() => menuButtonRef.current?.focus())
  }, [])

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
      <header className="sticky top-0 z-30 w-full border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <NavLink
            className="min-w-0 rounded-md text-lg font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-xl"
            to="/"
          >
            AlgoMemtor
          </NavLink>

          <div className="hidden min-w-0 items-center gap-6 lg:flex">
            <nav aria-label="Main navigation">
              <ul className="flex items-center gap-1">
                {navigationItems.map((item) => (
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
              </ul>
            </nav>

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
        items={navigationItems}
        isOpen={isMobileMenuOpen}
        onClose={closeMobileMenu}
      />
    </>
  )
}

export default Topbar
