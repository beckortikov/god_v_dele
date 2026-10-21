/**
 * Sign-in through the Telegram bot: helpers shared by the routes.
 *
 * The flow: the site asks for a login (token + secret), shows a button to the bot,
 * the person confirms in the bot (lib/telegram.ts), and the site, which keeps polling
 * with its secret, receives the session. Server only: uses node:crypto.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { buildDeepLink } from '@/lib/telegram'

/** What follows /start in the bot link: `login_<token>`. Link codes (10 chars) never look like this. */
export const LOGIN_START_PREFIX = 'login_'
export const LOGIN_TTL_MS = 5 * 60 * 1000
/** Logins one address may start in 10 minutes. */
export const LOGIN_START_LIMIT = 15
export const LOGIN_START_WINDOW_MS = 10 * 60 * 1000

export const newLoginSecret = () => randomBytes(24).toString('base64url')
export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex')

export function secretMatches(secret: unknown, hash: string) {
  if (typeof secret !== 'string' || !secret || secret.length > 200) return false
  const a = Buffer.from(hashSecret(secret))
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const loginDeepLink = (token: string) => buildDeepLink(`${LOGIN_START_PREFIX}${token}`)

/** "Chrome, iPhone" from a User-Agent: enough for the person to recognise their own device in the bot. */
export function describeDevice(userAgent: string | null | undefined) {
  const ua = userAgent ?? ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null
  return [browser, os].filter(Boolean).join(', ') || 'неизвестное устройство'
}
