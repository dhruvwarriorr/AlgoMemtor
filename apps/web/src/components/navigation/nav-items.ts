import {
  Activity,
  BarChart3,
  Bookmark,
  Brain,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Sparkles,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react'

export type AppNavItem = {
  label: string
  to: string
  icon: LucideIcon
}

export const appNavGroups: ReadonlyArray<{
  label: string
  items: ReadonlyArray<AppNavItem>
}> = [
  {
    label: 'Practice',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutGrid },
      { label: 'Coach', to: '/coach', icon: Sparkles },
      { label: 'Problems', to: '/problems', icon: ListChecks },
      { label: 'Recommendations', to: '/recommendations', icon: Lightbulb },
      { label: 'Bookmarks', to: '/bookmarks', icon: Bookmark },
      { label: 'Contests', to: '/contests', icon: Trophy },
    ],
  },
  {
    label: 'Your journey',
    items: [
      { label: 'Progress', to: '/progress', icon: TrendingUp },
      { label: 'Insights', to: '/analytics', icon: BarChart3 },
      { label: 'Activity', to: '/activity', icon: Activity },
      { label: 'Memory', to: '/memory', icon: Brain },
    ],
  },
]

export const appNavItems: ReadonlyArray<AppNavItem> = appNavGroups.flatMap(
  (group) => group.items,
)

// The four destinations that live directly in the mobile dock.
export const dockNavItems = ['/dashboard', '/problems', '/coach', '/progress']
