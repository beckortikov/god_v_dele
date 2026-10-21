import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-client', async () => ({ supabaseAdmin: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'
process.env.TELEGRAM_BOT_TOKEN = '123:test'
process.env.TELEGRAM_BOT_USERNAME = 'GvdBot'

import { GET as status, POST as start } from '@/app/api/auth/telegram/route'
import { POST as poll } from '@/app/api/auth/telegram/poll/route'
import { supabaseLoginStore } from '@/app/api/telegram/_lib/login-store'
import { handleUpdate, LOGIN_TEXT, type SendExtra, type TelegramLink, type TelegramStore, type TgUpdate } from '@/lib/telegram'
import { LOGIN_START_LIMIT, describeDevice } from '@/lib/telegram-login'
import { isPublic } from '@/lib/auth-policy'
import { SESSION_COOKIE, readSessionToken } from '@/lib/session'
import { fake } from './helpers/fake-db'

const PID = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const TG = 555
const EVIL_TG = 666

const link = (tg: number, subject: string): TelegramLink =>
  ({ id: `l-${tg}`, subject_type: 'participant', subject_id: subject, telegram_user_id: tg, chat_id: tg, unlinked_at: null, phone_verified: true }) as TelegramLink

const subjects = [
  { type: 'participant' as const, id: PID, name: 'Алиев Азамат', phone: null, programName: 'Год в деле 2' },
  { type: 'participant' as const, id: OTHER, name: 'Бобоев', phone: null, programName: null },
]
let links: TelegramLink[]
const store = {
  getSubject: async (t: string, id: string) => subjects.find(s => s.type === t && s.id === id) ?? null,
  getActiveLinkByTelegramUser: async (id: number) => links.find(l => l.telegram_user_id === id && !l.unlinked_at) ?? null,
} as unknown as TelegramStore

let sent: { chatId: number; text: string; extra?: SendExtra }[]
const deps = () => ({
  store,
  login: supabaseLoginStore,
  send: async (chatId: number, text: string, extra?: SendExtra) => void sent.push({ chatId, text, extra }),
  answer: async () => {},
})

