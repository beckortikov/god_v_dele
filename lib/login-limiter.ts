/**
 * Slows down password guessing: after MAX_FAILURES wrong passwords for the same
 * login from the same address, further attempts are refused for WINDOW_MS.
 *
 * It lives in the memory of one server process, so on a host with several
 * instances each keeps its own count. That still makes guessing far slower and
 * costs nothing; it is not a replacement for strong passwords.
 */
export const MAX_FAILURES = 5
export const WINDOW_MS = 15 * 60 * 1000

interface Entry {
  count: number
  first: number
}

const failures = new Map<string, Entry>()

const keyOf = (login: string, ip: string) => `${ip}|${login.toLowerCase()}`

function fresh(entry: Entry | undefined, now: number): Entry | undefined {
  return entry && now - entry.first < WINDOW_MS ? entry : undefined
}

/** Milliseconds until the next attempt is allowed, or 0 if it is allowed now. */
export function retryAfterMs(login: string, ip: string, now: number = Date.now()): number {
  const e = fresh(failures.get(keyOf(login, ip)), now)
  return e && e.count >= MAX_FAILURES ? e.first + WINDOW_MS - now : 0
}

export function recordFailure(login: string, ip: string, now: number = Date.now()) {
  const key = keyOf(login, ip)
  const e = fresh(failures.get(key), now)
  failures.set(key, e ? { count: e.count + 1, first: e.first } : { count: 1, first: now })
  // Keep the map from growing without bound
  if (failures.size > 5000) for (const [k, v] of failures) if (!fresh(v, now)) failures.delete(k)
}

export function recordSuccess(login: string, ip: string) {
  failures.delete(keyOf(login, ip))
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

/** For tests. */
export function resetLimiter() {
  failures.clear()
}
