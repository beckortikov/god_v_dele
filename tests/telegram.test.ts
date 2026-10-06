import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOT_TEXT,
  PHONE_KEYBOARD,
  buildDeepLink,
  generateCode,
  handleUpdate,
  isTelegramConfigured,
  isValidCode,
  normalizePhone,
  parseCommand,
  phoneForWhatsApp,
  phonesMatch,
  type LinkSubject,
  type NewLinkInput,
  type SendExtra,
  type TelegramLink,
  type TelegramLinkCode,
  type TelegramStore,
  type TgMessage,
  type TgUpdate,
} from '@/lib/telegram'

// ---------------------------------------------------------------------------
// In-memory store that mimics the database, including the partial unique
// indexes (one active link per Telegram user and per subject).
// ---------------------------------------------------------------------------

function createMemoryStore(subjects: LinkSubject[]) {
  const codes = new Map<string, TelegramLinkCode>()
  const links: TelegramLink[] = []
  let seq = 0

  const store: TelegramStore = {
    async getCode(code) {
      return codes.get(code) ?? null
    },
    async claimCode(code, telegramUserId, at) {
      const row = codes.get(code)
      if (!row || row.used_at) return false
      row.used_at = at.toISOString()
      row.used_by_telegram_user_id = telegramUserId
      return true
    },
    async getSubject(type, id) {
      return subjects.find(s => s.type === type && s.id === id) ?? null
    },
    async getActiveLinkByTelegramUser(id) {
      return links.find(l => l.telegram_user_id === id && !l.unlinked_at) ?? null
    },
    async getActiveLinkBySubject(type, id) {
      return links.find(l => l.subject_type === type && l.subject_id === id && !l.unlinked_at) ?? null
    },
    async getLastSharedPhone(id) {
      const withPhone = links.filter(l => l.telegram_user_id === id && l.phone)
      return withPhone.at(-1)?.phone ?? null
    },
    async createLink(input: NewLinkInput) {
      if (links.some(l => !l.unlinked_at && l.telegram_user_id === input.telegram_user_id)) throw new Error('unique: user')
      if (links.some(l => !l.unlinked_at && l.subject_type === input.subject_type && l.subject_id === input.subject_id))
        throw new Error('unique: subject')
      const link: TelegramLink = {
        id: `link-${++seq}`,
        notify: true,
        linked_at: new Date().toISOString(),
        unlinked_at: null,
        unlink_reason: null,
        replaced_by: null,
        ...input,
      }
      links.push(link)
      return link
    },
    async updateLink(id, patch) {
      const l = links.find(x => x.id === id)
      if (l) Object.assign(l, patch)
    },
  }

  const addCode = (code: string, subjectId: string, opts: Partial<TelegramLinkCode> = {}) => {
    codes.set(code, {
      code,
      subject_type: 'participant',
      subject_id: subjectId,
      created_at: new Date(NOW.getTime() - 60_000).toISOString(),
      expires_at: new Date(NOW.getTime() + 7 * 86_400_000).toISOString(),
      used_at: null,
      used_by_telegram_user_id: null,
      created_by: 'test',
      ...opts,
    })
  }

  return { store, codes, links, addCode }
}

const NOW = new Date('2026-10-06T10:00:00Z')

const ALI: LinkSubject = { type: 'participant', id: 'p-ali', name: 'Алиев Али', phone: '+992 90 123 45 67', programName: 'Год в деле 7' }
const BOBO: LinkSubject = { type: 'participant', id: 'p-bobo', name: 'Бобоев Бобо', phone: '93 555 44 33', programName: null }
const NOPHONE: LinkSubject = { type: 'participant', id: 'p-nophone', name: 'Без Телефона', phone: null, programName: 'Год в деле 7' }

const USER_1 = { id: 1001, first_name: 'Ali', username: 'ali_tj', language_code: 'ru' }
const USER_2 = { id: 2002, first_name: 'Other' }

