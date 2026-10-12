import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake database: every query chain resolves to whatever the test put in `h.result`.
const h = vi.hoisted(() => ({ result: { data: null, error: null } as { data: unknown; error: unknown } }))
vi.mock('@/lib/supabase-client', () => {
  const chain = () => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'insert', 'update', 'delete', 'eq', 'is', 'single', 'maybeSingle']) b[m] = () => b
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(h.result).then(resolve, reject)
    return b
  }
  return { supabaseAdmin: { from: () => chain() } }
})

import { GET, POST } from '@/app/api/admin/users/route'
import { PUT } from '@/app/api/admin/users/[id]/route'

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
