'use client'

let installed = false

/**
 * Adds x-actor-id / x-actor-name headers to same-origin /api requests so the
 * server can record who made a change in the audit log.
 */
export function installActorHeaders() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const original = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const isApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`)
      if (isApi) {
        const raw = localStorage.getItem('user')
        const user = raw ? JSON.parse(raw) : null
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
        if (user) {
          headers.set('x-actor-id', encodeURIComponent(String(user.id ?? '')))
          headers.set('x-actor-name', encodeURIComponent(String(user.full_name || user.username || '')))
        }
        return original(input, { ...init, headers })
      }
    } catch {
      /* fall through */
    }
    return original(input, init)
  }
}
