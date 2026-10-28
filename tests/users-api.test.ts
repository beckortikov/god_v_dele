import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake database: every query chain resolves to whatever the test put in `h.result`.
const h = vi.hoisted(() => ({
  env: (process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'),
  result: { data: null, error: null } as { data: unknown; error: unknown },
  writes: [] as { op: 'insert' | 'update'; row: Record<string, unknown> }[],
}))
vi.mock('@/lib/db', () => {
  const chain = () => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'delete', 'eq', 'is', 'single', 'maybeSingle']) b[m] = () => b
    b.insert = (rows: Record<string, unknown>[] | Record<string, unknown>) => {
      h.writes.push({ op: 'insert', row: Array.isArray(rows) ? rows[0] : rows })
      return b
    }
    b.update = (row: Record<string, unknown>) => {
      h.writes.push({ op: 'update', row })
      return b
    }
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(h.result).then(resolve, reject)
    return b
  }
  return { db: { from: () => chain() } }
})

import { GET, POST } from '@/app/api/admin/users/route'
import { PUT } from '@/app/api/admin/users/[id]/route'
import { POST as LOGIN } from '@/app/api/auth/login/route'
import { hashPassword, isHashed } from '@/lib/password'
import { MAX_FAILURES, resetLimiter } from '@/lib/login-limiter'
import { POST as LOGOUT } from '@/app/api/auth/logout/route'
import { readSessionToken, SESSION_COOKIE } from '@/lib/session'

const SECRET = 'plain-text-secret-123'
const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  username: 'ali',
  password: SECRET,
  role: 'finance',
  full_name: 'Али',
  employee_id: null,
  participant_id: null,
  ...over,
})
const json = (body: unknown) =>
  new Request('http://test/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('user API never returns passwords', () => {
  beforeEach(() => {
    h.result = { data: null, error: null }
    h.writes = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('GET /api/admin/users', async () => {
    h.result = { data: [user(), user({ id: 'u2', username: 'bek', password: '' })], error: null }
    const res = await GET(new Request('http://test/api/admin/users'))
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(text).not.toContain(SECRET)
    const rows = JSON.parse(text)
    expect(rows).toHaveLength(2)
    expect(rows.every((r: Record<string, unknown>) => !('password' in r))).toBe(true)
    expect(rows[0]).toMatchObject({ id: 'u1', username: 'ali', role: 'finance' })
  })

  it('POST /api/admin/users (the created user)', async () => {
    h.result = { data: user(), error: null }
    const res = await POST(json({ username: 'ali', password: SECRET, role: 'finance', full_name: 'Али' }))
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(text).not.toContain(SECRET)
    expect(JSON.parse(text)).toMatchObject({ id: 'u1', username: 'ali' })
  })

  it('PUT /api/admin/users/[id] (the updated user)', async () => {
    h.result = { data: user({ role: 'admin' }), error: null }
    const req = new Request('http://test/api/admin/users/u1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin', password: SECRET }),
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'u1' }) })
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(text).not.toContain(SECRET)
    expect(JSON.parse(text)).toMatchObject({ id: 'u1', role: 'admin' })
  })
})

