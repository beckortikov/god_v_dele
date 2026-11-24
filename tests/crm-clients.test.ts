import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => ({ db: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { GET as listClients, POST as addClient } from '@/app/api/crm/clients/route'
import { POST as invite } from '@/app/api/crm/clients/[id]/invite/route'
import { GET as card, PATCH as editClient } from '@/app/api/crm/clients/[id]/route'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { fake } from './helpers/fake-db'

const EV = 'e1111111-1111-4111-8111-111111111111'
const GUEST = 'g1111111-1111-4111-8111-111111111111'

const who = (role: string, name: string) => `${SESSION_COOKIE}=${createSessionToken({ id: `u-${name}`, role, full_name: name })}`
const req = (method: string, body?: unknown, as: [string, string] = ['employee', 'Шабо']) =>
  new Request('http://test/x', { method, headers: { 'Content-Type': 'application/json', cookie: who(as[0], as[1]) }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })
const json = async (res: Response) => ({ status: res.status, body: await res.json() })

describe('/api/crm/clients', () => {
  beforeEach(() => {
    fake.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.rows('app_users').push(
      { id: 'u-Шабо', full_name: 'Шабо', role: 'employee', crm_access: true },
      { id: 'u-Без', full_name: 'Без доступа', role: 'employee', crm_access: false }
    )
    fake.rows('programs').push({ id: GUEST, name: 'Гостевой' })
    fake.rows('offline_events').push({ id: EV, name: 'Мастермайнд', event_date: '2026-12-12', status: 'planned' })
  })

  it('needs «Доступ к CRM»', async () => {
    expect((await listClients(req('GET', undefined, ['employee', 'Без']))).status).toBe(403)
    expect((await addClient(req('POST', { name: 'Кто-то' }, ['employee', 'Без']))).status).toBe(403)
    expect(fake.rows('participants')).toHaveLength(0)
  })

  it('adds a client from the street with the business, invited with a note for the call', async () => {
    const res = await json(
      await addClient(
        req('POST', {
          name: ' Рустам Каримов ',
          phone: '+992 93 111 22 33',
          event_id: EV,
          note: 'Пришёл на стенд, просил позвонить после 18:00',
          profile: { source: 'С улицы', city: 'Душанбе', activity: 'Кафе', business_name: '', monthly_turnover: '80000', currency: 'TJS', instagram: '' },
        })
      )
    )
    expect(res.status).toBe(201)
    const [p] = fake.rows('participants')
    expect(p).toMatchObject({ name: 'Рустам Каримов', phone: '+992 93 111 22 33', program_id: GUEST })
    expect(fake.rows('participant_profiles')[0]).toMatchObject({ participant_id: p.id, source: 'С улицы', city: 'Душанбе', activity: 'Кафе', monthly_turnover: 80000 })
    expect(fake.rows('participant_profiles')[0]).not.toHaveProperty('instagram')
    expect(fake.rows('event_attendees')).toEqual([expect.objectContaining({ event_id: EV, participant_id: p.id, attendee_type: 'guest', hunter_id: 'u-Шабо', funnel_stage: 'new' })])
    expect(fake.rows('event_attendee_comments').map(r => [r.kind, r.body])).toEqual([
      ['added', 'new'],
      ['note', 'Пришёл на стенд, просил позвонить после 18:00'],
    ])
  })

  it('warns about the same phone already in the base, and adds anyway when asked', async () => {
    fake.rows('participants').push({ id: 'p-old', name: 'Рустам К.', phone: '931112233', program_id: GUEST, status: 'active' })
    const dup = await json(await addClient(req('POST', { name: 'Рустам', phone: '+992 (93) 111-22-33' })))
    expect(dup.status).toBe(409)
    expect(dup.body.existing).toEqual({ id: 'p-old', name: 'Рустам К.' })
    expect(fake.rows('participants')).toHaveLength(1)
    expect((await addClient(req('POST', { name: 'Рустам', phone: '+992 (93) 111-22-33', force: true }))).status).toBe(201)
    expect(fake.rows('participants')).toHaveLength(2)
  })

  it('refuses a client without a name or with a bad turnover', async () => {
    expect((await addClient(req('POST', { name: '  ' }))).status).toBe(400)
    expect((await addClient(req('POST', { name: 'Анна', profile: { monthly_turnover: 'много' } }))).status).toBe(400)
    expect(fake.rows('participants')).toHaveLength(0)
  })

  it('lists the base with the profile, and invites an existing client once', async () => {
    fake.rows('participants').push({ id: 'p1', name: 'Малика', phone: '+992900000001', status: 'active', created_at: '2026-11-20T10:00:00Z', program_id: GUEST })
    fake.rows('participant_profiles').push({ participant_id: 'p1', source: 'Рекомендация', city: 'Худжанд', monthly_turnover: '50000.00', currency: 'TJS' })
    const list = (await json(await listClients(req('GET')))).body.data
    expect(list[0]).toMatchObject({ name: 'Малика', source: 'Рекомендация', city: 'Худжанд', monthly_turnover: 50000 })

    expect((await invite(req('POST', { event_id: EV }), ctx({ id: 'p1' }))).status).toBe(201)
    await invite(req('POST', { event_id: EV }), ctx({ id: 'p1' }))
    expect(fake.rows('event_attendees')).toHaveLength(1)
    expect((await invite(req('POST', {}), ctx({ id: 'p1' }))).status).toBe(400)
    expect((await invite(req('POST', { event_id: EV }), ctx({ id: 'nobody' }))).status).toBe(404)
  })

  it('shows the card with events and call history, and edits contacts and business in place', async () => {
    fake.rows('participants').push({ id: 'p1', name: 'Малика', phone: '+992900000001', status: 'active', created_at: '2026-11-20T10:00:00Z', program_id: GUEST })
    fake.rows('participant_profiles').push({ participant_id: 'p1', city: 'Худжанд', activity: 'Салон', monthly_turnover: '50000', currency: 'TJS' })
    await invite(req('POST', { event_id: EV, note: 'Ждёт звонка' }), ctx({ id: 'p1' }))
    const c = (await json(await card(req('GET'), ctx({ id: 'p1' })))).body.data
    expect(c).toMatchObject({ name: 'Малика', profile: { city: 'Худжанд', monthly_turnover: 50000 } })
    expect(c.events).toEqual([expect.objectContaining({ name: 'Мастермайнд', stage: 'new', hunter: 'Шабо' })])
    expect(c.history.map((h: any) => h.body)).toEqual(expect.arrayContaining(['Ждёт звонка']))

    const res = await editClient(req('PATCH', { phone: '+992 90 000 00 09', profile: { city: '', activity: 'Сеть салонов', monthly_turnover: '90000', currency: 'TJS' } }), ctx({ id: 'p1' }))
    expect(res.status).toBe(200)
    expect(fake.rows('participants')[0].phone).toBe('+992 90 000 00 09')
    expect(fake.rows('participant_profiles')[0]).toMatchObject({ city: null, activity: 'Сеть салонов', monthly_turnover: 90000 })
    expect((await editClient(req('PATCH', { name: ' ' }), ctx({ id: 'p1' }))).status).toBe(400)
    expect((await card(req('GET', undefined, ['employee', 'Без']), ctx({ id: 'p1' }))).status).toBe(403)
  })
})
