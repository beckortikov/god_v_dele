/**
 * Telegram bot: configuration, Bot API calls, helpers and the update handler.
 *
 * The update handler (`handleUpdate`) is a pure function over injected
 * dependencies (storage + send), so it is unit-tested without a database or a
 * bot token. The Supabase-backed storage lives in app/api/telegram/_lib/store.ts.
 *
 * This module has no server-only imports: client components may import the
 * phone helpers and the types from here.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const LINK_CODE_TTL_DAYS = 7
export const LINK_CODE_LENGTH = 10

export function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null
}

/** Bot username without the leading @. */
export function getBotUsername() {
  return process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') || null
}

export function getWebhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null
}

/** The bot can be used: the token and the username (for deep links) are set. */
export function isTelegramConfigured() {
  return Boolean(getBotToken() && getBotUsername())
}

// ---------------------------------------------------------------------------
// Bot API
// ---------------------------------------------------------------------------

export class TelegramApiError extends Error {
  constructor(
    public method: string,
    public errorCode: number | undefined,
    public description: string
  ) {
    super(`Telegram ${method} failed: ${errorCode ?? ''} ${description}`.trim())
    this.name = 'TelegramApiError'
  }
}

/** Calls a Bot API method and returns its `result`. Throws TelegramApiError. */
export async function tg<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = getBotToken()
  if (!token) throw new TelegramApiError(method, undefined, 'TELEGRAM_BOT_TOKEN is not set')
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  let json: { ok?: boolean; result?: T; error_code?: number; description?: string }
  try {
    json = await res.json()
  } catch {
    throw new TelegramApiError(method, res.status, `HTTP ${res.status}`)
  }
  if (!json.ok) throw new TelegramApiError(method, json.error_code ?? res.status, json.description || 'Unknown error')
  return json.result as T
}

export type ReplyMarkup =
  | { keyboard: { text: string; request_contact?: boolean }[][]; resize_keyboard?: boolean; one_time_keyboard?: boolean; input_field_placeholder?: string }
  | { remove_keyboard: true }
  | { inline_keyboard: { text: string; url?: string; callback_data?: string }[][] }

export interface SendExtra {
  reply_markup?: ReplyMarkup
  parse_mode?: 'HTML' | 'MarkdownV2'
  disable_notification?: boolean
  link_preview_options?: { is_disabled?: boolean }
}

export function sendMessage(chatId: number, text: string, extra: SendExtra = {}) {
  return tg('sendMessage', { chat_id: chatId, text, ...extra })
}

