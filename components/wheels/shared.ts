'use client'

import * as React from 'react'

export const TEMPLATE_ID = '00000000-0000-0000-0000-000000000000'

export interface WheelParticipant {
  id: string
  name: string
  program?: { name: string }
  status: string
}

export const MONTHS_FULL = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

export const YEARS = [2025, 2026, 2027, 2028]

/** Server error text → a sentence a person can act on. */
export function saveErrorMessage(e: unknown) {
  const msg = (e as { message?: string })?.message || 'Неизвестная ошибка'
  if (msg.includes('violates foreign key constraint')) {
    return 'Ваш аккаунт не связан с карточкой участника. Обратитесь к администратору.'
  }
  return msg
}

/** ⌘S / Ctrl+S and ⌘/Ctrl+Enter call `onSave` while `enabled`. */
export function useSaveShortcut(onSave: () => void, enabled: boolean) {
  const ref = React.useRef(onSave)
  ref.current = onSave
  React.useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 's' || e.key === 'S' || e.key === 'Enter') {
        e.preventDefault()
        ref.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

/** Warn before closing the tab with unsaved edits. */
export function useBeforeUnload(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false)
  React.useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])
  return matches
}

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

/** A tab value that survives reloads (per page). */
export function usePersistentState<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = React.useState<T>(initial)
  React.useEffect(() => {
    const saved = readPref(key) as T | null
    if (saved && allowed.includes(saved)) setValue(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const set = React.useCallback(
    (v: T) => {
      setValue(v)
      writePref(key, v)
    },
    [key]
  )
  return [value, set] as const
}
