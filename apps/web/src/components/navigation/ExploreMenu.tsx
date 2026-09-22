import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

import { accountMenuGroups, topNavItems } from './nav-items'

// What a visitor can preview: the coach workspace, then the practice tools.
const exploreGroups = [
  { label: 'Your coach', items: topNavItems },
  accountMenuGroups[0],
]

// Two-column icon menu, opened from the public nav — a preview of what's
// inside the app before signing in. Same "icon chip + label" grid as a
// typical product mega-menu.
function ExploreMenu() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
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
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex h-9 items-center gap-1 rounded-full px-4 text-sm font-medium text-foreground/75 outline-none transition-colors duration-300 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-secondary aria-expanded:text-foreground"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        Explore
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-3.5 transition-transform duration-300',
            open && 'rotate-180',
          )}
          strokeWidth={2}
        />
      </button>

      <div
        className={cn(
          'absolute top-[calc(100%+0.75rem)] left-1/2 z-40 w-[min(34rem,90vw)] -translate-x-1/2 origin-top rounded-2xl border border-border bg-popover p-3 text-left shadow-lift transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-[0.98] opacity-0',
        )}
        role="menu"
      >
        <div className="grid grid-cols-2 gap-1">
          {exploreGroups.map((group) => (
            <div className="p-2" key={group.label} role="none">
              <p className="mb-1 px-2 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {group.label}
              </p>
              <ul>
                {group.items.map((item) => (
                  <li key={item.to}>
                    <a
                      className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-foreground outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
                      href="/login"
                      onClick={() => setOpen(false)}
                      role="menuitem"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                        <item.icon
                          aria-hidden="true"
                          className="size-4"
                          strokeWidth={1.8}
                        />
                      </span>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export { ExploreMenu }