let updateId = 1
function msg(from: { id: number; first_name?: string; username?: string }, extra: Partial<TgMessage>): TgUpdate {
  return {
    update_id: updateId++,
    message: { message_id: updateId, from, chat: { id: from.id, type: 'private' }, ...extra },
  }
}

function setup() {
  const mem = createMemoryStore([ALI, BOBO, NOPHONE])
  const sent: { chatId: number; text: string; extra?: SendExtra }[] = []
  const send = vi.fn(async (chatId: number, text: string, extra?: SendExtra) => {
    sent.push({ chatId, text, extra })
  })
  const deps = { store: mem.store, send, now: () => NOW }
  return { ...mem, sent, send, deps }
}

// ---------------------------------------------------------------------------

describe('helpers', () => {
  it('normalizePhone keeps digits only', () => {
    expect(normalizePhone('+992 (90) 123-45-67')).toBe('992901234567')
    expect(normalizePhone(null)).toBe('')
  })

  it('phonesMatch compares the last 9 digits', () => {
    expect(phonesMatch('+992 90 123 45 67', '992901234567')).toBe(true)
    expect(phonesMatch('901234567', '+992901234567')).toBe(true)
    expect(phonesMatch('8 901234567', '992 901234567')).toBe(true)
    expect(phonesMatch('+992 90 123 45 67', '+992 90 123 45 68')).toBe(false)
    expect(phonesMatch('12345', '12345')).toBe(false)
    expect(phonesMatch(null, '901234567')).toBe(false)
  })

  it('phoneForWhatsApp adds 992 to local numbers', () => {
    expect(phoneForWhatsApp('90 123 45 67')).toBe('992901234567')
    expect(phoneForWhatsApp('+992 90 123 45 67')).toBe('992901234567')
    expect(phoneForWhatsApp('')).toBe('')
  })

  it('generateCode makes unguessable URL-safe codes', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateCode()))
    expect(codes.size).toBe(500)
    for (const c of codes) {
      expect(c).toHaveLength(10)
      expect(isValidCode(c)).toBe(true)
    }
  })

  it('isValidCode rejects junk', () => {
    expect(isValidCode('short')).toBe(false)
    expect(isValidCode('has space!!')).toBe(false)
    expect(isValidCode('abcDEF_-12')).toBe(true)
  })

  it('parseCommand handles arguments and @bot suffix', () => {
    expect(parseCommand('/start abc123')).toEqual({ command: 'start', arg: 'abc123' })
    expect(parseCommand('/start@GodVDeleBot abc123')).toEqual({ command: 'start', arg: 'abc123' })
    expect(parseCommand('/stop')).toEqual({ command: 'stop', arg: '' })
    expect(parseCommand('hello')).toBeNull()
    expect(parseCommand(undefined)).toBeNull()
  })

  describe('configuration', () => {
    const env = { ...process.env }
    afterEach(() => {
      process.env = { ...env }
    })

    it('is not configured without the token', () => {
      delete process.env.TELEGRAM_BOT_TOKEN
      process.env.TELEGRAM_BOT_USERNAME = 'GodVDeleBot'
      expect(isTelegramConfigured()).toBe(false)
    })

    it('is configured with the token and username; builds the deep link', () => {
      process.env.TELEGRAM_BOT_TOKEN = '123:abc'
      process.env.TELEGRAM_BOT_USERNAME = '@GodVDeleBot'
      expect(isTelegramConfigured()).toBe(true)
      expect(buildDeepLink('abcDEF_-12')).toBe('https://t.me/GodVDeleBot?start=abcDEF_-12')
    })
  })
})

