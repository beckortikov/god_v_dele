/**
 * Server-side session: a signed cookie that the server can trust, unlike the
 * copy of the user kept in the browser's localStorage (which is only for
 * drawing the interface).
 *
 * Cookie value: base64url(JSON payload) + '.' + base64url(HMAC-SHA256).
 * The key is SESSION_SECRET when set; otherwise it is derived from the
 * Supabase service key, which is already a server-only secret, so the feature
 * works without any new configuration.
 *
 * Server only: uses node:crypto.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export type Role = 'admin' | 'finance' | 'employee' | 'manager' | 'wheels_manager' | 'participant'
export const ROLES: Role[] = ['admin', 'finance', 'employee', 'manager', 'wheels_manager', 'participant']

export const SESSION_COOKIE = 'gvd_session'
export const SESSION_DAYS = 30
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60

/** Who is logged in, as far as the server is concerned. */
export interface Session {
  /** app_users.id */
  uid: string
  role: Role
  /** app_users.employee_id */
  eid: string | null
  /** app_users.participant_id */
  pid: string | null
  name: string | null
  /** Expiry, seconds since epoch. */
  exp: number
}

function secret(): Buffer {
  const explicit = process.env.SESSION_SECRET
  if (explicit && explicit.length >= 16) return Buffer.from(explicit)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('No key to sign sessions: set SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY')
  return createHmac('sha256', key).update('gvd-session-v1').digest()
}

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url')

function sign(body: string): string {
  return b64(createHmac('sha256', secret()).update(body).digest())
}

/** Builds the cookie value for a user who has just logged in. */
export function createSessionToken(
  user: { id: string; role: string; employee_id?: string | null; participant_id?: string | null; full_name?: string | null },
  nowMs: number = Date.now()
): string {
  const payload: Session = {
    uid: user.id,
    role: user.role as Role,
    eid: user.employee_id ?? null,
    pid: user.participant_id ?? null,
    name: user.full_name ?? null,
    exp: Math.floor(nowMs / 1000) + SESSION_SECONDS,
  }
  const body = b64(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

/** Returns the session for a cookie value, or null if it is forged, expired or malformed. */
export function readSessionToken(token: string | null | undefined, nowMs: number = Date.now()): Session | null {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1), 'base64url')
  const expected = Buffer.from(sign(body), 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<Session>
    if (typeof s.uid !== 'string' || !s.uid) return null
    if (!ROLES.includes(s.role as Role)) return null
    if (typeof s.exp !== 'number' || s.exp * 1000 <= nowMs) return null
    return {
      uid: s.uid,
      role: s.role as Role,
      eid: typeof s.eid === 'string' ? s.eid : null,
      pid: typeof s.pid === 'string' ? s.pid : null,
      name: typeof s.name === 'string' ? s.name : null,
      exp: s.exp,
    }
  } catch {
    return null
  }
}

/** Value of one cookie from a Cookie header. */
export function cookieValue(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return null
}

/** The session of a request, read from its cookie. */
export function getSession(req: Request): Session | null {
  return readSessionToken(cookieValue(req.headers.get('cookie'), SESSION_COOKIE))
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_SECONDS,
}

/** Ids that identify this user in tables keyed by person (wheels use participant, employee or user id). */
export function ownIds(s: Pick<Session, 'uid' | 'eid' | 'pid'>): string[] {
  return [s.uid, s.eid, s.pid].filter((x): x is string => !!x)
}
