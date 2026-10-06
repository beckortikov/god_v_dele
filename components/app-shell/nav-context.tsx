'use client'

import * as React from 'react'
import type { PageType } from '@/lib/navigation'

interface NavContextValue {
  page: PageType
  navigate: (page: PageType, action?: string) => void
  /** One-shot action requested for the current page (e.g. "new-payment"). */
  pendingAction: string | null
  clearAction: () => void
}

const NavContext = React.createContext<NavContextValue | null>(null)

function readUrlPage(): PageType | null {
  if (typeof window === 'undefined') return null
  return (new URLSearchParams(window.location.search).get('page') as PageType | null) || null
}

export function NavProvider({
  children,
  allowedPages,
  defaultPage,
}: {
  children: React.ReactNode
  allowedPages: PageType[]
  defaultPage: PageType
}) {
  const resolve = React.useCallback(
    (p: PageType | null) => (p && allowedPages.includes(p) ? p : defaultPage),
    [allowedPages, defaultPage]
  )

  const [page, setPage] = React.useState<PageType>(() => resolve(readUrlPage()))
  const [pendingAction, setPendingAction] = React.useState<string | null>(null)

  // Normalise the URL once (unknown or forbidden pages fall back to the default)
  React.useEffect(() => {
    const p = resolve(readUrlPage())
    setPage(p)
    const url = new URL(window.location.href)
    if (url.searchParams.get('page') !== p) {
      url.searchParams.set('page', p)
      window.history.replaceState(null, '', url)
    }
  }, [resolve])

  React.useEffect(() => {
    const onPop = () => setPage(resolve(readUrlPage()))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [resolve])

  const navigate = React.useCallback(
    (next: PageType, action?: string) => {
      const target = resolve(next)
      if (target !== page) {
        const url = new URL(window.location.href)
        url.searchParams.set('page', target)
        window.history.pushState(null, '', url)
        setPage(target)
      }
      setPendingAction(action ?? null)
    },
    [page, resolve]
  )

  const clearAction = React.useCallback(() => setPendingAction(null), [])

  const value = React.useMemo(
    () => ({ page, navigate, pendingAction, clearAction }),
    [page, navigate, pendingAction, clearAction]
  )

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useNav() {
  const ctx = React.useContext(NavContext)
  if (!ctx) throw new Error('useNav must be used inside NavProvider')
  return ctx
}

/** Runs `handler` when the shell requests `action` for the current page. */
export function useNavAction(action: string, handler: () => void) {
  const ctx = React.useContext(NavContext)
  const handlerRef = React.useRef(handler)
  handlerRef.current = handler
  React.useEffect(() => {
    if (ctx?.pendingAction === action) {
      ctx.clearAction()
      handlerRef.current()
    }
  }, [ctx, action])
}
