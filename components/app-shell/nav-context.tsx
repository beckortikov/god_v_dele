'use client'

import * as React from 'react'
import type { PageType } from '@/lib/navigation'

export interface NavAction {
  name: string
  /** Optional data for the action, e.g. { id } for "open-participant". */
  payload?: Record<string, unknown>
}

interface NavContextValue {
  page: PageType
  navigate: (page: PageType, action?: string, payload?: Record<string, unknown>) => void
  /** One-shot action requested for the current page (e.g. "new-payment"). */
  pendingAction: NavAction | null
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
  const [pendingAction, setPendingAction] = React.useState<NavAction | null>(null)

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
    (next: PageType, action?: string, payload?: Record<string, unknown>) => {
      const target = resolve(next)
      if (target !== page) {
        const url = new URL(window.location.href)
        url.searchParams.set('page', target)
        window.history.pushState(null, '', url)
        setPage(target)
      }
      setPendingAction(action ? { name: action, payload } : null)
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

/**
 * Runs `handler` when the shell requests `action` for the current page.
 * The handler fires once, possibly before the page has loaded its data, so
 * for actions with a payload (e.g. "open-participant" with { id }) store the
 * id in state and open the record once the data is there.
 */
export function useNavAction(action: string, handler: (payload?: Record<string, unknown>) => void) {
  const ctx = React.useContext(NavContext)
  const handlerRef = React.useRef(handler)
  handlerRef.current = handler
  React.useEffect(() => {
    if (ctx?.pendingAction?.name === action) {
      const payload = ctx.pendingAction.payload
      ctx.clearAction()
      handlerRef.current(payload)
    }
  }, [ctx, action])
}
