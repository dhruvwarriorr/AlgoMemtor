import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { Button, buttonVariants } from '@/components/ui/button'
import type { AuthStatus } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'

type MobileSidebarProps = {
  authStatus: AuthStatus
  items: ReadonlyArray<{
    label: string
    to: string
  }>
  isOpen: boolean
  isSigningOut: boolean
  onClose: () => void
  onSignOut: () => void
}

function MobileSidebar({
  authStatus,
  items,
  isOpen,
  isSigningOut,
  onClose,
  onSignOut,
}: MobileSidebarProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  return (
    <>
      <button
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none lg:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />

      <aside
        aria-hidden={!isOpen}
        aria-label="Mobile navigation panel"
        aria-modal={isOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-3rem)] flex-col border-r border-border bg-background p-4 shadow-lg transition-transform duration-200 motion-reduce:transition-none lg:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        id="mobile-navigation"
        inert={!isOpen}
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <h2 className="text-lg font-semibold text-foreground">Menu</h2>
          <Button
            aria-label="Close navigation menu"
            onClick={onClose}
            ref={closeButtonRef}
            size="icon-lg"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <nav
          aria-label="Mobile navigation"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-4"
        >
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 items-center rounded-md px-3 py-2 text-base font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      isActive
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                  onClick={onClose}
                  to={item.to}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="mt-auto border-t border-border pt-4">
            {authStatus === 'authenticated' ? (
              <Button
                className="min-h-11 w-full"
                disabled={isSigningOut}
                onClick={() => {
                  onClose()
                  onSignOut()
                }}
                type="button"
                variant="outline"
              >
                {isSigningOut ? 'Signing out…' : 'Logout'}
              </Button>
            ) : authStatus === 'unauthenticated' ? (
              <NavLink
                className={({ isActive }) =>
                  buttonVariants({
                    className: 'min-h-11 w-full',
                    variant: isActive ? 'default' : 'outline',
                  })
                }
                onClick={onClose}
                to="/login"
              >
                Login / Sign Up
              </NavLink>
            ) : null}
          </div>
        </nav>
      </aside>
    </>
  )
}

export default MobileSidebar
