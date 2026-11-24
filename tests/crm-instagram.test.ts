import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => ({ db: (await import('./helpers/fake-db')).fakeAdmin }))
vi.mock('@/lib/zernio', async () => {
  const actual = await vi.importActual<typeof import('@/lib/zernio')>('@/lib/zernio')
  return {
    ...actual,
    instagramAccount: vi.fn(async () => ({ id: 'acc1', profileId: 'p1', username: 'god_v_dele' })),
    listConversations: vi.fn(async () => ({
      items: [
        { id: 'c1', participantId: 'ig-alina', name: 'Алина', username: 'alina', picture: null, lastMessage: 'Сколько стоит?', updatedTime: '2026-11-23T10:00:00Z', unread: 1, url: null },
        { id: 'c2', participantId: 'ig-marat', name: 'Марат', username: 'marat', picture: null, lastMessage: 'Спасибо', updatedTime: '2026-11-22T10:00:00Z', unread: 0, url: null },
      ],
      nextCursor: null,
    })),
    sendMessage: vi.fn(async () => ({})),
    replyComment: vi.fn(async () => ({})),
    privateReply: vi.fn(async () => ({})),
    attachmentUrl: vi.fn(async () => 'https://evil.example.com/x.mp4'),
  }
})
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { igFunnel, phoneFromMessages, splitInstagramName, stageAfterReply } from '@/lib/crm-instagram'
import { GET as media } from '@/app/api/crm/instagram/media/route'
import { parseProfile } from '@/lib/participant-profile'
import * as zernio from '@/lib/zernio'
import { GET as listConvs } from '@/app/api/crm/instagram/conversations/route'
import { POST as sendDm } from '@/app/api/crm/instagram/conversations/[id]/messages/route'
import { POST as replyToComment } from '@/app/api/crm/instagram/comments/[postId]/route'
import { PATCH as patchContact } from '@/app/api/crm/instagram/contacts/[igId]/route'
import { POST as addToBase } from '@/app/api/crm/instagram/contacts/[igId]/base/route'
import { GET as igFunnelRoute } from '@/app/api/crm/instagram/funnel/route'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { fake } from './helpers/fake-db'

const EV = 'e1111111-1111-4111-8111-111111111111'
const GUEST = 'g1111111-1111-4111-8111-111111111111'

const who = (role: string, name: string) => `${SESSION_COOKIE}=${createSessionToken({ id: `u-${name}`, role, full_name: name })}`
const req = (method: string, body?: unknown, as: [string, string] = ['employee', 'Насиба']) =>
  new Request('http://test/x', { method, headers: { 'Content-Type': 'application/json', cookie: who(as[0], as[1]) }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })
const json = async (res: Response) => ({ status: res.status, body: await res.json() })

describe('instagram funnel helpers', () => {
  it('counts steps cumulatively and who is in the base', () => {
    const f = igFunnel([
      { stage: 'new', inBase: false },
      { stage: null, inBase: false },
      { stage: 'talk', inBase: false },
      { stage: 'mm', inBase: true },
      { stage: 'member', inBase: true },
    ])
    expect(f.total).toBe(5)
    expect(f.inBase).toBe(2)
    expect(f.steps.map(s => s.count)).toEqual([5, 3, 2, 1, 1])
    expect(f.current.new).toBe(2)
  })

  it('splits «Имя | чем занимается» from an Instagram name', () => {
    expect(splitInstagramName('Фотех Юсуфзода | Товарный бизнес бо инстаграм 🚀')).toEqual({ name: 'Фотех Юсуфзода', activity: 'Товарный бизнес бо инстаграм' })
    expect(splitInstagramName('shabo.13')).toEqual({ name: 'shabo.13', activity: '' })
    expect(splitInstagramName('Анна — кондитер')).toEqual({ name: 'Анна', activity: 'кондитер' })
  })

  it('finds the phone number the person typed, not ours and not short numbers', () => {
    expect(phoneFromMessages([{ text: 'Алейкум салам', outgoing: false }, { text: '906666683', outgoing: false }, { text: 'Спасибо!', outgoing: true }])).toBe('906666683')
    expect(phoneFromMessages([{ text: 'мой номер +992 93 010-50-01, звоните', outgoing: false }])).toBe('+992 93 010-50-01')
    expect(phoneFromMessages([{ text: 'Звоните +992930105001', outgoing: true }, { text: 'мне 35 лет, бизнес 2024', outgoing: false }])).toBe('')
  })

  it('profile accepts where they came from, Instagram and a rough monthly turnover', () => {
    expect(parseProfile({ source: ' Реклама ', instagram: '@shabo.13', monthly_turnover: '50 000' })).toEqual({ source: 'Реклама', instagram: 'shabo.13', monthly_turnover: 50000 })
    expect(parseProfile({ instagram: 'https://instagram.com/god_v_dele/' }).instagram).toBe('god_v_dele')
    expect(() => parseProfile({ monthly_turnover: '-5' })).toThrow()
  })

  it('a first reply moves a new client to «В диалоге», later stages stay', () => {
    expect(stageAfterReply(undefined)).toBe('talk')
    expect(stageAfterReply('new')).toBe('talk')
    expect(stageAfterReply('pay')).toBe('pay')
  })
})

