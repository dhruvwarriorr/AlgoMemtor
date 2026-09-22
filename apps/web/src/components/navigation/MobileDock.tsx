import { useCallback, useRef, useState } from 'react'
import { Menu } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

import { cn } from '@/lib/utils'

import MobileSidebar from './MobileSidebar'
import { appNavItems, dockNavItems } from './nav-items'
import { useSignOut } from './useSignOut'

const dockItems = dockNavItems.map((to) =>
  appNavItems.find((item) => item.to === to)!,
)

// Floating pill dock for small screens: the active item expands to show its label.
function MobileDock() {
  const location = useLocation()
  const { isSigningOut, signOut } = useSignOut()
  const [isOpen, setIsOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const inDock = dockItems.some((item) => location.pathname.startsWith(item.to))

  const close = useCallback(() => {
    setIsOpen(false)
    window.requestAnimationFrame(() => menuButtonRef.current?.focus())
  }, [])

  return (
    <>
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 lg:hidden"
      >
        <div className="flex items-center gap-1 rounded-full bg-[#0b1220] p-1.5 shadow-[0_18px_40px_-14px_rgb(11_18_32/0.7)] ring-1 ring-white/10">
          {dockItems.map((item) => (
            <NavLink
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-2 rounded-full text-sm font-medium outline-none transition-[background-color,padding,color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-sky',
                  isActive
                    ? 'bg-white/14 px-4 text-white'
                    : 'w-11 justify-center text-white/60 hover:text-white',
                )
              }
              key={item.to}
              to={item.to}
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    aria-hidden="true"
                    className={cn('size-5 shrink-0', isActive && 'text-sun')}
                    strokeWidth={1.6}
                  />
                  {isActive ? <span>{item.label}</span> : null}
                </>
              )}
            </NavLink>
          ))}
          <button
            aria-controls="mobile-navigation"
            aria-expanded={isOpen}
            aria-label="Open navigation menu"
            className={cn(
              'flex h-11 items-center gap-2 rounded-full outline-none transition-[background-color,padding] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-sky',
              inDock
                ? 'w-11 justify-center text-white/60 hover:text-white'
                : 'bg-white/14 px-4 text-sm font-medium text-white',
            )}
            onClick={() => setIsOpen(true)}
            ref={menuButtonRef}
            type="button"
          >
            <Menu aria-hidden="true" className="size-5" strokeWidth={1.6} />
            {inDock ? null : <span>More</span>}
          </button>
        </div>
      </nav>

      <MobileSidebar
        isOpen={isOpen}
        isSigningOut={isSigningOut}
        onClose={close}
        onSignOut={() => void signOut()}
      />
    </>
  )
}

export { MobileDock }
