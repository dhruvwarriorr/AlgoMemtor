import {
  BarChart3,
  Bookmark,
  Brain,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Settings,
  Sparkles,
  TrendingUp,
  Trophy,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

export type AppNavItem = {
  label: string
  to: string
  icon: LucideIcon
}

export type AccountMenuItem = AppNavItem & {
  // Solid colour chip behind the icon, in the style of a product mega-menu.
  chip: string
}

// Always visible in the top bar on desktop.
export const topNavItems: ReadonlyArray<AppNavItem> = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutGrid },
  { label: 'Coach', to: '/coach', icon: Sparkles },
  { label: 'Recommendations', to: '/recommendations', icon: Lightbulb },
  { label: 'Progress', to: '/progress', icon: TrendingUp },
  { label: 'Insights', to: '/analytics', icon: BarChart3 },
]

// Everything else lives in the profile dropdown.
export const accountMenuGroups: ReadonlyArray<{
  label: string
  items: ReadonlyArray<AccountMenuItem>
}> = [
  {
    label: 'Keep practicing',
    items: [
      {
        label: 'Problems',
        to: '/problems',
        icon: ListChecks,
        chip: 'bg-[#ff4d12] text-white',
      },
      {
        label: 'Bookmarks',
        to: '/bookmarks',
        icon: Bookmark,
        chip: 'bg-[#cfe0f4] text-[#1b4f8a]',
      },
      {
        label: 'Contests',
        to: '/contests',
        icon: Trophy,
        chip: 'bg-[#f7d774] text-[#5b4300]',
      },
    ],
  },
  {
    label: 'Your account',
    items: [
      {
        label: 'Profile',
        to: '/profile',
        icon: UserRound,
        chip: 'bg-[#f3cfe0] text-[#8a1f52]',
      },
      {
        label: 'Memory',
        to: '/memory',
        icon: Brain,
        chip: 'bg-[#d9cdf2] text-[#4b2a8f]',
      },
      {
        label: 'Settings',
        to: '/settings',
        icon: Settings,
        chip: 'bg-[#c9ecd8] text-[#0b4d2e]',
      },
    ],
  },
]

// Pages reachable from the profile dropdown, used to mark it active.
export const accountMenuPaths = accountMenuGroups.flatMap((group) =>
  group.items.map((item) => item.to),
)