describe('passwords are stored hashed', () => {
  beforeEach(() => {
    h.result = { data: null, error: null }
    h.writes = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('POST stores a hash, never the plain password', async () => {
    h.result = { data: user(), error: null }
    await POST(json({ username: 'ali', password: SECRET, role: 'finance' }))
    const insert = h.writes.find(w => w.op === 'insert' && w.row.username === 'ali')
    expect(insert).toBeTruthy()
    expect(isHashed(insert!.row.password as string)).toBe(true)
    expect(JSON.stringify(insert!.row)).not.toContain(SECRET)
  })

  const put = (body: unknown) =>
    PUT(
      new Request('http://test/api/admin/users/u1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: 'u1' }) }
    )

  it('PUT with an empty password keeps the stored one (the form sends "" when the field is left blank)', async () => {
    h.result = { data: user(), error: null }
    await put({ role: 'admin', password: '' })
    await put({ role: 'admin', password: '   ' })
    const updates = h.writes.filter(w => w.op === 'update' && 'role' in w.row)
    expect(updates).toHaveLength(2)
    for (const u of updates) expect('password' in u.row).toBe(false)
  })

  it('PUT with a new password stores its hash', async () => {
    h.result = { data: user(), error: null }
    await put({ password: 'новый-пароль-1' })
    const update = h.writes.find(w => w.op === 'update' && 'password' in w.row)
    expect(isHashed(update!.row.password as string)).toBe(true)
    expect(JSON.stringify(update!.row)).not.toContain('новый-пароль-1')
  })
})

describe('login', () => {
  const login = (body: unknown, ip = '10.0.0.1') =>
    LOGIN(new Request('http://test/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) }))

  beforeEach(() => {
    resetLimiter()
    h.result = { data: null, error: null }
    h.writes = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('accepts a hashed password and does not rewrite it', async () => {
    h.result = { data: [user({ password: await hashPassword(SECRET) })], error: null }
    const res = await login({ login: 'ali', password: SECRET })
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(JSON.parse(text).user).toMatchObject({ id: 'u1', username: 'ali', role: 'finance' })
    expect(text).not.toContain('password')
    expect(h.writes.some(w => w.op === 'update' && 'password' in w.row)).toBe(false)
  })

  it('accepts a legacy plain-text password and replaces it with a hash', async () => {
    h.result = { data: [user({ password: SECRET })], error: null }
    const res = await login({ login: 'ali', password: SECRET })
    expect(res.status).toBe(200)
    const upgrade = h.writes.find(w => w.op === 'update' && 'password' in w.row)
    expect(isHashed(upgrade!.row.password as string)).toBe(true)
  })

  it('rejects a wrong password and an unknown login with the same 401', async () => {
    h.result = { data: [user({ password: await hashPassword(SECRET) })], error: null }
    expect((await login({ login: 'ali', password: 'wrong' })).status).toBe(401)
    h.result = { data: [], error: null }
    const unknown = await login({ login: 'nobody', password: SECRET })
    expect(unknown.status).toBe(401)
    expect(await unknown.json()).toEqual({ error: 'Invalid credentials' })
  })

  it('never lets anyone in on an empty stored password', async () => {
    h.result = { data: [user({ password: '' })], error: null }
    expect((await login({ login: 'ali', password: '' })).status).toBe(400)
    expect((await login({ login: 'ali', password: 'anything' })).status).toBe(401)
  })

  it('rejects non-string input instead of querying with it', async () => {
    expect((await login({ login: { $ne: '' }, password: SECRET })).status).toBe(400)
    expect((await login({ login: 'ali', password: ['x'] })).status).toBe(400)
  })
})

describe('login session cookie', () => {
  const login = (body: unknown, ip = '10.0.0.2') =>
    LOGIN(new Request('http://test/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) }))

  beforeEach(() => {
    resetLimiter()
    h.result = { data: null, error: null }
    h.writes = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('sets an HttpOnly signed session cookie with the user, role and links', async () => {
    h.result = { data: [user({ role: 'participant', participant_id: 'p1', employee_id: null, password: await hashPassword(SECRET) })], error: null }
    const res = await login({ login: 'ali', password: SECRET })
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`${SESSION_COOKIE}=`)
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
    const token = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='))
    expect(readSessionToken(token)).toMatchObject({ uid: 'u1', role: 'participant', pid: 'p1', eid: null })
  })

  it('sets no cookie when the password is wrong', async () => {
    h.result = { data: [user({ password: await hashPassword(SECRET) })], error: null }
    const res = await login({ login: 'ali', password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it(`refuses further attempts after ${MAX_FAILURES} wrong passwords, only for that login and address`, async () => {
    h.result = { data: [user({ password: await hashPassword(SECRET) })], error: null }
    for (let i = 0; i < MAX_FAILURES; i++) expect((await login({ login: 'ali', password: 'bad' })).status).toBe(401)
    const blocked = await login({ login: 'ali', password: SECRET })
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(blocked.headers.get('set-cookie')).toBeNull()
    expect((await login({ login: 'ali', password: SECRET }, '10.0.0.99')).status).toBe(200)
  })

  it('a successful login clears the failure count', async () => {
    h.result = { data: [user({ password: await hashPassword(SECRET) })], error: null }
    for (let i = 0; i < MAX_FAILURES - 1; i++) await login({ login: 'ali', password: 'bad' })
    expect((await login({ login: 'ali', password: SECRET })).status).toBe(200)
    for (let i = 0; i < MAX_FAILURES - 1; i++) expect((await login({ login: 'ali', password: 'bad' })).status).toBe(401)
  })

  it('logout clears the cookie', async () => {
    const res = await LOGOUT()
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`${SESSION_COOKIE}=;`)
    expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=/)
  })
})
