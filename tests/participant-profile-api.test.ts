import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-client', async () => ({ supabaseAdmin: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { GET, PUT } from '@/app/api/participant-profile/route'
import { DELETE as deleteYear, PUT as putYear } from '@/app/api/participant-profile/years/route'
import { DELETE as deleteScan, GET as getScans, POST as postScan } from '@/app/api/participant-profile/files/route'
import { GET as getSummary } from '@/app/api/participant-profile/summary/route'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { encodeKey } from '@/lib/report-files'
import { fake } from './helpers/fake-db'

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const PASSPORT = 'A 7654321'

const who = (role: string, pid?: string) => `${SESSION_COOKIE}=${createSessionToken({ id: `u-${role}`, role, participant_id: pid ?? null, full_name: role })}`
const req = (url: string, role: string, pid?: string, body?: unknown, method = 'GET') =>
  new Request(`http://test${url}`, { method, headers: { 'Content-Type': 'application/json', cookie: who(role, pid) }, body: body === undefined ? undefined : JSON.stringify(body) })
const q = (id: string) => `?participant_id=${id}`
const base = '/api/participant-profile'

beforeEach(() => {
  fake.reset()
  // The route remembers once it has created the bucket (per process), so tests start with it in place
  fake.buckets.set('participant-docs', new Map())
  fake.rows('participants').push({ id: P1, name: 'Алиев Ахмад', phone: '+992900000001', email: 'a@x.tj' }, { id: P2, name: 'Бобоева Мадина', phone: null, email: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('who may open a profile', () => {
  it('lets a participant open only their own, and admin and wheels_manager anyone\'s', async () => {
    expect((await GET(req(`${base}${q(P1)}`, 'participant', P1))).status).toBe(200)
    expect((await GET(req(`${base}${q(P2)}`, 'participant', P1))).status).toBe(403)
    expect((await GET(req(`${base}${q(P2)}`, 'wheels_manager'))).status).toBe(200)
    expect((await GET(req(`${base}${q(P2)}`, 'admin'))).status).toBe(200)
  })
  it('refuses everyone else even if the proxy let the request through', async () => {
    for (const role of ['finance', 'manager', 'employee']) expect((await GET(req(`${base}${q(P1)}`, role))).status).toBe(403)
    expect((await GET(new Request(`http://test${base}${q(P1)}`))).status).toBe(403)
  })
  it('wants a real participant id', async () => {
    expect((await GET(req(`${base}?participant_id=nope`, 'admin'))).status).toBe(400)
    expect((await GET(req(`${base}${q('33333333-3333-4333-8333-333333333333')}`, 'admin'))).status).toBe(404)
  })
})

describe('saving the profile', () => {
  it('starts empty, then stores trimmed fields and shows them back', async () => {
    const empty = (await (await GET(req(`${base}${q(P1)}`, 'participant', P1))).json()).data
    expect(empty).toMatchObject({ profile: null, years: [], scans: [], scansUnavailable: false, participant: { name: 'Алиев Ахмад', phone: '+992900000001' } })

    const res = await PUT(req(`${base}${q(P1)}`, 'participant', P1, { city: '  Душанбе ', passport_number: PASSPORT, activity: 'Торговля', currency: 'USD', participant_id: P2 }, 'PUT'))
    expect(res.status).toBe(200)
    // the participant_id in the body is ignored: the profile goes to the person in the query
    expect(fake.rows('participant_profiles')).toHaveLength(1)
    expect(fake.rows('participant_profiles')[0]).toMatchObject({ participant_id: P1, city: 'Душанбе', passport_number: PASSPORT, activity: 'Торговля', currency: 'USD' })

    const back = (await (await GET(req(`${base}${q(P1)}`, 'admin'))).json()).data
    expect(back.profile).toMatchObject({ city: 'Душанбе', activity: 'Торговля' })
  })

  it('a second save changes only the fields sent', async () => {
    await PUT(req(`${base}${q(P1)}`, 'admin', undefined, { city: 'Душанбе', activity: 'Торговля' }, 'PUT'))
    await PUT(req(`${base}${q(P1)}`, 'admin', undefined, { activity: 'Услуги' }, 'PUT'))
    expect(fake.rows('participant_profiles')[0]).toMatchObject({ city: 'Душанбе', activity: 'Услуги' })
  })

  it('refuses bad input and another person\'s profile', async () => {
    expect((await PUT(req(`${base}${q(P1)}`, 'admin', undefined, { birth_date: '2999-01-01' }, 'PUT'))).status).toBe(400)
    expect((await PUT(req(`${base}${q(P1)}`, 'admin', undefined, { currency: 'BTC' }, 'PUT'))).status).toBe(400)
    expect((await PUT(req(`${base}${q(P1)}`, 'admin', undefined, {}, 'PUT'))).status).toBe(400)
    expect((await PUT(req(`${base}${q(P2)}`, 'participant', P1, { city: 'X' }, 'PUT'))).status).toBe(403)
    expect(fake.rows('participant_profiles')).toHaveLength(0)
  })

  it('writes the names of the changed fields to the журнал, never the passport', async () => {
    await PUT(req(`${base}${q(P1)}`, 'participant', P1, { passport_number: PASSPORT, passport_issued: 'РРУ Душанбе', city: 'Душанбе' }, 'PUT'))
    const log = JSON.stringify(fake.rows('audit_log'))
    expect(log).toContain('серия и номер паспорта')
    expect(log).not.toContain(PASSPORT)
    expect(log).not.toContain('РРУ Душанбе')
  })

  it('says the migration is missing instead of failing', async () => {
    fake.missing.set('participant_profiles', { code: '42P01', message: 'relation "public.participant_profiles" does not exist' })
    const res = await GET(req(`${base}${q(P1)}`, 'admin'))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('profile_migration_required')
  })
})

describe('turnover and net profit by year', () => {
  const years = (id: string, role = 'admin', pid?: string) => `${base}/years${q(id)}`
  it('adds a year, replaces it on a second save, and keeps the numbers', async () => {
    expect((await putYear(req(years(P1), 'participant', P1, { year: 2024, turnover: '1 200 000', net_profit: '150000' }, 'PUT'))).status).toBe(200)
    await putYear(req(years(P1), 'participant', P1, { year: 2024, turnover: 1300000, net_profit: -5000, notes: 'открыл вторую точку' }, 'PUT'))
    await putYear(req(years(P1), 'participant', P1, { year: 2025, turnover: 1800000, net_profit: 300000 }, 'PUT'))
    const rows = fake.rows('participant_business_years')
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.year === 2024)).toMatchObject({ turnover: 1300000, net_profit: -5000, notes: 'открыл вторую точку' })
    const data = (await (await GET(req(`${base}${q(P1)}`, 'wheels_manager'))).json()).data
    expect(data.years.map((y: { year: number }) => y.year)).toEqual([2024, 2025])
  })
  it('refuses a year without numbers, a wrong year and someone else\'s', async () => {
    expect((await putYear(req(years(P1), 'admin', undefined, { year: 2024 }, 'PUT'))).status).toBe(400)
    expect((await putYear(req(years(P1), 'admin', undefined, { year: 1800, turnover: 1 }, 'PUT'))).status).toBe(400)
    expect((await putYear(req(years(P2), 'participant', P1, { year: 2024, turnover: 1 }, 'PUT'))).status).toBe(403)
  })
  it('removes one year', async () => {
    await putYear(req(years(P1), 'admin', undefined, { year: 2024, turnover: 1 }, 'PUT'))
    await putYear(req(years(P1), 'admin', undefined, { year: 2025, turnover: 2 }, 'PUT'))
    expect((await deleteYear(req(`${years(P1)}&year=2024`, 'participant', P1, undefined, 'DELETE'))).status).toBe(200)
    expect(fake.rows('participant_business_years').map(r => r.year)).toEqual([2025])
    expect((await deleteYear(req(years(P1), 'admin', undefined, undefined, 'DELETE'))).status).toBe(400)
  })
})

describe('passport scans', () => {
  const files = (id: string) => `${base}/files${q(id)}`
  const jpg = { name: 'Паспорт.jpg', size: 2_000_000, type: 'image/jpeg' }

  it('hands out an upload link only for photos and PDF within the limits', async () => {
    const ok = await postScan(req(files(P1), 'participant', P1, jpg, 'POST'))
    expect(ok.status).toBe(201)
    const { data } = await ok.json()
    expect(data.signedUrl).toContain(`participant-docs/${P1}/${data.key}`)

    for (const bad of [{ ...jpg, type: 'application/msword' }, { ...jpg, size: 20 * 1024 * 1024 }, { ...jpg, size: 0 }]) {
      expect((await postScan(req(files(P1), 'participant', P1, bad, 'POST'))).status).toBe(400)
    }
    expect((await postScan(req(files(P2), 'participant', P1, jpg, 'POST'))).status).toBe(403)
  })

  it('stops at six scans', async () => {
    const bucket = fake.buckets.get('participant-docs')!
    for (let i = 0; i < 6; i++) bucket.set(`${P1}/${encodeKey(`scan${i}.jpg`, 'image/jpeg', 1000 + i)}`, 1000)
    const res = await postScan(req(files(P1), 'admin', undefined, jpg, 'POST'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/до 6/)
  })

  it('lists scans and opens one through a short-lived signed link, logging the opening', async () => {
    const key = encodeKey('Паспорт.jpg', 'image/jpeg', 1700000000000)
    fake.buckets.get('participant-docs')!.set(`${P1}/${key}`, 1234)

    const list = (await (await getScans(req(files(P1), 'participant', P1))).json()).data
    expect(list).toEqual([{ key, name: 'Паспорт.jpg', size: 1234 }])

    const open = await getScans(req(`${files(P1)}&download=${encodeURIComponent(key)}`, 'wheels_manager'))
    expect(open.status).toBe(302)
    expect(open.headers.get('location')).toContain(`participant-docs/${P1}/${key}`)
    expect(JSON.stringify(fake.rows('audit_log'))).toContain('Скан паспорта')

    expect((await getScans(req(`${files(P1)}&download=${encodeURIComponent(key)}`, 'participant', P2))).status).toBe(403)
    expect((await getScans(req(`${files(P1)}&download=..%2Fsecret`, 'admin'))).status).toBe(400)
    expect((await getScans(req(`${files(P2)}&download=${encodeURIComponent(key)}`, 'admin'))).status).toBe(400)
  })

  it('deletes a scan, but only with a key we made', async () => {
    const key = encodeKey('a.pdf', 'application/pdf', 1700000000000)
    fake.buckets.get('participant-docs')!.set(`${P1}/${key}`, 10)
    expect((await deleteScan(req(`${files(P1)}&key=../x`, 'admin', undefined, undefined, 'DELETE'))).status).toBe(400)
    expect((await deleteScan(req(`${files(P1)}&key=${encodeURIComponent(key)}`, 'participant', P1, undefined, 'DELETE'))).status).toBe(200)
    expect(fake.buckets.get('participant-docs')!.size).toBe(0)
  })
})

describe('profile summary for the participants list', () => {
  const summary = (role: string, pid?: string) => getSummary(req(`${base}/summary`, role, pid))

  it('is for admin and wheels_manager only', async () => {
    expect((await summary('admin')).status).toBe(200)
    expect((await summary('wheels_manager')).status).toBe(200)
    for (const [role, pid] of [['participant', P1], ['finance'], ['manager'], ['employee']] as const) expect((await summary(role, pid)).status).toBe(403)
  })

  it('counts what each participant has filled in, and leaves out those with nothing', async () => {
    fake.rows('participant_profiles').push({ participant_id: P1, birth_date: '1990-01-01', city: 'Душанбе', passport_number: PASSPORT, activity: 'Торговля' })
    fake.rows('participant_business_years').push({ participant_id: P1, year: 2024 })
    fake.buckets.get('participant-docs')!.set(`${P1}/${encodeKey('p.jpg', 'image/jpeg', 1700000000000)}`, 100)
    fake.rows('participant_profiles').push({ participant_id: P2, city: 'Худжанд' })

    const { data } = await (await summary('wheels_manager')).json()
    expect(data[P1]).toEqual({ done: 6, total: 6 })
    expect(data[P2]).toEqual({ done: 1, total: 6 })
    expect(Object.keys(data)).toHaveLength(2)
    // no values, only counts
    expect(JSON.stringify(data)).not.toContain(PASSPORT)
  })

  it('says the migration is missing', async () => {
    fake.missing.set('participant_profiles', { code: '42P01', message: 'relation "public.participant_profiles" does not exist' })
    expect((await summary('admin')).status).toBe(503)
  })
})
