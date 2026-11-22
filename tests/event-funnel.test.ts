import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => ({ db: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { GET as listComments, POST as addComment } from '@/app/api/offline-events/[id]/attendees/[attendeeId]/comments/route'
import { DELETE as delComment } from '@/app/api/offline-events/[id]/attendees/[attendeeId]/comments/[commentId]/route'
import { PUT as editAttendee } from '@/app/api/offline-events/[id]/attendees/[attendeeId]/route'
import { contactDue, describeMark, parseCommentBody, parseContactDate, stageAfterPayment, summarizeHistory, teamSummary } from '@/lib/event-funnel'
import { attendeeContact, telHref, type Attendee } from '@/components/events/types'
import { PATCH as callPatch } from '@/app/api/calls/[id]/attendees/[attendeeId]/route'
import { GET as callList } from '@/app/api/calls/[id]/route'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { fake } from './helpers/fake-db'

const EV = 'e1111111-1111-4111-8111-111111111111'
const OTHER_EV = 'e2222222-2222-4222-8222-222222222222'
const ALI = 'a1111111-1111-4111-8111-111111111111'

const who = (role: string, name: string) => `${SESSION_COOKIE}=${createSessionToken({ id: `u-${name}`, role, full_name: name })}`
const req = (method: string, url: string, body?: unknown, as: [string, string] = ['admin', 'Админ']) =>
  new Request(`http://test${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: who(as[0], as[1]) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
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

  it('keeps the newest note, the note count and who set the current stage', () => {
    const m = summarizeHistory([
      { attendee_id: 'a', kind: 'note', body: 'old', author_name: null, created_at: '2026-11-01T10:00:00Z' },
      { attendee_id: 'a', kind: 'note', body: 'new', author_name: 'Анвар', created_at: '2026-11-02T10:00:00Z' },
      { attendee_id: 'a', kind: 'added', body: 'new', author_name: 'Финансист', created_at: '2026-10-30T10:00:00Z' },
      { attendee_id: 'a', kind: 'stage', body: 'new>going', author_name: 'Мадина', created_at: '2026-11-03T10:00:00Z' },
      { attendee_id: 'a', kind: 'payment', body: '0>300', author_name: 'Финансист', created_at: '2026-11-04T10:00:00Z' },
      { attendee_id: 'b', body: 'only', author_name: null, created_at: '2026-11-01T10:00:00Z' },
    ])
    expect(m.get('a')?.last_comment).toMatchObject({ body: 'new', author_name: 'Анвар' })
    expect(m.get('a')?.comments_count).toBe(2)
    expect(m.get('a')?.last_mark).toMatchObject({ kind: 'stage', author_name: 'Мадина' })
    expect(m.get('b')).toMatchObject({ comments_count: 1, last_mark: null })
  })

  it('sums up who did the calling, counting each person once per outcome', () => {
    const t = teamSummary([
      { attendee_id: 'a', kind: 'stage', body: 'new>thinking', author_name: 'Анвар', created_at: '2026-11-01T10:00:00Z' },
      { attendee_id: 'a', kind: 'stage', body: 'thinking>going', author_name: 'Анвар', created_at: '2026-11-02T10:00:00Z' },
      { attendee_id: 'a', kind: 'stage', body: 'going>thinking', author_name: 'Анвар', created_at: '2026-11-03T10:00:00Z' },
      { attendee_id: 'a', kind: 'stage', body: 'thinking>going', author_name: 'Анвар', created_at: '2026-11-04T10:00:00Z' },
      { attendee_id: 'a', kind: 'note', body: 'едет', author_name: 'Анвар', created_at: '2026-11-04T10:01:00Z' },
      { attendee_id: 'b', kind: 'stage', body: 'new>declined', author_name: 'Мадина', created_at: '2026-11-02T10:00:00Z' },
      { attendee_id: 'b', kind: 'payment', body: '0>100', author_name: 'Мадина', created_at: '2026-11-02T10:00:00Z' },
      { attendee_id: 'c', kind: 'note', body: 'Из таблицы опроса', author_id: null, author_name: 'Импорт из таблицы', created_at: '2026-11-05T10:00:00Z' },
    ])
    expect(t.map(r => r.name)).toEqual(['Анвар', 'Мадина'])
    expect(t[0]).toMatchObject({ name: 'Анвар', marks: 4, notes: 1, going: 1, paid: 0, people: 1, last_at: '2026-11-04T10:01:00Z' })
    expect(t[1]).toMatchObject({ name: 'Мадина', marks: 1, declined: 1 })
  })

  it('describes actions in words', () => {
    expect(describeMark({ kind: 'stage', body: 'thinking>going' })).toBe('Думает → Поедет')
    expect(describeMark({ kind: 'added', body: 'new' })).toBe('Добавил в список · Не звонили')
    expect(describeMark({ kind: 'payment', body: '0>300' })).toBe('Оплата $0 → $300')
    expect(describeMark({ kind: 'note', body: 'привет' })).toBe('привет')
    expect(describeMark({ kind: 'hunter', body: '>Насиба' })).toBe('Назначил хантера: Насиба')
    expect(describeMark({ kind: 'hunter', body: 'Насиба>Шабо' })).toBe('Хантер: Насиба → Шабо')
    expect(describeMark({ kind: 'hunter', body: 'Насиба>' })).toBe('Убрал хантера (Насиба)')
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

  it('records who changed the stage and the payment', async () => {
    await editAttendee(req('PUT', '/x', { funnel_stage: 'going', payment_received: 300 }, ['finance', 'Финансист']), ctx({ id: EV, attendeeId: ALI }))
    expect(fake.rows('event_attendee_comments').map(r => [r.kind, r.body, r.author_name])).toEqual([
      ['stage', 'new>going', 'Финансист'],
      ['payment', '0>300', 'Финансист'],
    ])
    await editAttendee(req('PUT', '/x', { funnel_stage: 'going' }), ctx({ id: EV, attendeeId: ALI }))
    expect(fake.rows('event_attendee_comments')).toHaveLength(2)
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

  it('lets an employee delete only their own notes, never the marks', async () => {
    const p = ctx({ id: EV, attendeeId: ALI })
    const mine = (await json(await addComment(req('POST', '/x', { body: 'моё' }, ['employee', 'Анвар']), p))).body.data
    const theirs = (await json(await addComment(req('POST', '/x', { body: 'чужое' }, ['employee', 'Мадина']), p))).body.data
    fake.rows('event_attendee_comments').push({ id: 'mark-1', attendee_id: ALI, kind: 'stage', body: 'new>going', author_id: 'u-Анвар', author_name: 'Анвар', created_at: '2026-11-20T10:00:00Z' })

    const seen = (await json(await listComments(req('GET', '/x', undefined, ['employee', 'Анвар']), p))).body.data
    expect(Object.fromEntries(seen.map((c: { id: string; can_delete: boolean }) => [c.id, c.can_delete]))).toEqual({ [mine.id]: true, [theirs.id]: false, 'mark-1': false })
    expect(seen.some((c: Record<string, unknown>) => 'author_id' in c)).toBe(false)

    const del = (id: string, as: [string, string]) => delComment(req('DELETE', '/x', undefined, as), ctx({ id: EV, attendeeId: ALI, commentId: id }))
    expect((await del(theirs.id, ['employee', 'Анвар'])).status).toBe(403)
    expect((await del('mark-1', ['admin', 'Админ'])).status).toBe(403)
    expect((await del(mine.id, ['employee', 'Анвар'])).status).toBe(200)
    expect((await del(theirs.id, ['admin', 'Админ'])).status).toBe(200)
    expect(fake.rows('event_attendee_comments').map(r => r.id)).toEqual(['mark-1'])
  })

  it('refuses an empty comment and a person from another event', async () => {
    expect((await addComment(req('POST', '/x', { body: '  ' }), ctx({ id: EV, attendeeId: ALI }))).status).toBe(400)
    expect((await addComment(req('POST', '/x', { body: 'привет' }), ctx({ id: OTHER_EV, attendeeId: ALI }))).status).toBe(404)
    expect(fake.rows('event_attendee_comments')).toHaveLength(0)
  })
})

describe('/api/calls (employees, no money)', () => {
  beforeEach(() => {
    fake.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.rows('offline_events').push({ id: EV, name: 'Мастермайнд', event_date: '2026-12-12', status: 'planned' })
    fake.rows('event_attendees').push({ id: ALI, event_id: EV, attendee_type: 'guest', guest_name: 'Гость', guest_phone: '+992900000000', payment_received: 500, payment_notes: 'наличные', funnel_stage: 'new', created_at: '2026-11-01T00:00:00Z' })
  })

  it('changes only the stage and the callback date, and records who did it', async () => {
    const res = await callPatch(req('PATCH', '/x', { funnel_stage: 'thinking', next_contact_on: '2026-11-25', payment_received: 0 }, ['employee', 'Анвар']), ctx({ id: EV, attendeeId: ALI }))
    expect(res.status).toBe(200)
    expect(fake.rows('event_attendees')[0]).toMatchObject({ funnel_stage: 'thinking', next_contact_on: '2026-11-25', payment_received: 500 })
    expect(fake.rows('event_attendee_comments')).toEqual([expect.objectContaining({ kind: 'stage', body: 'new>thinking', author_name: 'Анвар' })])
    expect((await callPatch(req('PATCH', '/x', { payment_received: 0 }, ['employee', 'Анвар']), ctx({ id: EV, attendeeId: ALI }))).status).toBe(400)
  })

  it('shows people without money; the team summary only to admin and finance', async () => {
    fake.rows('event_attendee_comments').push({ id: 'c1', attendee_id: ALI, kind: 'stage', body: 'new>going', author_name: 'Анвар', created_at: '2026-11-20T10:00:00Z' })
    const asEmployee = (await json(await callList(req('GET', '/x', undefined, ['employee', 'Анвар']), ctx({ id: EV })))).body
    expect(asEmployee.data[0]).toMatchObject({ guest_name: 'Гость', guest_phone: '+992900000000', funnel_stage: 'new', last_mark: { author_name: 'Анвар' } })
    expect(asEmployee.data[0]).not.toHaveProperty('payment_received')
    expect(asEmployee.data[0]).not.toHaveProperty('payment_notes')
    expect(asEmployee.team).toBeUndefined()
    const asFinance = (await json(await callList(req('GET', '/x', undefined, ['finance', 'Финансист']), ctx({ id: EV })))).body
    expect(asFinance.team).toEqual([expect.objectContaining({ name: 'Анвар', marks: 1, going: 1 })])
  })

  it('sets a hunter from the staff only and records the change', async () => {
    fake.rows('app_users').push(
      { id: 'u-nasiba', full_name: 'Насиба', role: 'wheels_manager' },
      { id: 'u-shabo', full_name: 'Шабо', role: 'employee' },
      { id: 'u-part', full_name: 'Участник', role: 'participant' }
    )
    const p = ctx({ id: EV, attendeeId: ALI })
    expect((await callPatch(req('PATCH', '/x', { hunter_id: 'u-part' }, ['employee', 'Анвар']), p)).status).toBe(400)
    expect((await callPatch(req('PATCH', '/x', { hunter_id: 'u-nasiba' }, ['employee', 'Анвар']), p)).status).toBe(200)
    await callPatch(req('PATCH', '/x', { hunter_id: 'u-shabo' }, ['employee', 'Анвар']), p)
    await callPatch(req('PATCH', '/x', { hunter_id: null }, ['employee', 'Анвар']), p)
    expect(fake.rows('event_attendees')[0].hunter_id).toBeNull()
    expect(fake.rows('event_attendee_comments').map(r => [r.kind, r.body])).toEqual([
      ['hunter', '>Насиба'],
      ['hunter', 'Насиба>Шабо'],
      ['hunter', 'Шабо>'],
    ])

    await callPatch(req('PATCH', '/x', { hunter_id: 'u-nasiba' }, ['employee', 'Анвар']), p)
    const list = (await json(await callList(req('GET', '/x', undefined, ['employee', 'Анвар']), ctx({ id: EV })))).body
    expect(list.data[0]).toMatchObject({ hunter_id: 'u-nasiba', hunter_name: 'Насиба' })
    expect(list.staff.map((s: { name: string }) => s.name)).toEqual(['Насиба', 'Шабо'])
    expect(list.me).toBe('u-Анвар')
  })
})
