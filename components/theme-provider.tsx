'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { ACCENT_KEY } from '@/lib/accent-init'

export const ACCENTS = [
  { id: 'indigo', label: 'Индиго', swatch: 'oklch(0.52 0.2 268)' },
  { id: 'ocean', label: 'Океан', swatch: 'oklch(0.53 0.16 245)' },
  { id: 'teal', label: 'Бирюза', swatch: 'oklch(0.52 0.1 195)' },
  { id: 'emerald', label: 'Изумруд', swatch: 'oklch(0.52 0.13 158)' },
  { id: 'violet', label: 'Фиалка', swatch: 'oklch(0.52 0.2 300)' },
  { id: 'graphite', label: 'Графит', swatch: 'oklch(0.3 0.02 265)' },
] as const

export type AccentId = (typeof ACCENTS)[number]['id']


const AccentContext = React.createContext<{
  accent: AccentId
  setAccent: (a: AccentId) => void
}>({ accent: 'indigo', setAccent: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = React.useState<AccentId>('indigo')

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(ACCENT_KEY) as AccentId | null
      if (saved && ACCENTS.some(a => a.id === saved)) setAccentState(saved)
    } catch {}
  }, [])

  const setAccent = React.useCallback((a: AccentId) => {
    setAccentState(a)
    const root = document.documentElement
    if (a === 'indigo') delete root.dataset.accent
    else root.dataset.accent = a
    try {
      localStorage.setItem(ACCENT_KEY, a)
    } catch {}
  }, [])

  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <AccentContext.Provider value={{ accent, setAccent }}>{children}</AccentContext.Provider>
    </NextThemesProvider>
  )
}

export function useAccent() {
  return React.useContext(AccentContext)
}