describe('handleUpdate: /start with a code', () => {
  let t: ReturnType<typeof setup>
  beforeEach(() => {
    t = setup()
  })

  it('links the participant, marks the code used and asks for the phone', async () => {
    t.addCode('CODE_ali_1', ALI.id)
    const result = await handleUpdate(msg(USER_1, { text: '/start CODE_ali_1' }), t.deps)

    expect(result).toBe('linked')
    expect(t.codes.get('CODE_ali_1')?.used_at).toBe(NOW.toISOString())
    expect(t.codes.get('CODE_ali_1')?.used_by_telegram_user_id).toBe(USER_1.id)
    expect(t.links).toHaveLength(1)
    expect(t.links[0]).toMatchObject({
      subject_id: ALI.id,
      telegram_user_id: USER_1.id,
      chat_id: USER_1.id,
      username: 'ali_tj',
      phone_verified: false,
      linked_via_code: 'CODE_ali_1',
    })
    expect(t.sent[0].text).toContain('Готово! Вы привязаны как Алиев Али, программа «Год в деле 7»')
    expect(t.sent[1].text).toBe(BOT_TEXT.askPhone)
    expect(t.sent[1].extra?.reply_markup).toEqual(PHONE_KEYBOARD)
  })

  it('rejects an unknown code', async () => {
    expect(await handleUpdate(msg(USER_1, { text: '/start nosuchcode1' }), t.deps)).toBe('code_invalid')
    expect(t.sent[0].text).toBe(BOT_TEXT.codeInvalid)
    expect(t.links).toHaveLength(0)
  })

  it('rejects a malformed code without hitting storage', async () => {
    const spy = vi.spyOn(t.store, 'getCode')
    expect(await handleUpdate(msg(USER_1, { text: '/start <script>' }), t.deps)).toBe('code_invalid')
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects an expired code', async () => {
    t.addCode('CODE_old_01', ALI.id, { expires_at: new Date(NOW.getTime() - 1000).toISOString() })
    expect(await handleUpdate(msg(USER_1, { text: '/start CODE_old_01' }), t.deps)).toBe('code_expired')
    expect(t.sent[0].text).toBe(BOT_TEXT.codeExpired)
    expect(t.codes.get('CODE_old_01')?.used_at).toBeNull()
  })

  it('rejects a code used by someone else', async () => {
    t.addCode('CODE_ali_1', ALI.id)
    await handleUpdate(msg(USER_1, { text: '/start CODE_ali_1' }), t.deps)
    t.sent.length = 0
    expect(await handleUpdate(msg(USER_2, { text: '/start CODE_ali_1' }), t.deps)).toBe('code_used')
    expect(t.sent[0].text).toBe(BOT_TEXT.codeUsed)
    expect(t.links.filter(l => !l.unlinked_at)).toHaveLength(1)
    expect(t.links[0].telegram_user_id).toBe(USER_1.id)
  })

  it('is idempotent when Telegram redelivers the same /start', async () => {
    t.addCode('CODE_ali_1', ALI.id)
    const update = msg(USER_1, { text: '/start CODE_ali_1' })
    await handleUpdate(update, t.deps)
    expect(await handleUpdate(update, t.deps)).toBe('already_linked')
    expect(t.links).toHaveLength(1)
  })

  it('reports a missing participant', async () => {
    t.addCode('CODE_gone_1', 'p-deleted')
    expect(await handleUpdate(msg(USER_1, { text: '/start CODE_gone_1' }), t.deps)).toBe('subject_missing')
    expect(t.links).toHaveLength(0)
  })

  it('moves a Telegram account linked to someone else', async () => {
    t.addCode('CODE_ali_1', ALI.id)
    t.addCode('CODE_bobo1', BOBO.id)
    await handleUpdate(msg(USER_1, { text: '/start CODE_ali_1' }), t.deps)
    expect(await handleUpdate(msg(USER_1, { text: '/start CODE_bobo1' }), t.deps)).toBe('linked')

    const [old, current] = t.links
    expect(old).toMatchObject({ subject_id: ALI.id, unlink_reason: 'moved', unlinked_at: NOW.toISOString(), replaced_by: current.id })
    expect(current).toMatchObject({ subject_id: BOBO.id, telegram_user_id: USER_1.id, unlinked_at: null })
  })

  it('replaces the previous Telegram account of the same participant and tells it', async () => {
    t.addCode('CODE_ali_1', ALI.id)
    t.addCode('CODE_ali_2', ALI.id)
    await handleUpdate(msg(USER_1, { text: '/start CODE_ali_1' }), t.deps)
    t.sent.length = 0
    expect(await handleUpdate(msg(USER_2, { text: '/start CODE_ali_2' }), t.deps)).toBe('linked')

    const [old, current] = t.links
    expect(old).toMatchObject({ telegram_user_id: USER_1.id, unlink_reason: 'replaced', replaced_by: current.id })
    expect(current).toMatchObject({ telegram_user_id: USER_2.id, subject_id: ALI.id })
    expect(t.sent.some(s => s.chatId === USER_1.id && s.text.includes('привязан другой Telegram-аккаунт'))).toBe(true)
  })

  it('refreshes the profile when the same pair links again with a new code', async () => {
    t.addCode('CODE_ali_1', ALI.id)
    t.addCode('CODE_ali_2', ALI.id)
    await handleUpdate(msg(USER_1, { text: '/start CODE_ali_1' }), t.deps)
    const result = await handleUpdate(msg({ ...USER_1, username: 'ali_new' }, { text: '/start CODE_ali_2' }), t.deps)
    expect(result).toBe('already_linked')
    expect(t.links).toHaveLength(1)
    expect(t.links[0].username).toBe('ali_new')
  })

  it('carries over a verified phone when the account re-links to the same person', async () => {
    t.addCode('CODE_ali_1', ALI.id)
    t.addCode('CODE_ali_2', ALI.id)
    await handleUpdate(msg(USER_1, { text: '/start CODE_ali_1' }), t.deps)
    await handleUpdate(msg(USER_1, { contact: { phone_number: '+992901234567', user_id: USER_1.id } }), t.deps)
    await handleUpdate(msg(USER_1, { text: '/stop' }), t.deps)
    t.sent.length = 0

    expect(await handleUpdate(msg(USER_1, { text: '/start CODE_ali_2' }), t.deps)).toBe('linked')
    const active = t.links.find(l => !l.unlinked_at)!
    expect(active.phone_verified).toBe(true)
    expect(t.sent.some(s => s.text === BOT_TEXT.askPhone)).toBe(false)
  })
})

