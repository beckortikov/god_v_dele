import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => ({ db: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { GET as listComments, POST as addComment } from '@/app/api/offline-events/[id]/attendees/[attendeeId]/comments/route'
import { DELETE as delComment } from '@/app/api/offline-events/[id]/attendees/[attendeeId]/comments/[commentId]/route'
import { PUT as editAttendee } from '@/app/api/offline-events/[id]/attendees/[attendeeId]/route'
import { contactDue, parseCommentBody, parseContactDate, stageAfterPayment, summarizeComments } from '@/lib/event-funnel'
import { attendeeContact, telHref, type Attendee } from '@/components/events/types'
import { fake } from './helpers/fake-db'

const EV = 'e1111111-1111-4111-8111-111111111111'
const OTHER_EV = 'e2222222-2222-4222-8222-222222222222'
const ALI = 'a1111111-1111-4111-8111-111111111111'

const req = (method: string, url: string, body?: unknown) =>
  new Request(`http://test${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })
const json = async (res: Response) => ({ status: res.status, body: await res.json() })

describe('funnel helpers', () => {
  it('moves anyone still in the funnel to «Оплатил» on payment, but not «Не поедет»', () => {
    expect(stageAfterPayment('going', 100)).toBe('paid')
    expect(stageAfterPayment('new', 0.01)).toBe('paid')
    expect(stageAfterPayment('declined', 100)).toBe('declined')
    expect(stageAfterPayment('thinking', 0)).toBe('thinking')
  })

  it('parses comments and callback dates', () => {
    expect(parseCommentBody('  перезвонить после зарплаты ')).toBe('перезвонить после зарплаты')
    expect(parseCommentBody('   ')).toBeNull()
    expect(parseCommentBody(5)).toBeNull()
    expect(parseCommentBody('x'.repeat(3000))).toHaveLength(2000)
    expect(parseContactDate('2026-11-21')).toBe('2026-11-21')
    expect(parseContactDate('')).toBeNull()
    expect(parseContactDate(null)).toBeNull()
    expect(parseContactDate('2026-02-30')).toBeUndefined()
    expect(parseContactDate('21.11.2026')).toBeUndefined()
  })

  it('tells overdue, today and later callbacks apart', () => {
    expect(contactDue('2026-11-19', '2026-11-20')).toBe('overdue')
    expect(contactDue('2026-11-20', '2026-11-20')).toBe('today')
    expect(contactDue('2026-11-21', '2026-11-20')).toBe('later')
    expect(contactDue(null, '2026-11-20')).toBeNull()
  })

  it('keeps the newest comment and the count per person', () => {
    const m = summarizeComments([
      { attendee_id: 'a', body: 'old', author_name: null, created_at: '2026-11-01T10:00:00Z' },
      { attendee_id: 'a', body: 'new', author_name: 'Анвар', created_at: '2026-11-02T10:00:00Z' },
      { attendee_id: 'b', body: 'only', author_name: null, created_at: '2026-11-01T10:00:00Z' },
    ])
    expect(m.get('a')).toEqual({ last: { body: 'new', author_name: 'Анвар', created_at: '2026-11-02T10:00:00Z' }, count: 2 })
    expect(m.get('b')?.count).toBe(1)
  })

  it('finds a phone for guests and participants and makes a tel: link only for phones', () => {
    const base = { id: '1', event_id: EV, payment_received: 0, attendance_status: 'registered' } as Attendee
    expect(attendeeContact({ ...base, attendee_type: 'participant', participant_phone: '+992 90 123-45-67' })).toBe('+992 90 123-45-67')
    expect(attendeeContact({ ...base, attendee_type: 'guest', guest_email: 'a@b.tj' })).toBe('a@b.tj')
    expect(telHref('+992 90 123-45-67')).toBe('tel:+992901234567')
    expect(telHref('a@b.tj')).toBeNull()
    expect(telHref('нет')).toBeNull()
  })
})

describe('/api/offline-events/[id]/attendees/[attendeeId]', () => {
  beforeEach(() => {
    fake.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.rows('event_attendees').push({ id: ALI, event_id: EV, attendee_type: 'participant', payment_received: 0, attendance_status: 'registered', funnel_stage: 'new' })
  })

  it('saves stage and callback date, ignores fields that are not editable', async () => {
    const res = await json(await editAttendee(req('PUT', '/x', { funnel_stage: 'thinking', next_contact_on: '2026-11-25', event_id: OTHER_EV }), ctx({ id: EV, attendeeId: ALI })))
    expect(res.status).toBe(200)
    expect(fake.rows('event_attendees')[0]).toMatchObject({ funnel_stage: 'thinking', next_contact_on: '2026-11-25', event_id: EV })
  })

  it('refuses an unknown stage or a bad date', async () => {
    expect((await editAttendee(req('PUT', '/x', { funnel_stage: 'maybe' }), ctx({ id: EV, attendeeId: ALI }))).status).toBe(400)
    expect((await editAttendee(req('PUT', '/x', { next_contact_on: 'завтра' }), ctx({ id: EV, attendeeId: ALI }))).status).toBe(400)
    expect(fake.rows('event_attendees')[0].funnel_stage).toBe('new')
  })

  it('does not touch a person through another event', async () => {
    await editAttendee(req('PUT', '/x', { funnel_stage: 'declined' }), ctx({ id: OTHER_EV, attendeeId: ALI }))
    expect(fake.rows('event_attendees')[0].funnel_stage).toBe('new')
  })
})

describe('/api/offline-events/[id]/attendees/[attendeeId]/comments', () => {
  beforeEach(() => {
    fake.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.rows('event_attendees').push({ id: ALI, event_id: EV, attendee_type: 'participant' })
  })

  it('adds, lists newest first and deletes comments', async () => {
    const p = ctx({ id: EV, attendeeId: ALI })
    const first = await json(await addComment(req('POST', '/x', { body: ' Думает, перезвонить в пятницу ' }), p))
    expect(first.status).toBe(201)
    expect(first.body.data.body).toBe('Думает, перезвонить в пятницу')
    fake.rows('event_attendee_comments')[0].created_at = '2026-11-01T10:00:00Z'
    await addComment(req('POST', '/x', { body: 'Сказал, что поедет' }), p)

    const list = await json(await listComments(req('GET', '/x'), p))
    expect(list.body.data.map((c: { body: string }) => c.body)).toEqual(['Сказал, что поедет', 'Думает, перезвонить в пятницу'])

    expect((await delComment(req('DELETE', '/x'), ctx({ id: EV, attendeeId: ALI, commentId: first.body.data.id }))).status).toBe(200)
    expect(fake.rows('event_attendee_comments')).toHaveLength(1)
  })

  it('refuses an empty comment and a person from another event', async () => {
    expect((await addComment(req('POST', '/x', { body: '  ' }), ctx({ id: EV, attendeeId: ALI }))).status).toBe(400)
    expect((await addComment(req('POST', '/x', { body: 'привет' }), ctx({ id: OTHER_EV, attendeeId: ALI }))).status).toBe(404)
    expect(fake.rows('event_attendee_comments')).toHaveLength(0)
  })
})
