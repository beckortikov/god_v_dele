import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-client', async () => ({ supabaseAdmin: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { GET as mine, POST as send } from '@/app/api/lesson-feedback/route'
import { GET as summary } from '@/app/api/lesson-feedback/summary/route'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { authorize } from '@/lib/auth-policy'
import { fake } from './helpers/fake-db'

const PROG = '11111111-1111-4111-8111-111111111111'
const OTHER_PROG = '12121212-1212-4212-8212-121212121212'
const GA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ALI = '22222222-2222-4222-8222-222222222222' // group A
const BOB = '33333333-3333-4333-8333-333333333333' // group B
const OUT = '44444444-4444-4444-8444-444444444444' // other program
const L_ALL = '55555555-5555-4555-8555-555555555555'
const L_A = '66666666-6666-4666-8666-666666666666'
const L_FUTURE = '77777777-7777-4777-8777-777777777777'

const who = (role: string, pid?: string) => `${SESSION_COOKIE}=${createSessionToken({ id: `u-${role}`, role, participant_id: pid ?? null, full_name: role })}`
const call = (url: string, role: string, pid?: string, body?: unknown) =>
  new Request(`http://test${url}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', cookie: who(role, pid) }, body: body === undefined ? undefined : JSON.stringify(body) })
const scores = (n: number) => ({ content: n, clarity: n, support: n, useful: n, overall: n })
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

beforeEach(() => {
  fake.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fake.rows('participants').push(
    { id: ALI, name: 'Алиев', program_id: PROG, group_id: GA, status: 'active' },
    { id: BOB, name: 'Бобоев', program_id: PROG, group_id: GB, status: 'active' },
    { id: OUT, name: 'Чужой', program_id: OTHER_PROG, group_id: null, status: 'active' }
  )
  fake.rows('lessons').push(
    { id: L_ALL, program_id: PROG, group_id: null, title: 'Общий урок', starts_at: hoursAgo(50), ends_at: hoursAgo(48), format: 'online' },
    { id: L_A, program_id: PROG, group_id: GA, title: 'Урок группы A', starts_at: hoursAgo(26), ends_at: hoursAgo(24), format: 'online' },
    { id: L_FUTURE, program_id: PROG, group_id: null, title: 'Будущий', starts_at: new Date(Date.now() + 86_400_000).toISOString(), ends_at: new Date(Date.now() + 90_000_000).toISOString(), format: 'online' }
  )
})

describe('POST /api/lesson-feedback', () => {
  it('stores a review, and sending again replaces it', async () => {
    expect((await send(call(`/api/lesson-feedback?participant_id=${ALI}`, 'participant', ALI, { lesson_id: L_ALL, ...scores(8), comment: 'Супер' }))).status).toBe(200)
    expect((await send(call(`/api/lesson-feedback?participant_id=${ALI}`, 'participant', ALI, { lesson_id: L_ALL, ...scores(9) }))).status).toBe(200)
    expect(fake.rows('lesson_feedback')).toHaveLength(1)
    expect(fake.rows('lesson_feedback')[0]).toMatchObject({ lesson_id: L_ALL, participant_id: ALI, content: 9, comment: null })
    const own = (await (await mine(call(`/api/lesson-feedback?participant_id=${ALI}`, 'participant', ALI))).json()).data
    expect(own).toHaveLength(1)
  })

  it('refuses a bad score, a lesson that has not started and a lesson of another group or program', async () => {
    const post = (pid: string, body: object) => send(call(`/api/lesson-feedback?participant_id=${pid}`, 'participant', pid, body))
    expect((await post(ALI, { lesson_id: L_ALL, ...scores(8), clarity: 11 })).status).toBe(400)
    expect((await post(ALI, { lesson_id: L_FUTURE, ...scores(8) })).status).toBe(400)
    expect((await post(BOB, { lesson_id: L_A, ...scores(8) })).status).toBe(400)
    expect((await post(OUT, { lesson_id: L_ALL, ...scores(8) })).status).toBe(400)
    expect(fake.rows('lesson_feedback')).toHaveLength(0)
  })

  it('says the migration is missing', async () => {
    fake.missing.set('lesson_feedback', { code: '42P01', message: 'relation "public.lesson_feedback" does not exist' })
    const res = await send(call(`/api/lesson-feedback?participant_id=${ALI}`, 'participant', ALI, { lesson_id: L_ALL, ...scores(8) }))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('feedback_migration_required')
  })
})

describe('GET /api/lesson-feedback/summary', () => {
  const sum = (role: string, q = `program_id=${PROG}`) => summary(call(`/api/lesson-feedback/summary?${q}`, role))

  it('gives the curators averages, how many answered of how many could, and the wishes without names', async () => {
    await send(call(`/api/lesson-feedback?participant_id=${ALI}`, 'participant', ALI, { lesson_id: L_ALL, ...scores(10), comment: 'Больше практики' }))
    await send(call(`/api/lesson-feedback?participant_id=${BOB}`, 'participant', BOB, { lesson_id: L_ALL, ...scores(8) }))
    const { data } = await (await sum('wheels_manager')).json()
    const all = data.find((r: any) => r.lesson.id === L_ALL)
    expect(all).toMatchObject({ responded: 2, eligible: 2, overall: 9 })
    expect(all.averages.content).toBe(9)
    expect(all.comments.map((c: any) => c.text)).toEqual(['Больше практики'])
    expect(JSON.stringify(data)).not.toContain('Алиев')
    expect(JSON.stringify(data)).not.toContain(ALI)
    // the lesson of group A could be answered by one person only
    expect(data.find((r: any) => r.lesson.id === L_A)).toMatchObject({ responded: 0, eligible: 1, overall: null })
  })

  it('is for the curators: admin, wheels_manager, manager', async () => {
    for (const role of ['admin', 'wheels_manager', 'manager']) expect((await sum(role)).status).toBe(200)
    for (const role of ['finance', 'employee']) expect((await sum(role)).status).toBe(403)
    expect((await summary(call(`/api/lesson-feedback/summary?program_id=${PROG}`, 'participant', ALI))).status).toBe(403)
  })
})

describe('who may call it (the route rules)', () => {
  const p = { uid: 'u', role: 'participant' as const, eid: null, pid: ALI }
  it('a participant only sends and reads their own', () => {
    expect(authorize(p, 'POST', '/api/lesson-feedback', new URLSearchParams({ participant_id: ALI })).ok).toBe(true)
    expect(authorize(p, 'POST', '/api/lesson-feedback', new URLSearchParams({ participant_id: BOB })).ok).toBe(false)
    expect(authorize(p, 'GET', '/api/lesson-feedback', new URLSearchParams({ participant_id: BOB })).ok).toBe(false)
  })
})
