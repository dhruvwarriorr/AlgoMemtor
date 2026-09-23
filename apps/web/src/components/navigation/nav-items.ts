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
  type IconComponent,
} from '@/components/icons/algo-icons'

export type AppNavItem = {
  label: string
  to: string
  icon: IconComponent
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
        chip: 'bg-[#0ea5e9] text-[#03121c]',
      },
      {
        label: 'Bookmarks',
        to: '/bookmarks',
        icon: Bookmark,
        chip: 'bg-[#efe6d2] text-[#5b4a2a]',
      },
      {
        label: 'Contests',
        to: '/contests',
        icon: Trophy,
        chip: 'bg-[#22c55e] text-[#052e14]',
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
        chip: 'bg-[#0b0c0e] text-[#f4f1ea] dark:bg-[#f4f1ea] dark:text-[#0b0c0e]',
      },
      {
        label: 'Memory',
        to: '/memory',
        icon: Brain,
        chip: 'bg-[#e0f2fe] text-[#075985]',
      },
      {
        label: 'Settings',
        to: '/settings',
        icon: Settings,
        chip: 'bg-[#dcfce7] text-[#14532d]',
      },
    ],
  },
]

// Pages reachable from the profile dropdown, used to mark it active.
export const accountMenuPaths = accountMenuGroups.flatMap((group) =>
  group.items.map((item) => item.to),
)