describe('handleUpdate: contact sharing', () => {
  let t: ReturnType<typeof setup>
  beforeEach(async () => {
    t = setup()
    t.addCode('CODE_ali_1', ALI.id)
    await handleUpdate(msg(USER_1, { text: '/start CODE_ali_1' }), t.deps)
    t.sent.length = 0
  })

  it('verifies a matching phone in any format', async () => {
    const result = await handleUpdate(msg(USER_1, { contact: { phone_number: '992901234567', user_id: USER_1.id } }), t.deps)
    expect(result).toBe('phone_verified')
    expect(t.links[0]).toMatchObject({ phone: '992901234567', phone_verified: true, phone_verified_at: NOW.toISOString() })
    expect(t.sent[0].extra?.reply_markup).toEqual({ remove_keyboard: true })
  })

  it('stores but does not verify a different phone', async () => {
    const result = await handleUpdate(msg(USER_1, { contact: { phone_number: '+992 93 000 00 00', user_id: USER_1.id } }), t.deps)
    expect(result).toBe('phone_mismatch')
    expect(t.links[0]).toMatchObject({ phone: '992930000000', phone_verified: false })
    expect(t.sent[0].text).toContain('не совпадает')
  })

  it('rejects a contact of another person', async () => {
    const result = await handleUpdate(msg(USER_1, { contact: { phone_number: '+992901234567', user_id: 777 } }), t.deps)
    expect(result).toBe('phone_not_own')
    expect(t.links[0].phone_verified).toBe(false)
  })

  it('rejects a contact without user_id (picked from the address book)', async () => {
    const result = await handleUpdate(msg(USER_1, { contact: { phone_number: '+992901234567' } }), t.deps)
    expect(result).toBe('phone_not_own')
  })

  it('rejects a forwarded own contact', async () => {
    const result = await handleUpdate(
      msg(USER_1, { contact: { phone_number: '+992901234567', user_id: USER_1.id }, forward_origin: { type: 'user' } }),
      t.deps
    )
    expect(result).toBe('phone_not_own')
  })

  it('asks to link first when the account is not linked', async () => {
    const result = await handleUpdate(msg(USER_2, { contact: { phone_number: '+992930000000', user_id: USER_2.id } }), t.deps)
    expect(result).toBe('phone_not_linked')
  })

  it('keeps the phone unverified when the participant has no phone on file', async () => {
    t.addCode('CODE_noph_1', NOPHONE.id)
    await handleUpdate(msg(USER_2, { text: '/start CODE_noph_1' }), t.deps)
    const result = await handleUpdate(msg(USER_2, { contact: { phone_number: '+992930000000', user_id: USER_2.id } }), t.deps)
    expect(result).toBe('phone_unknown')
    expect(t.links.find(l => l.telegram_user_id === USER_2.id)).toMatchObject({ phone: '992930000000', phone_verified: false })
  })
})

