'use client'

let installed = false

const SESSION_KEYS = ['isAuthenticated', 'userRole', 'userName', 'user']

/** Forgets the user kept in the browser (the server session is ended by /api/auth/logout). */
export function clearLocalSession() {
  for (const k of SESSION_KEYS) localStorage.removeItem(k)
}

/**
 * The server answers 401 when the session cookie is missing or has expired
 * (also right after the update that introduced sessions, for people who were
 * already logged in). Then the stored user is dropped and the login screen
 * is shown, instead of a page full of failed requests.
 *
 * `onExpired` runs once per expiry.
 */
export function installAuthGuard(onExpired: () => void) {
  if (installed || typeof window === 'undefined') return
  installed = true
  const original = window.fetch.bind(window)
  let handled = false
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init)
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const isApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`)
      const isLogin = url.includes('/api/auth/login') || url.includes('/api/auth/logout')
      if (isApi && !isLogin && response.status === 401 && !handled) {
        handled = true
        clearLocalSession()
        onExpired()
        // The next login starts clean
        setTimeout(() => {
          handled = false
        }, 1000)
      }
    } catch {
      /* never break a request because of the guard */
    }
    return response
  }
}
