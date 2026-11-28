import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => ({ db: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { POST as addAttendees } from '@/app/api/offline-events/[id]/attendees/route'
import { PUT as editAttendee } from '@/app/api/offline-events/[id]/attendees/[attendeeId]/route'
import { GET as summary } from '@/app/api/offline-events/[id]/financial-summary/route'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { fake } from './helpers/fake-db'

const EV = 'e1111111-1111-4111-8111-111111111111'
const cookie = `${SESSION_COOKIE}=${createSessionToken({ id: 'u-admin', role: 'admin', full_name: 'Админ' })}`
const req = (method: string, body?: unknown) =>
  new Request('http://test/x', { method, headers: { 'Content-Type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })

beforeEach(() => {
  fake.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fake.rows('offline_events').push({ id: EV, name: 'Мастермайнд', total_income: 0, total_expenses: 0, balance: 0 })
})

describe('plan vs fact income of an event', () => {
  it('a price entered when adding people is a plan, not money received', async () => {
    const res = await addAttendees(
      req('POST', { attendees: ['p1', 'p2', 'p3'].map(id => ({ attendee_type: 'participant', participant_id: id, price_original: 2300, price_currency: 'USD', exchange_rate: 1 })) }),
      ctx({ id: EV })
    )
    expect(res.status).toBe(201)
    for (const a of fake.rows('event_attendees')) expect(a).toMatchObject({ price: 2300, price_currency: 'USD', payment_received: 0, funnel_stage: 'new' })

    const [a1, a2, a3] = fake.rows('event_attendees')
    // one pays in full, one declines
    await editAttendee(req('PUT', { payment_received: 2300, original_amount: 2300, currency: 'USD', funnel_stage: 'paid' }), ctx({ id: EV, attendeeId: a1.id }))
    await editAttendee(req('PUT', { funnel_stage: 'declined' }), ctx({ id: EV, attendeeId: a3.id }))
    a2.funnel_stage = 'going'
    fake.rows('offline_events')[0].total_income = 2300

    const s = (await (await summary(req('GET'), ctx({ id: EV }))).json()).data
    expect(s.total_income).toBe(2300)
    expect(s.plan).toEqual({ planned: 4600, expected_left: 2300, priced: 2, paid_count: 1, paid_without_amount: 0 })
  })

  it('a price in somoni is kept in somoni and in dollars', async () => {
    await addAttendees(req('POST', { attendee_type: 'guest', guest_name: 'Гость', price_original: 23000, price_currency: 'TJS', exchange_rate: 10 }), ctx({ id: EV }))
    expect(fake.rows('event_attendees')[0]).toMatchObject({ price: 2300, price_currency: 'TJS', price_original: 23000, payment_received: 0 })
  })
})
