import { Monitor, Moon, Sun } from '@/components/icons/algo-icons-line'

import type { Theme } from '@/providers/theme-context'
import { useTheme } from '@/providers/useTheme'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const nextTheme: Record<Theme, Theme> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

const themeLabel: Record<Theme, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
}

function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <Button
      aria-label={`${themeLabel[theme]}. Switch to ${themeLabel[nextTheme[theme]].toLowerCase()}`}
      className={cn('text-foreground/75', className)}
      onClick={() => setTheme(nextTheme[theme])}
      size="icon"
      title={themeLabel[theme]}
      type="button"
      variant="ghost"
    >
      <Icon aria-hidden="true" strokeWidth={1.75} />
    </Button>
  )
}

export { ThemeToggle }
