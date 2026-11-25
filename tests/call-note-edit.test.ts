import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => ({ db: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { PATCH as editNote } from '@/app/api/calls/[id]/attendees/[attendeeId]/comments/[commentId]/route'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { fake } from './helpers/fake-db'

const EV = 'e1111111-1111-4111-8111-111111111111'
const ALI = 'a1111111-1111-4111-8111-111111111111'
const as = (role: string, name: string) => `${SESSION_COOKIE}=${createSessionToken({ id: `u-${name}`, role, full_name: name })}`
const edit = (commentId: string, body: unknown, who: [string, string]) =>
  editNote(new Request('http://test/x', { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: as(...who) }, body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: EV, attendeeId: ALI, commentId }),
  })

describe('editing a call note', () => {
  beforeEach(() => {
    fake.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.rows('app_users').push(
      { id: 'u-Шабо', full_name: 'Шабо', role: 'employee', crm_access: true },
      { id: 'u-Насиба', full_name: 'Насиба', role: 'wheels_manager', crm_access: true }
    )
    fake.rows('event_attendees').push({ id: ALI, event_id: EV, attendee_type: 'guest', guest_name: 'Абдулатиф', funnel_stage: 'thinking' })
    fake.rows('event_attendee_comments').push(
      { id: 'n1', attendee_id: ALI, kind: 'note', body: 'тправили программу', author_id: 'u-Шабо', author_name: 'Шабо', created_at: '2026-11-25T11:20:00Z' },
      { id: 'm1', attendee_id: ALI, kind: 'stage', body: 'new>thinking', author_id: 'u-Шабо', author_name: 'Шабо', created_at: '2026-11-25T10:29:00Z' }
    )
  })

  it('lets the author correct the text and marks it edited', async () => {
    const res = await edit('n1', { body: ' Отправили программу на WhatsApp ' }, ['employee', 'Шабо'])
    expect(res.status).toBe(200)
    expect(fake.rows('event_attendee_comments')[0]).toMatchObject({ body: 'Отправили программу на WhatsApp', edited_at: expect.any(String) })
  })

  it('refuses someone else’s note, an empty text and stage marks; admin may edit', async () => {
    expect((await edit('n1', { body: 'чужое' }, ['wheels_manager', 'Насиба'])).status).toBe(403)
    expect((await edit('n1', { body: '  ' }, ['employee', 'Шабо'])).status).toBe(400)
    expect((await edit('m1', { body: 'new>going' }, ['employee', 'Шабо'])).status).toBe(403)
    expect(fake.rows('event_attendee_comments')[0].body).toBe('тправили программу')
    expect((await edit('n1', { body: 'Исправил админ' }, ['admin', 'Админ'])).status).toBe(200)
  })
})