describe('handleUpdate: other messages', () => {
  let t: ReturnType<typeof setup>
  beforeEach(() => {
    t = setup()
  })

  it('/start without a code explains where to get the link', async () => {
    expect(await handleUpdate(msg(USER_1, { text: '/start' }), t.deps)).toBe('start_help')
    expect(t.sent[0].text).toBe(BOT_TEXT.startNoCode)
  })

  it('/start without a code tells a linked user who they are', async () => {
    t.addCode('CODE_ali_1', ALI.id)
    await handleUpdate(msg(USER_1, { text: '/start CODE_ali_1' }), t.deps)
    t.sent.length = 0
    expect(await handleUpdate(msg(USER_1, { text: '/start' }), t.deps)).toBe('already_linked')
    expect(t.sent[0].text).toContain('Алиев Али')
  })

  it('/stop unlinks and is safe to repeat', async () => {
    t.addCode('CODE_ali_1', ALI.id)
    await handleUpdate(msg(USER_1, { text: '/start CODE_ali_1' }), t.deps)
    expect(await handleUpdate(msg(USER_1, { text: '/stop' }), t.deps)).toBe('stopped')
    expect(t.links[0]).toMatchObject({ unlinked_at: NOW.toISOString(), unlink_reason: 'user_stop' })
    expect(await handleUpdate(msg(USER_1, { text: '/stop' }), t.deps)).toBe('stop_not_linked')
  })

  it('answers unknown messages with help', async () => {
    expect(await handleUpdate(msg(USER_1, { text: 'привет' }), t.deps)).toBe('help')
    expect(t.sent[0].text).toBe(BOT_TEXT.startNoCode)
    t.addCode('CODE_ali_1', ALI.id)
    await handleUpdate(msg(USER_1, { text: '/start CODE_ali_1' }), t.deps)
    t.sent.length = 0
    await handleUpdate(msg(USER_1, { text: 'когда оплата?' }), t.deps)
    expect(t.sent[0].text).toBe(BOT_TEXT.helpLinked)
  })

  it('ignores groups, bots and updates without a message', async () => {
    expect(await handleUpdate({ update_id: 1 }, t.deps)).toBe('ignored')
    expect(
      await handleUpdate(
        { update_id: 2, message: { message_id: 1, from: USER_1, chat: { id: -100, type: 'group' }, text: '/start x' } },
        t.deps
      )
    ).toBe('ignored')
    expect(await handleUpdate(msg({ ...USER_2, is_bot: true } as never, { text: '/start' }), t.deps)).toBe('ignored')
    expect(t.send).not.toHaveBeenCalled()
  })
})