const req = (url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://test${url}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': 'Mozilla/5.0 (iPhone) Safari/605', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })

const begin = async () => (await start(req('/api/auth/telegram', {}))).json() as Promise<{ token: string; secret: string; url: string }>
const message = (from: number, text: string): TgUpdate => ({ update_id: Math.random(), message: { message_id: 1, chat: { id: from, type: 'private' }, from: { id: from }, text } })
const press = (from: number, data: string): TgUpdate => ({ update_id: Math.random(), callback_query: { id: 'cb', from: { id: from }, data, message: { message_id: 2, chat: { id: from, type: 'private' } } } })
const pollAs = (token: string, secret: string) => poll(req('/api/auth/telegram/poll', { token, secret }))

beforeEach(() => {
  fake.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  links = [link(TG, PID), link(EVIL_TG, OTHER)]
  sent = []
  fake.rows('app_users').push({ id: 'u1', username: 'azamat', role: 'participant', full_name: 'Алиев Азамат', participant_id: PID, employee_id: null })
})

describe('sign-in through Telegram', () => {
  it('is public (the person has no session yet)', () => {
    expect(isPublic('/api/auth/telegram')).toBe(true)
    expect(isPublic('/api/auth/telegram/poll')).toBe(true)
  })

  it('is offered only when the table exists', async () => {
    expect(await (await status()).json()).toEqual({ enabled: true })
    fake.missing.set('telegram_logins', { code: '42P01', message: 'relation "telegram_logins" does not exist' })
    expect(await (await status()).json()).toEqual({ enabled: false })
    expect((await start(req('/api/auth/telegram', {}))).status).toBe(503)
  })

  it('start gives a link to the bot with a token and keeps only the hash of the secret', async () => {
    const a = await begin()
    expect(a.url).toBe(`https://t.me/GvdBot?start=login_${a.token}`)
    const row = fake.rows('telegram_logins')[0]
    expect(row.secret_hash).not.toContain(a.secret)
    expect(row.device).toBe('Safari, iPhone')
  })

  it('the whole way: bot asks, the person confirms, the browser gets the session once', async () => {
    const a = await begin()
    expect((await (await pollAs(a.token, a.secret)).json()).status).toBe('pending')

    await handleUpdate(message(TG, `/start login_${a.token}`), deps())
    expect(sent.at(-1)?.text).toContain('Алиев Азамат')
    expect(sent.at(-1)?.text).toContain('Safari, iPhone')
    expect((await (await pollAs(a.token, a.secret)).json()).status).toBe('pending') // asked, not yet confirmed

    expect(await handleUpdate(press(TG, `lok:${a.token}`), deps())).toBe('login_approved')
    const res = await pollAs(a.token, a.secret)
    const body = await res.json()
    expect(body).toMatchObject({ success: true, user: { username: 'azamat', role: 'participant', participant_id: PID } })
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(readSessionToken(cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1])).toMatchObject({ uid: 'u1', role: 'participant', pid: PID })

    expect((await (await pollAs(a.token, a.secret)).json()).status).toBe('expired') // only once
  })

  it('a wrong secret never gets the session, even after the person confirmed', async () => {
    const a = await begin()
    await handleUpdate(press(TG, `lok:${a.token}`), deps())
    const res = await pollAs(a.token, 'guess')
    expect((await res.json()).status).toBe('expired')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect((await (await pollAs(a.token, a.secret)).json()).success).toBe(true)
  })

  it('a Telegram that is not linked cannot start or confirm a sign-in', async () => {
    const a = await begin()
    expect(await handleUpdate(message(999, `/start login_${a.token}`), deps())).toBe('login_not_linked')
    expect(sent.at(-1)?.text).toBe(LOGIN_TEXT.notLinked)
    await handleUpdate(press(999, `lok:${a.token}`), deps())
    expect((await (await pollAs(a.token, a.secret)).json()).status).toBe('pending')
  })

  it('the person without a login on the platform is told so', async () => {
    const a = await begin()
    expect(await handleUpdate(message(EVIL_TG, `/start login_${a.token}`), deps())).toBe('login_no_account')
  })

  it('«Нет, это не я» cancels it for good', async () => {
    const a = await begin()
    expect(await handleUpdate(press(TG, `lno:${a.token}`), deps())).toBe('login_denied')
    expect((await (await pollAs(a.token, a.secret)).json()).status).toBe('denied')
    expect(await handleUpdate(press(TG, `lok:${a.token}`), deps())).toBe('login_expired')
    expect((await (await pollAs(a.token, a.secret)).json()).status).toBe('denied')
  })

  it('an unlinked Telegram (/stop) cannot sign in any more', async () => {
    links[0].unlinked_at = new Date().toISOString()
    const a = await begin()
    expect(await handleUpdate(message(TG, `/start login_${a.token}`), deps())).toBe('login_not_linked')
  })

  it('an old request does nothing', async () => {
    const a = await begin()
    fake.rows('telegram_logins')[0].expires_at = new Date(Date.now() - 1000).toISOString()
    expect(await handleUpdate(message(TG, `/start login_${a.token}`), deps())).toBe('login_expired')
    expect(await handleUpdate(press(TG, `lok:${a.token}`), deps())).toBe('login_expired')
    expect((await (await pollAs(a.token, a.secret)).json()).status).toBe('expired')
  })

  it('an unknown token and garbage are refused quietly', async () => {
    expect(await handleUpdate(message(TG, '/start login_nope'), deps())).toBe('login_expired')
    expect((await (await pollAs('x', 'y')).json()).status).toBe('expired')
    expect((await poll(req('/api/auth/telegram/poll', 'text'))).status).toBe(200)
  })

  it('limits how many sign-ins one address can start', async () => {
    for (let i = 0; i < LOGIN_START_LIMIT; i++) expect((await start(req('/api/auth/telegram', {}, { 'x-forwarded-for': '1.2.3.4' }))).status).toBe(200)
    expect((await start(req('/api/auth/telegram', {}, { 'x-forwarded-for': '1.2.3.4' }))).status).toBe(429)
    expect((await start(req('/api/auth/telegram', {}, { 'x-forwarded-for': '5.6.7.8' }))).status).toBe(200)
  })
})

describe('describeDevice', () => {
  it('names the browser and the system', () => {
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537')).toBe('Chrome, Windows')
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537')).toBe('Chrome, Android')
    expect(describeDevice('')).toBe('неизвестное устройство')
  })
})
