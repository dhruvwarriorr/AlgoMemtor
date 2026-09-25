import {
  BarChart3,
  BookOpen,
  Bookmark,
  Brain,
  Crosshair,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Settings,
  Sparkles,
  Swords,
  TrendingUp,
  Trophy,
  type IconComponent,
} from '@/components/icons/algo-icons-line'

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
  // Spans two rows so shorter groups stack beside it.
  tall?: boolean
  items: ReadonlyArray<AccountMenuItem>
}> = [
  {
    label: 'Mentor tools',
    tall: true,
    items: [
      {
        label: 'Doubt Helper',
        to: '/doubt-helper',
        icon: Crosshair,
        chip: 'bg-[#f97316] text-[#2a1203]',
      },
      {
        label: 'Solution Explorer',
        to: '/solutions',
        icon: BookOpen,
        chip: 'bg-[#a78bfa] text-[#1e1038]',
      },
      {
        label: 'Upsolve',
        to: '/upsolve',
        icon: Swords,
        chip: 'bg-[#f43f5e] text-[#2b050d]',
      },
      {
        label: 'Contest analysis',
        to: '/contest-analysis',
        icon: Trophy,
        chip: 'bg-[#facc15] text-[#2a2203]',
      },
      {
        label: 'Progress report',
        to: '/progress/report',
        icon: TrendingUp,
        chip: 'bg-[#14b8a6] text-[#032522]',
      },
    ],
  },
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
export const accountMenuPaths = [
  '/profile',
  ...accountMenuGroups.flatMap((group) => group.items.map((item) => item.to)),
]
