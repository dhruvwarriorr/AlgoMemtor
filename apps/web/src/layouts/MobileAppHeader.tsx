import { Link } from 'react-router-dom'

import { LogoMark } from '@/components/brand/LogoMark'
import { UserAvatar } from '@/components/brand/UserAvatar'
import { ThemeToggle } from '@/components/navigation/ThemeToggle'
import { useAuth } from '@/features/auth/useAuth'

export function MobileAppHeader() {
  const { user } = useAuth()

  return (
    <header className="flex h-14 items-center justify-between px-2 lg:hidden">
      <Link
        aria-label="AlgoMemtor home"
        className="flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        to="/dashboard"
      >
        <LogoMark />
        <span className="font-heading text-lg font-bold tracking-[-0.03em] text-foreground">
          AlgoMemtor
        </span>
      </Link>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Link
          aria-label="Profile"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          to="/profile"
        >
          <UserAvatar email={user?.email} />
        </Link>
      </div>
    </header>
  )
}
