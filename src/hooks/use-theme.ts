import { useEffect, useMemo, useState } from 'react'

import type { ThemePreference } from '@/lib/types'

const THEME_STORAGE_KEY = 'crosspost.theme'

function getStoredTheme(): ThemePreference {
  const raw = localStorage.getItem(THEME_STORAGE_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useThemePreference() {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme())
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => getSystemTheme())

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const resolved = theme === 'system' ? systemTheme : theme

    root.classList.toggle('dark', resolved === 'dark')
    root.style.colorScheme = resolved
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme, systemTheme])

  const resolvedTheme = useMemo(
    () => (theme === 'system' ? systemTheme : theme),
    [theme, systemTheme],
  )

  return {
    theme,
    resolvedTheme,
    setTheme,
  }
}