describe('/api/crm/instagram', () => {
  beforeEach(() => {
    fake.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.rows('app_users').push(
      { id: 'u-Насиба', full_name: 'Насиба', role: 'wheels_manager', crm_access: true },
      { id: 'u-Без', full_name: 'Без доступа', role: 'employee', crm_access: false }
    )
    fake.rows('programs').push({ id: 'p-main', name: 'Год в деле · поток 6' }, { id: GUEST, name: 'Гостевой' })
    fake.rows('offline_events').push({ id: EV, name: 'Мастермайнд', event_date: '2026-12-12', status: 'planned' })
  })

  it('needs «Доступ к CRM»', async () => {
    expect((await listConvs(req('GET', undefined, ['employee', 'Без']))).status).toBe(403)
    expect((await addToBase(req('POST', { name: 'Алина' }, ['employee', 'Без']), ctx({ igId: 'ig-alina' }))).status).toBe(403)
    expect(fake.rows('participants')).toHaveLength(0)
  })

  it('lists conversations with their CRM cards', async () => {
    fake.rows('crm_instagram_contacts').push({ ig_user_id: 'ig-alina', stage: 'talk', note: 'звонить вечером', participant_id: null })
    const r = (await json(await listConvs(req('GET')))).body
    expect(r.account.username).toBe('god_v_dele')
    expect(r.items.map((c: any) => [c.name, c.contact?.stage ?? null])).toEqual([
      ['Алина', 'talk'],
      ['Марат', null],
    ])
  })

  it('a reply in direct creates the card and moves a new client to «В диалоге»', async () => {
    const res = await sendDm(req('POST', { text: '  Здравствуйте!  ', participantId: 'ig-marat', username: 'marat', name: 'Марат' }), ctx({ id: 'c2' }))
    expect(res.status).toBe(201)
    expect(zernio.sendMessage).toHaveBeenCalledWith('c2', 'Здравствуйте!')
    expect(fake.rows('crm_instagram_contacts')).toEqual([expect.objectContaining({ ig_user_id: 'ig-marat', stage: 'talk', username: 'marat', source: 'dm' })])
    expect((await sendDm(req('POST', { text: '   ' }), ctx({ id: 'c2' }))).status).toBe(400)
  })

  it('answers a comment under the post or in direct', async () => {
    await replyToComment(req('POST', { commentId: 'cm1', text: 'Ответили в директ', mode: 'public', authorId: 'ig-zarina', username: 'zarina' }), ctx({ postId: 'post1' }))
    expect(zernio.replyComment).toHaveBeenCalledWith('post1', 'cm1', 'Ответили в директ')
    await replyToComment(req('POST', { commentId: 'cm1', text: 'Привет!', mode: 'private', authorId: 'ig-zarina' }), ctx({ postId: 'post1' }))
    expect(zernio.privateReply).toHaveBeenCalledWith('post1', 'cm1', 'Привет!')
    expect(fake.rows('crm_instagram_contacts')[0]).toMatchObject({ ig_user_id: 'ig-zarina', stage: 'talk', source: 'comment' })
    expect((await replyToComment(req('POST', { text: 'x' }), ctx({ postId: 'post1' }))).status).toBe(400)
  })

  it('saves the stage and the note, refusing unknown stages', async () => {
    const p = ctx({ igId: 'ig-alina' })
    expect((await patchContact(req('PATCH', { stage: 'mm', note: ' пришла с рекламы ' }), p)).status).toBe(200)
    expect(fake.rows('crm_instagram_contacts')[0]).toMatchObject({ stage: 'mm', note: 'пришла с рекламы' })
    expect((await patchContact(req('PATCH', { stage: 'vip' }), p)).status).toBe(400)
  })

  it('«Завести в базу»: a guest participant once, and a guest of the event with the caller as hunter', async () => {
    const p = ctx({ igId: 'ig-alina' })
    const first = await json(await addToBase(req('POST', { name: 'Алина Каримова', phone: '+992 90 000 00 00', event_id: EV, username: 'alina' }), p))
    expect(first.status).toBe(201)
    expect(fake.rows('participants')).toEqual([expect.objectContaining({ name: 'Алина Каримова', program_id: GUEST, status: 'active' })])
    const participantId = fake.rows('participants')[0].id
    expect(fake.rows('crm_instagram_contacts')[0]).toMatchObject({ participant_id: participantId })
    expect(fake.rows('event_attendees')).toEqual([
      expect.objectContaining({ event_id: EV, attendee_type: 'guest', participant_id: participantId, guest_name: 'Алина Каримова', funnel_stage: 'new', hunter_id: 'u-Насиба' }),
    ])
    expect(fake.rows('event_attendee_comments')).toEqual([expect.objectContaining({ kind: 'added', body: 'new', author_name: 'Насиба' })])
    expect(fake.rows('participant_profiles')).toEqual([expect.objectContaining({ participant_id: participantId, instagram: 'alina' })])

    // again: no second participant and no second invitation
    await addToBase(req('POST', { name: 'Алина Каримова', event_id: EV }), p)
    expect(fake.rows('participants')).toHaveLength(1)
    expect(fake.rows('event_attendees')).toHaveLength(1)
  })

  it('«Завести в базу» puts what is known about the business into the profile, refusing a bad turnover first', async () => {
    const bad = await addToBase(req('POST', { name: 'Фотех', profile: { monthly_turnover: 'много' } }), ctx({ igId: 'ig-foteh' }))
    expect(bad.status).toBe(400)
    expect(fake.rows('participants')).toHaveLength(0)
    await addToBase(
      req('POST', { name: 'Фотех Юсуфзода', username: 'fotehlife', profile: { city: 'Душанбе', source: 'Instagram — директ', activity: 'Товарный бизнес', business_name: '', monthly_turnover: '120000', currency: 'TJS' } }),
      ctx({ igId: 'ig-foteh' })
    )
    expect(fake.rows('participant_profiles')[0]).toMatchObject({
      city: 'Душанбе',
      source: 'Instagram — директ',
      activity: 'Товарный бизнес',
      instagram: 'fotehlife',
      monthly_turnover: 120000,
      currency: 'TJS',
      updated_by: 'Насиба',
    })
    expect(fake.rows('participant_profiles')[0]).not.toHaveProperty('business_name')
  })

  it('media is fetched only from Instagram and Meta servers', async () => {
    const r = await media(new Request('http://test/x?c=c1&m=m1&i=0', { headers: { cookie: who('employee', 'Насиба') } }))
    expect(r.status).toBe(404)
    const r2 = await media(new Request(`http://test/x?u=${encodeURIComponent('http://169.254.169.254/latest')}`, { headers: { cookie: who('employee', 'Насиба') } }))
    expect(r2.status).toBe(404)
    expect((await media(new Request('http://test/x', { headers: { cookie: who('employee', 'Насиба') } }))).status).toBe(400)
  })

  it('«Завести в базу» needs a name and the «Гостевой» program', async () => {
    expect((await addToBase(req('POST', { name: ' ' }), ctx({ igId: 'ig-x' }))).status).toBe(400)
    fake.tables.programs = [{ id: 'p-main', name: 'Год в деле · поток 6' }]
    expect((await addToBase(req('POST', { name: 'Кто-то' }), ctx({ igId: 'ig-x' }))).status).toBe(409)
    expect(fake.rows('participants')).toHaveLength(0)
  })

  it('the funnel counts everyone who wrote plus cards from comments', async () => {
    fake.rows('crm_instagram_contacts').push(
      { ig_user_id: 'ig-alina', stage: 'pay', participant_id: 'x' },
      { ig_user_id: 'ig-zarina', stage: 'talk', participant_id: null }
    )
    const f = (await json(await igFunnelRoute(req('GET')))).body
    expect(f.total).toBe(3)
    expect(f.inBase).toBe(1)
    expect(f.steps.map((s: any) => s.count)).toEqual([3, 2, 1, 1, 0])
  })
})
