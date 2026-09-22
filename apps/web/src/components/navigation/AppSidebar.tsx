import { useEffect, useState } from 'react'
import {
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
} from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

import { LogoMark } from '@/components/brand/LogoMark'
import { UserAvatar } from '@/components/brand/UserAvatar'
import { displayNameFromEmail } from '@/lib/display-name'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

import { appNavGroups } from './nav-items'
import { ThemeToggle } from './ThemeToggle'
import { useSignOut } from './useSignOut'

const collapsedStorageKey = 'algomemtor-sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(collapsedStorageKey) === 'true'
  } catch {
    return false
  }
}

const itemBase =
  'group/item relative flex h-10 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium outline-none transition-[background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-ring'

function AppSidebar() {
  const { user } = useAuth()
  const { isSigningOut, signOut } = useSignOut()
  const [collapsed, setCollapsed] = useState(readCollapsed)

  useEffect(() => {
    try {
      localStorage.setItem(collapsedStorageKey, String(collapsed))
    } catch {
      // Collapsing still works for this visit without storage.
    }
  }, [collapsed])

  return (
    <aside
      aria-label="App navigation"
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col py-4 pl-4 transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none lg:flex',
        collapsed ? 'w-[5.25rem]' : 'w-[17rem]',
      )}
    >
      <div
        className={cn(
          'flex h-12 items-center gap-2.5 pr-3',
          collapsed ? 'justify-center pr-4' : 'justify-between',
        )}
      >
        <Link
          aria-label="AlgoMemtor home"
          className="flex min-w-0 items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          to="/dashboard"
        >
          <LogoMark />
          {collapsed ? null : (
            <span className="font-heading text-lg font-bold tracking-[-0.03em] text-foreground">
              AlgoMemtor
            </span>
          )}
        </Link>
        {collapsed ? null : (
          <button
            aria-label="Collapse sidebar"
            className="grid size-8 place-items-center rounded-lg text-foreground/55 outline-none transition-colors hover:bg-card/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setCollapsed(true)}
            type="button"
          >
            <PanelLeftClose className="size-[1.1rem]" strokeWidth={1.6} />
          </button>
        )}
      </div>

      <div className={cn('mt-5', collapsed ? 'pr-4' : 'pr-3')}>
        <Link
          aria-label={collapsed ? 'Ask your coach' : undefined}
          className={cn(
            'group/cta flex h-11 items-center justify-center gap-2 rounded-full bg-ink text-sm font-medium text-ink-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_10px_24px_-12px_rgb(11_18_32/0.6)] outline-none transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]',
            collapsed ? 'w-11 px-0' : 'w-full pr-1.5 pl-4',
          )}
          to="/coach"
        >
          {collapsed ? (
            <Sparkles className="size-4 text-sun" strokeWidth={1.8} />
          ) : (
            <>
              <span className="flex-1 text-left">Ask your coach</span>
              <span className="grid size-8 place-items-center rounded-full bg-white/12 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/cta:scale-105 group-hover/cta:rotate-12 dark:bg-black/10">
                <Sparkles className="size-4 text-sun" strokeWidth={1.8} />
              </span>
            </>
          )}
        </Link>
      </div>

      <nav
        aria-label="Main navigation"
        className={cn(
          'mt-6 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto',
          collapsed ? 'pr-4' : 'pr-3',
        )}
      >
        {appNavGroups.map((group) => (
          <div key={group.label}>
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-foreground/10" />
            ) : (
              <p className="mb-2 px-3 text-xs font-medium text-foreground/45">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    aria-label={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        itemBase,
                        collapsed && 'justify-center px-0',
                        isActive
                          ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(22_52_102/0.08),0_8px_20px_-12px_rgb(22_52_102/0.35)] dark:shadow-none'
                          : 'text-foreground/65 hover:bg-card/55 hover:text-foreground',
                      )
                    }
                    title={collapsed ? item.label : undefined}
                    to={item.to}
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          aria-hidden="true"
                          className={cn(
                            'size-[1.15rem] shrink-0 transition-colors',
                            isActive ? 'text-primary' : '',
                          )}
                          strokeWidth={1.6}
                        />
                        {collapsed ? null : (
                          <span className="truncate">{item.label}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('mt-4', collapsed ? 'pr-4' : 'pr-3')}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            <button
              aria-label="Expand sidebar"
              className="grid size-10 place-items-center rounded-xl text-foreground/60 outline-none transition-colors hover:bg-card/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setCollapsed(false)}
              type="button"
            >
              <PanelLeftOpen className="size-[1.1rem]" strokeWidth={1.6} />
            </button>
            <ThemeToggle />
            <NavLink
              aria-label="Settings"
              className={({ isActive }) =>
                cn(
                  'grid size-10 place-items-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-card text-primary'
                    : 'text-foreground/60 hover:bg-card/70 hover:text-foreground',
                )
              }
              title="Settings"
              to="/settings"
            >
              <Settings className="size-[1.1rem]" strokeWidth={1.6} />
            </NavLink>
            <button
              aria-label="Sign out"
              className="grid size-10 place-items-center rounded-xl text-foreground/60 outline-none transition-colors hover:bg-danger-soft hover:text-danger-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              disabled={isSigningOut}
              onClick={() => void signOut()}
              title="Sign out"
              type="button"
            >
              <LogOut className="size-[1.1rem]" strokeWidth={1.6} />
            </button>
            <Link
              aria-label="Profile"
              className="mt-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Profile"
              to="/profile"
            >
              <UserAvatar email={user?.email} />
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl bg-card/70 p-1.5 ring-1 ring-foreground/5 dark:bg-card/60">
            <div className="flex items-center gap-2.5 rounded-xl p-1.5">
              <Link
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                to="/profile"
              >
                <UserAvatar email={user?.email} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {displayNameFromEmail(user?.email)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {user?.email ?? 'Signed in'}
                  </span>
                </span>
              </Link>
            </div>
            <div className="mt-1 flex items-center gap-1 border-t border-foreground/5 pt-1.5">
              <NavLink
                className={({ isActive }) =>
                  cn(
                    'flex h-9 flex-1 items-center gap-2 rounded-lg px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-foreground/70 hover:bg-secondary hover:text-foreground',
                  )
                }
                to="/settings"
              >
                <Settings className="size-4" strokeWidth={1.6} />
                Settings
              </NavLink>
              <ThemeToggle className="size-9" />
              <button
                aria-label="Sign out"
                className="grid size-9 place-items-center rounded-full text-foreground/65 outline-none transition-colors hover:bg-danger-soft hover:text-danger-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                disabled={isSigningOut}
                onClick={() => void signOut()}
                title="Sign out"
                type="button"
              >
                <LogOut className="size-4" strokeWidth={1.6} />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

export { AppSidebar }
