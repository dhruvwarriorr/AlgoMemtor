import { useEffect, useId, useRef, useState } from 'react'
import {
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Sun,
} from '@/components/icons/algo-icons-line'
import { Link, NavLink, useLocation } from 'react-router-dom'

import type { Theme } from '@/app/theme-context'
import { useTheme } from '@/app/useTheme'
import { UserAvatar } from '@/components/brand/UserAvatar'
import { useAuth } from '@/features/auth/useAuth'
import { useUserIdentity } from '@/features/auth/user-identity'
import { cn } from '@/lib/utils'

import { accountMenuGroups, accountMenuPaths, topNavItems } from './nav-items'
import { useSignOut } from './useSignOut'

const themeChoices: ReadonlyArray<{
  value: Theme
  label: string
  icon: typeof Sun
}> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

const itemClass =
  'group/item grid min-h-14 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3.5 rounded-xl px-2.5 py-2 outline-none transition-colors duration-200 hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring'

// Profile dropdown: a two-column mega-menu holding every page that is not in
// the top bar, plus theme and sign out. On small screens it also carries the
// top-bar pages, since the bar itself only shows the logo and this button.
function AccountMenu() {
  const location = useLocation()
  const { user } = useAuth()
  const identity = useUserIdentity()
  const { theme, setTheme } = useTheme()
  const { isSigningOut, signOut } = useSignOut()
  // Remember where the menu was opened; navigating elsewhere closes it.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  // Any navigation closes the menu for good, so coming back to the page it
  // was opened on (browser Back) does not reopen it.
  const [seenPath, setSeenPath] = useState(location.pathname)
  if (seenPath !== location.pathname) {
    setSeenPath(location.pathname)
    setOpenedAt(null)
  }
  const open = openedAt === location.pathname
  const setOpen = (next: boolean) =>
    setOpenedAt(next ? location.pathname : null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const isActive = accountMenuPaths.some((path) =>
    location.pathname.startsWith(path),
  )

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenedAt(null)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenedAt(null)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Open account menu"
        className={cn(
          'grid size-11 place-items-center rounded-full outline-none ring-offset-2 ring-offset-background transition-[box-shadow] duration-300 focus-visible:ring-2 focus-visible:ring-ring',
          open || isActive
            ? 'ring-2 ring-primary/40'
            : 'hover:ring-2 hover:ring-border',
        )}
        onClick={() => setOpen(!open)}
        ref={buttonRef}
        type="button"
      >
        <UserAvatar />
      </button>

      <div
        className={cn(
          'absolute top-[calc(100%+0.75rem)] right-0 z-40 w-[min(40rem,calc(100vw-1.5rem))] origin-top-right rounded-xl border border-border bg-popover text-popover-foreground shadow-lift transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-[0.98] opacity-0',
        )}
        id={menuId}
        inert={!open}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <UserAvatar className="size-11 text-base" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-lg font-semibold text-foreground">
              {identity.name}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {user?.email ?? 'Signed in'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              aria-label="Edit name and avatar"
              className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
              title="Edit name and avatar"
              to="/settings#profile"
            >
              <Pencil aria-hidden="true" className="size-4" strokeWidth={1.8} />
            </Link>
            <Link
              className="inline-flex h-9 shrink-0 items-center rounded-md border border-border px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              to="/profile"
            >
              View profile
            </Link>
          </div>
        </div>

        <nav
          aria-label="More pages"
          className="grid max-h-[min(60dvh,32rem)] content-start items-start gap-x-4 gap-y-2 overflow-y-auto p-3 sm:grid-cols-2"
        >
          {/* The top-bar pages only exist in this menu below the lg breakpoint. */}
          <div className="p-1 sm:col-span-2 lg:hidden">
            <p className="px-2.5 pt-1 pb-2 text-sm font-semibold text-foreground">
              Main
            </p>
            <ul className="grid gap-0.5 sm:grid-cols-2">
              {topNavItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    className={({ isActive: active }) =>
                      cn(itemClass, active && 'bg-secondary')
                    }
                    to={item.to}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-ink text-ink-foreground">
                      <item.icon
                        aria-hidden="true"
                        className="size-[1.15rem]"
                        strokeWidth={1.8}
                      />
                    </span>
                    <span className="text-[1.0625rem] font-medium text-foreground">
                      {item.label}
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          {accountMenuGroups.map((group) => (
            <div
              className={cn('p-1', group.tall && 'sm:row-span-2')}
              key={group.label}
            >
              <p className="px-2.5 pt-1 pb-2 text-sm font-semibold text-foreground">
                {group.label}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      className={({ isActive: active }) =>
                        cn(itemClass, active && 'bg-secondary')
                      }
                      to={item.to}
                    >
                      <span
                        className={cn(
                          'grid size-10 shrink-0 place-items-center rounded-lg transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/item:scale-105',
                          item.chip,
                        )}
                      >
                        <item.icon
                          aria-hidden="true"
                          className="size-[1.15rem]"
                          strokeWidth={1.8}
                        />
                      </span>
                      <span className="text-[1.0625rem] font-medium text-foreground">
                        {item.label}
                      </span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <div
            aria-label="Theme"
            className="flex rounded-md bg-secondary p-1"
            role="radiogroup"
          >
            {themeChoices.map((choice) => (
              <button
                aria-checked={theme === choice.value}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-200',
                  theme === choice.value
                    ? 'bg-card text-foreground shadow-soft'
                    : 'text-foreground/60 hover:text-foreground',
                )}
                key={choice.value}
                onClick={() => setTheme(choice.value)}
                role="radio"
                type="button"
              >
                <choice.icon
                  aria-hidden="true"
                  className="size-3.5"
                  strokeWidth={1.8}
                />
                {choice.label}
              </button>
            ))}
          </div>
          <button
            className="flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-medium text-foreground/75 transition-colors hover:bg-danger-soft hover:text-danger-foreground disabled:opacity-50"
            disabled={isSigningOut}
            onClick={() => void signOut()}
            type="button"
          >
            <LogOut aria-hidden="true" className="size-4" strokeWidth={1.8} />
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  )
}

export { AccountMenu }
