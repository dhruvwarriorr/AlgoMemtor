import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'

import { ThemeContext, type Theme } from './theme-context'

const themeStorageKey = 'algomemtor-theme'

function getInitialTheme(): Theme {
  const storedTheme = localStorage.getItem(themeStorageKey)

  if (
    storedTheme === 'light' ||
    storedTheme === 'dark' ||
    storedTheme === 'system'
  ) {
    return storedTheme
  }

  return 'system'
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const resolvedTheme =
        theme === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : theme

      document.documentElement.classList.toggle(
        'dark',
        resolvedTheme === 'dark',
      )
      document.documentElement.style.colorScheme = resolvedTheme
    }

    applyTheme()
    localStorage.setItem(themeStorageKey, theme)
    mediaQuery.addEventListener('change', applyTheme)

    return () => mediaQuery.removeEventListener('change', applyTheme)
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme])

  return <ThemeContext value={value}>{children}</ThemeContext>
}
