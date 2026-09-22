import { useEffect, useRef } from 'react'
import { LogOut, Settings, UserRound, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { LogoMark } from '@/components/brand/LogoMark'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { appNavGroups } from './nav-items'
import { ThemeToggle } from './ThemeToggle'

type MobileSidebarProps = {
  isOpen: boolean
  isSigningOut: boolean
  onClose: () => void
  onSignOut: () => void
}

const itemClass =
  'flex min-h-12 items-center gap-3 rounded-2xl px-4 text-base font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring'

// Full list of destinations for small screens, opened from the dock.
function MobileSidebar({
  isOpen,
  isSigningOut,
  onClose,
  onSignOut,
}: MobileSidebarProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return

    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      itemClass,
      isActive
        ? 'bg-ink text-ink-foreground'
        : 'text-foreground/80 hover:bg-secondary hover:text-foreground',
    )

  return (
    <>
      <button
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-40 bg-[rgb(8_18_40/0.4)] backdrop-blur-[2px] transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none lg:hidden',
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
          'fixed inset-x-3 bottom-3 z-50 flex max-h-[85dvh] flex-col rounded-[2rem] border border-border bg-popover p-3 shadow-lift transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none lg:hidden',
          isOpen
            ? 'translate-y-0 opacity-100'
            : 'translate-y-[calc(100%+1rem)] opacity-0',
        )}
        id="mobile-navigation"
        inert={!isOpen}
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4 p-1.5">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <h2 className="text-lg font-bold text-foreground">Menu</h2>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              aria-label="Close navigation menu"
              onClick={onClose}
              ref={closeButtonRef}
              size="icon"
              type="button"
              variant="secondary"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>

        <nav
          aria-label="Mobile navigation"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pt-2"
        >
          {appNavGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-4 text-xs font-medium text-muted-foreground">
                {group.label}
              </p>
              <ul className="grid grid-cols-2 gap-1">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      className={linkClass}
                      onClick={onClose}
                      to={item.to}
                    >
                      <item.icon
                        aria-hidden="true"
                        className="size-[1.15rem]"
                        strokeWidth={1.6}
                      />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-1 border-t border-border pt-3">
            <NavLink className={linkClass} onClick={onClose} to="/profile">
              <UserRound
                aria-hidden="true"
                className="size-[1.15rem]"
                strokeWidth={1.6}
              />
              Profile
            </NavLink>
            <NavLink className={linkClass} onClick={onClose} to="/settings">
              <Settings
                aria-hidden="true"
                className="size-[1.15rem]"
                strokeWidth={1.6}
              />
              Settings
            </NavLink>
          </div>
          <Button
            className="min-h-12 w-full"
            disabled={isSigningOut}
            onClick={() => {
              onClose()
              onSignOut()
            }}
            type="button"
            variant="outline"
          >
            <LogOut aria-hidden="true" />
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </nav>
      </aside>
    </>
  )
}

export default MobileSidebar