/** https://t.me/<bot>?start=<code>, or null when the bot username is not set. */
export function buildDeepLink(code: string, username = getBotUsername()) {
  if (!username) return null
  return `https://t.me/${username}?start=${encodeURIComponent(code)}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/**
 * Unguessable URL-safe code (64-symbol alphabet, 6 bits per char: 60 bits for
 * 10 chars). Telegram allows A-Z, a-z, 0-9, _ and - in the start parameter.
 */
export function generateCode(length = LINK_CODE_LENGTH) {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  // 256 is a multiple of 64, so `% 64` has no modulo bias.
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % 64]
  return out
}

export function isValidCode(code: string) {
  return /^[A-Za-z0-9_-]{8,64}$/.test(code)
}

/** Digits only: "+992 (90) 123-45-67" -> "992901234567". */
export function normalizePhone(phone: string | null | undefined) {
  return (phone ?? '').replace(/\D/g, '')
}

/** Number of trailing digits compared: a Tajik number is +992 plus 9 digits. */
export const PHONE_MATCH_DIGITS = 9

/**
 * Same phone if the last 9 digits match, so "+992 90 123 45 67",
 * "992901234567" and "901234567" are all equal. Numbers shorter than 9
 * digits never match.
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined) {
  const x = normalizePhone(a)
  const y = normalizePhone(b)
  if (x.length < PHONE_MATCH_DIGITS || y.length < PHONE_MATCH_DIGITS) return false
  return x.slice(-PHONE_MATCH_DIGITS) === y.slice(-PHONE_MATCH_DIGITS)
}

/** Phone for wa.me links: digits with country code; 9-digit local numbers get 992. */
export function phoneForWhatsApp(phone: string | null | undefined) {
  const d = normalizePhone(phone)
  if (!d) return ''
  if (d.length === PHONE_MATCH_DIGITS) return `992${d}`
  return d
}

/** "+992 90 123 45 67" style display for stored digit-only phones. */
export function formatPhone(phone: string | null | undefined) {
  const d = normalizePhone(phone)
  if (d.length === 12 && d.startsWith('992')) {
    return `+992 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`
  }
  return d ? `+${d}` : ''
}

/** True when Postgres/PostgREST says a telegram table does not exist (migration 015 not applied). */
export function isMissingTelegramTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message || '').toLowerCase()
  return msg.includes('telegram_') && (msg.includes('does not exist') || msg.includes('could not find the table'))
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubjectType = 'participant' | 'employee'
export type UnlinkReason = 'user_stop' | 'manual' | 'moved' | 'replaced'

/** A row of telegram_links. */
export interface TelegramLink {
  id: string
  subject_type: SubjectType
  subject_id: string
  telegram_user_id: number
  chat_id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  language_code: string | null
  phone: string | null
  phone_verified: boolean
  phone_verified_at: string | null
  notify: boolean
  linked_at: string
  linked_via_code: string | null
  unlinked_at: string | null
  unlink_reason: UnlinkReason | null
  replaced_by: string | null
}

/** A row of telegram_link_codes. */
export interface TelegramLinkCode {
  code: string
  subject_type: SubjectType
  subject_id: string
  created_at: string
  expires_at: string
  used_at: string | null
  used_by_telegram_user_id: number | null
  created_by: string | null
}

/** The person a code or link points to. */
export interface LinkSubject {
  type: SubjectType
  id: string
  name: string
  phone: string | null
  /** For participants: the program name. */
  programName: string | null
}

/** Link as returned to the UI by GET /api/telegram/links. */
export interface TelegramLinkSummary {
  id: string
  subjectId: string
  subjectType: SubjectType
  username: string | null
  firstName: string | null
  lastName: string | null
  phone: string | null
  phoneVerified: boolean
  notify: boolean
  linkedAt: string
}

export function toLinkSummary(l: TelegramLink, withPhone = false): TelegramLinkSummary {
  return {
    id: l.id,
    subjectId: l.subject_id,
    subjectType: l.subject_type,
    username: l.username,
    firstName: l.first_name,
    lastName: l.last_name,
    phone: withPhone ? l.phone : null,
    phoneVerified: l.phone_verified,
    notify: l.notify,
    linkedAt: l.linked_at,
  }
}

/** @username, otherwise "First Last", otherwise "Telegram". */
export function telegramDisplayName(l: { username?: string | null; firstName?: string | null; lastName?: string | null }) {
  if (l.username) return `@${l.username}`
  const name = [l.firstName, l.lastName].filter(Boolean).join(' ').trim()
  return name || 'Telegram'
}

// Minimal subset of the Bot API update types we use.
export interface TgUser {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface TgChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
}

export interface TgContact {
  phone_number: string
  first_name?: string
  last_name?: string
  user_id?: number
}

export interface TgMessage {
  message_id: number
  date?: number
  from?: TgUser
  chat: TgChat
  text?: string
  contact?: TgContact
  forward_origin?: unknown
  forward_date?: number
}

export interface TgUpdate {
  update_id: number
  message?: TgMessage
}

// ---------------------------------------------------------------------------
// Update handler
// ---------------------------------------------------------------------------

export interface NewLinkInput {
  subject_type: SubjectType
  subject_id: string
  telegram_user_id: number
  chat_id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  language_code: string | null
  phone: string | null
  phone_verified: boolean
  phone_verified_at: string | null
  linked_via_code: string | null
}

export type LinkPatch = Partial<
  Pick<
    TelegramLink,
    | 'chat_id'
    | 'username'
    | 'first_name'
    | 'last_name'
    | 'language_code'
    | 'phone'
    | 'phone_verified'
    | 'phone_verified_at'
    | 'notify'
    | 'unlinked_at'
    | 'unlink_reason'
    | 'replaced_by'
  >
>

/** Storage used by the handler. Every method may throw; the webhook logs it. */
export interface TelegramStore {
  getCode(code: string): Promise<TelegramLinkCode | null>
  /** Marks the code used only if it is still unused. True when this call claimed it. */
  claimCode(code: string, telegramUserId: number, at: Date): Promise<boolean>
  getSubject(type: SubjectType, id: string): Promise<LinkSubject | null>
  getActiveLinkByTelegramUser(telegramUserId: number): Promise<TelegramLink | null>
  getActiveLinkBySubject(type: SubjectType, id: string): Promise<TelegramLink | null>
  /** The most recent phone this Telegram user shared (any link, active or not). */
  getLastSharedPhone(telegramUserId: number): Promise<string | null>
  createLink(input: NewLinkInput): Promise<TelegramLink>
  updateLink(id: string, patch: LinkPatch): Promise<void>
}

export interface HandlerDeps {
  store: TelegramStore
  send: (chatId: number, text: string, extra?: SendExtra) => Promise<unknown>
  now?: () => Date
  log?: (message: string, meta?: unknown) => void
}

export type HandleResult =
  | 'ignored'
  | 'linked'
  | 'already_linked'
  | 'code_invalid'
  | 'code_expired'
  | 'code_used'
  | 'subject_missing'
  | 'start_help'
  | 'stopped'
  | 'stop_not_linked'
  | 'phone_verified'
  | 'phone_mismatch'
  | 'phone_unknown'
  | 'phone_not_own'
  | 'phone_not_linked'
  | 'help'

export const PHONE_KEYBOARD: ReplyMarkup = {
  keyboard: [[{ text: 'Поделиться номером', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
  input_field_placeholder: 'Нажмите «Поделиться номером»',
}

const REMOVE_KEYBOARD: ReplyMarkup = { remove_keyboard: true }

export const BOT_TEXT = {
  startNoCode:
    'Здравствуйте! Это бот «Год в деле»: здесь приходят напоминания об оплате и важные новости.\n\n' +
    'Чтобы привязать аккаунт, откройте личный кабинет «Год в деле» и нажмите «Привязать Telegram». ' +
    'Если доступа к кабинету нет, попросите ссылку для привязки у менеджера.',
  codeInvalid:
    'Ссылка недействительна. Откройте личный кабинет и нажмите «Привязать Telegram» ещё раз или попросите новую ссылку у менеджера.',
  codeExpired:
    'Срок действия ссылки истёк. Получите новую в личном кабинете («Привязать Telegram») или попросите у менеджера.',
  codeUsed:
    'Эта ссылка уже использована. Если вы ещё не привязаны, получите новую ссылку в личном кабинете или у менеджера.',
  subjectMissing: 'Не нашли участника по этой ссылке. Пожалуйста, обратитесь к менеджеру.',
  askPhone:
    'Чтобы мы точно знали, что это вы, поделитесь номером телефона: нажмите кнопку «Поделиться номером» внизу.',
  phoneNotOwn: 'Пожалуйста, отправьте свой номер кнопкой «Поделиться номером», а не чужой контакт.',
  phoneNotLinked: 'Сначала привяжите аккаунт по ссылке из личного кабинета «Год в деле».',
  stopped:
    'Вы отписались: уведомления от «Год в деле» больше не будут приходить. ' +
    'Чтобы подключить их снова, нажмите «Привязать Telegram» в личном кабинете.',
  stopNotLinked: 'Ваш Telegram не привязан, уведомления не приходят.',
  helpLinked: 'Это бот уведомлений «Год в деле». Сюда придут напоминания об оплате.\n\n/stop — отписаться от уведомлений.\nПо остальным вопросам пишите вашему менеджеру.',
}

export function linkedText(subject: LinkSubject) {
  const program = subject.programName ? `, программа «${subject.programName}»` : ''
  return `Готово! Вы привязаны как ${subject.name}${program}.\n\nСюда будут приходить напоминания об оплате и важные новости. Отписаться: /stop`
}

export function alreadyLinkedText(subject: LinkSubject) {
  const program = subject.programName ? `, программа «${subject.programName}»` : ''
  return `Вы уже привязаны как ${subject.name}${program}. Отписаться: /stop`
}

/** "/start abc" -> { command: 'start', arg: 'abc' }; handles "/start@MyBot abc". */
export function parseCommand(text: string | undefined) {
  if (!text) return null
  const m = /^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (!m) return null
  return { command: m[1].toLowerCase(), arg: (m[2] ?? '').trim() }
}

/**
 * Handles one Telegram update. Idempotent: a redelivered /start with the same
 * code, a repeated contact or /stop give the same outcome. Throws only on
 * storage or send failures; the webhook catches and logs them.
 */
export async function handleUpdate(update: TgUpdate, deps: HandlerDeps): Promise<HandleResult> {
  const msg = update.message
  // Only private chats with people. Groups, channels and bots are ignored.
  if (!msg || !msg.from || msg.from.is_bot || msg.chat.type !== 'private') return 'ignored'

  if (msg.contact) return handleContact(msg, deps)

  const cmd = parseCommand(msg.text)
  if (cmd?.command === 'start') {
    return cmd.arg ? handleStartWithCode(msg, cmd.arg, deps) : handleStartWithoutCode(msg, deps)
  }
  if (cmd?.command === 'stop') return handleStop(msg, deps)
  return handleOther(msg, deps)
}

async function handleStartWithCode(msg: TgMessage, rawCode: string, deps: HandlerDeps): Promise<HandleResult> {
  const { store, send } = deps
  const now = deps.now?.() ?? new Date()
  const from = msg.from!
  const chatId = msg.chat.id
  const code = rawCode.split(/\s+/)[0]

  const row = isValidCode(code) ? await store.getCode(code) : null
  if (!row) {
    await send(chatId, BOT_TEXT.codeInvalid)
    return 'code_invalid'
  }

  if (row.used_at) {
    // Telegram may redeliver the same update, or the person taps the link twice.
    if (row.used_by_telegram_user_id === from.id) {
      const active = await store.getActiveLinkBySubject(row.subject_type, row.subject_id)
      if (active && active.telegram_user_id === from.id) {
        const subject = await store.getSubject(row.subject_type, row.subject_id)
        if (subject) {
          await send(chatId, alreadyLinkedText(subject), active.phone_verified ? { reply_markup: REMOVE_KEYBOARD } : undefined)
          if (!active.phone_verified) await send(chatId, BOT_TEXT.askPhone, { reply_markup: PHONE_KEYBOARD })
          return 'already_linked'
        }
      }
    }
    await send(chatId, BOT_TEXT.codeUsed)
    return 'code_used'
  }

  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    await send(chatId, BOT_TEXT.codeExpired)
    return 'code_expired'
  }

  const subject = await store.getSubject(row.subject_type, row.subject_id)
  if (!subject) {
    await send(chatId, BOT_TEXT.subjectMissing)
    return 'subject_missing'
  }

  // Claim atomically: if two deliveries race, only one proceeds.
  const claimed = await store.claimCode(row.code, from.id, now)
  if (!claimed) {
    const again = await store.getCode(row.code)
    if (again?.used_by_telegram_user_id === from.id) return 'already_linked'
    await send(chatId, BOT_TEXT.codeUsed)
    return 'code_used'
  }

  const profile = {
    chat_id: chatId,
    username: from.username ?? null,
    first_name: from.first_name ?? null,
    last_name: from.last_name ?? null,
    language_code: from.language_code ?? null,
  }

  const byUser = await store.getActiveLinkByTelegramUser(from.id)
  const bySubject = await store.getActiveLinkBySubject(subject.type, subject.id)

  // Same pair already linked: refresh the profile and confirm.
  if (byUser && bySubject && byUser.id === bySubject.id) {
    await store.updateLink(byUser.id, profile)
    await send(chatId, alreadyLinkedText(subject), byUser.phone_verified ? { reply_markup: REMOVE_KEYBOARD } : undefined)
    if (!byUser.phone_verified) await send(chatId, BOT_TEXT.askPhone, { reply_markup: PHONE_KEYBOARD })
    return 'already_linked'
  }

  const nowIso = now.toISOString()
  // Close the old links first so the partial unique indexes allow the new one.
  if (byUser) await store.updateLink(byUser.id, { unlinked_at: nowIso, unlink_reason: 'moved' })
  if (bySubject) await store.updateLink(bySubject.id, { unlinked_at: nowIso, unlink_reason: 'replaced' })

  // A phone this Telegram account already shared counts if it matches the new person.
  const lastPhone = await store.getLastSharedPhone(from.id)
  const carriedVerified = !!lastPhone && phonesMatch(lastPhone, subject.phone)

  const link = await store.createLink({
    subject_type: subject.type,
    subject_id: subject.id,
    telegram_user_id: from.id,
    ...profile,
    phone: carriedVerified ? lastPhone : null,
    phone_verified: carriedVerified,
    phone_verified_at: carriedVerified ? nowIso : null,
    linked_via_code: row.code,
  })

  if (byUser) await store.updateLink(byUser.id, { replaced_by: link.id })
  if (bySubject) {
    await store.updateLink(bySubject.id, { replaced_by: link.id })
    // Tell the previous account, best effort.
    try {
      await send(
        bySubject.chat_id,
        `К участнику ${subject.name} привязан другой Telegram-аккаунт, поэтому уведомления сюда больше не придут. Если это ошибка, обратитесь к менеджеру.`,
        { reply_markup: REMOVE_KEYBOARD }
      )
    } catch (e) {
      deps.log?.('telegram: could not notify replaced account', e)
    }
  }
  deps.log?.('telegram: linked', {
    subject: `${subject.type}:${subject.id}`,
    telegramUserId: from.id,
    moved: byUser?.subject_id ?? null,
    replaced: bySubject?.telegram_user_id ?? null,
  })

  await send(chatId, linkedText(subject), carriedVerified ? { reply_markup: REMOVE_KEYBOARD } : undefined)
  if (!carriedVerified) await send(chatId, BOT_TEXT.askPhone, { reply_markup: PHONE_KEYBOARD })
  return 'linked'
}

async function handleStartWithoutCode(msg: TgMessage, deps: HandlerDeps): Promise<HandleResult> {
  const active = await deps.store.getActiveLinkByTelegramUser(msg.from!.id)
  if (active) {
    const subject = await deps.store.getSubject(active.subject_type, active.subject_id)
    if (subject) {
      await deps.send(msg.chat.id, alreadyLinkedText(subject))
      if (!active.phone_verified) await deps.send(msg.chat.id, BOT_TEXT.askPhone, { reply_markup: PHONE_KEYBOARD })
      return 'already_linked'
    }
  }
  await deps.send(msg.chat.id, BOT_TEXT.startNoCode)
  return 'start_help'
}

async function handleStop(msg: TgMessage, deps: HandlerDeps): Promise<HandleResult> {
  const active = await deps.store.getActiveLinkByTelegramUser(msg.from!.id)
  if (!active) {
    await deps.send(msg.chat.id, BOT_TEXT.stopNotLinked, { reply_markup: REMOVE_KEYBOARD })
    return 'stop_not_linked'
  }
  const now = deps.now?.() ?? new Date()
  await deps.store.updateLink(active.id, { unlinked_at: now.toISOString(), unlink_reason: 'user_stop' })
  await deps.send(msg.chat.id, BOT_TEXT.stopped, { reply_markup: REMOVE_KEYBOARD })
  return 'stopped'
}

async function handleContact(msg: TgMessage, deps: HandlerDeps): Promise<HandleResult> {
  const { store, send } = deps
  const from = msg.from!
  const contact = msg.contact!

  // Only the person's own number, shared with the button. A forwarded or
  // picked contact has another (or no) user_id.
  if (contact.user_id !== from.id || msg.forward_origin || msg.forward_date) {
    await send(msg.chat.id, BOT_TEXT.phoneNotOwn, { reply_markup: PHONE_KEYBOARD })
    return 'phone_not_own'
  }

  const active = await store.getActiveLinkByTelegramUser(from.id)
  if (!active) {
    await send(msg.chat.id, BOT_TEXT.phoneNotLinked, { reply_markup: REMOVE_KEYBOARD })
    return 'phone_not_linked'
  }

  const phone = normalizePhone(contact.phone_number)
  const subject = await store.getSubject(active.subject_type, active.subject_id)
  const now = (deps.now?.() ?? new Date()).toISOString()

  if (subject && phonesMatch(phone, subject.phone)) {
    await store.updateLink(active.id, { phone, phone_verified: true, phone_verified_at: active.phone_verified ? active.phone_verified_at : now })
    await send(msg.chat.id, 'Спасибо! Номер подтверждён. Напоминания об оплате будут приходить сюда.', { reply_markup: REMOVE_KEYBOARD })
    return 'phone_verified'
  }

  await store.updateLink(active.id, { phone, phone_verified: false, phone_verified_at: null })
  if (!subject || !normalizePhone(subject.phone)) {
    await send(
      msg.chat.id,
      'Спасибо, номер сохранён. В нашей базе пока нет вашего телефона, менеджер проверит и подтвердит его.',
      { reply_markup: REMOVE_KEYBOARD }
    )
    return 'phone_unknown'
  }
  await send(
    msg.chat.id,
    `Номер ${formatPhone(phone)} не совпадает с номером в нашей базе. Если вы сменили номер, сообщите менеджеру, и мы обновим данные.`,
    { reply_markup: REMOVE_KEYBOARD }
  )
  return 'phone_mismatch'
}

async function handleOther(msg: TgMessage, deps: HandlerDeps): Promise<HandleResult> {
  const active = await deps.store.getActiveLinkByTelegramUser(msg.from!.id)
  await deps.send(msg.chat.id, active ? BOT_TEXT.helpLinked : BOT_TEXT.startNoCode)
  return 'help'
}
