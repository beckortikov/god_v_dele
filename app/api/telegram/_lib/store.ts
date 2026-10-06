import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import {
  isMissingTelegramTable,
  type LinkPatch,
  type LinkSubject,
  type NewLinkInput,
  type SubjectType,
  type TelegramLink,
  type TelegramLinkCode,
  type TelegramStore,
} from '@/lib/telegram'

export const LINKS_TABLE = 'telegram_links'
export const CODES_TABLE = 'telegram_link_codes'

/** Thrown by the store so routes can answer 503 migration_required. */
export class MigrationRequiredError extends Error {
  constructor() {
    super('Telegram tables are missing: apply migrations/015_telegram.sql')
    this.name = 'MigrationRequiredError'
  }
}

type PgError = { code?: string; message?: string } | null

function check(error: PgError) {
  if (!error) return
  if (isMissingTelegramTable(error)) throw new MigrationRequiredError()
  throw new Error(error.message || 'Database error')
}

export function migrationRequired() {
  return NextResponse.json(
    {
      error: 'migration_required',
      message: 'Таблицы Telegram ещё не созданы. Примените миграцию migrations/015_telegram.sql в Supabase (SQL Editor).',
    },
    { status: 503 }
  )
}

/** Turns store errors into responses: 503 for a missing migration, 500 otherwise. */
export function errorResponse(e: unknown, context: string) {
  if (e instanceof MigrationRequiredError) return migrationRequired()
  console.error(`[telegram] ${context}:`, e)
  return NextResponse.json({ error: (e as Error)?.message || 'Internal server error' }, { status: 500 })
}

/** Cheap check that migration 015 is applied. */
export async function tablesExist() {
  // Not a HEAD request: PostgREST's 404 body (with the error code) is needed.
  const { error } = await supabaseAdmin.from(LINKS_TABLE).select('id').limit(1)
  if (!error) return true
  if (isMissingTelegramTable(error)) return false
  throw new Error(error.message)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

export const SUBJECT_TYPES: SubjectType[] = ['participant']
export const isSupportedSubjectType = (v: unknown): v is SubjectType => SUBJECT_TYPES.includes(v as SubjectType)

export async function getSubject(type: SubjectType, id: string): Promise<LinkSubject | null> {
  if (type !== 'participant' || !isUuid(id)) return null
  const { data, error } = await supabaseAdmin
    .from('participants')
    .select('id, name, phone, program:programs(name)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const program = (data as { program?: { name?: string } | { name?: string }[] | null }).program
  const programName = Array.isArray(program) ? program[0]?.name : program?.name
  return { type, id: data.id, name: data.name, phone: data.phone ?? null, programName: programName ?? null }
}

export async function getActiveLinkBySubject(type: SubjectType, id: string): Promise<TelegramLink | null> {
  const { data, error } = await supabaseAdmin
    .from(LINKS_TABLE)
    .select('*')
    .eq('subject_type', type)
    .eq('subject_id', id)
    .is('unlinked_at', null)
    .maybeSingle()
  check(error)
  return (data as TelegramLink) ?? null
}

export async function listActiveLinks(type: SubjectType): Promise<TelegramLink[]> {
  const { data, error } = await supabaseAdmin
    .from(LINKS_TABLE)
    .select('*')
    .eq('subject_type', type)
    .is('unlinked_at', null)
    .order('linked_at', { ascending: false })
  check(error)
  return (data as TelegramLink[]) ?? []
}

export async function updateLink(id: string, patch: LinkPatch) {
  const { error } = await supabaseAdmin
    .from(LINKS_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  check(error)
}

/** Reuses an unused code that is valid for at least another day, otherwise creates one. */
export async function getOrCreateCode(
  type: SubjectType,
  id: string,
  createdBy: string | null,
  generate: () => string,
  ttlDays: number
): Promise<TelegramLinkCode> {
  const minExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const { data: existing, error } = await supabaseAdmin
    .from(CODES_TABLE)
    .select('*')
    .eq('subject_type', type)
    .eq('subject_id', id)
    .is('used_at', null)
    .gt('expires_at', minExpiry)
    .order('created_at', { ascending: false })
    .limit(1)
  check(error)
  if (existing?.[0]) return existing[0] as TelegramLinkCode

  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
  // A collision on 60 random bits is practically impossible; retry anyway.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error: insertError } = await supabaseAdmin
      .from(CODES_TABLE)
      .insert({ code: generate(), subject_type: type, subject_id: id, expires_at: expiresAt, created_by: createdBy })
      .select('*')
      .single()
    if (!insertError) return data as TelegramLinkCode
    if (insertError.code !== '23505') check(insertError)
  }
  throw new Error('Could not create a unique link code')
}

/** Supabase-backed storage for handleUpdate. */
export const supabaseTelegramStore: TelegramStore = {
  async getCode(code) {
    const { data, error } = await supabaseAdmin.from(CODES_TABLE).select('*').eq('code', code).maybeSingle()
    check(error)
    return (data as TelegramLinkCode) ?? null
  },

  async claimCode(code, telegramUserId, at) {
    const { data, error } = await supabaseAdmin
      .from(CODES_TABLE)
      .update({ used_at: at.toISOString(), used_by_telegram_user_id: telegramUserId })
      .eq('code', code)
      .is('used_at', null)
      .select('code')
    check(error)
    return (data?.length ?? 0) > 0
  },

  getSubject,

  async getActiveLinkByTelegramUser(telegramUserId) {
    const { data, error } = await supabaseAdmin
      .from(LINKS_TABLE)
      .select('*')
      .eq('telegram_user_id', telegramUserId)
      .is('unlinked_at', null)
      .maybeSingle()
    check(error)
    return (data as TelegramLink) ?? null
  },

  getActiveLinkBySubject,

  async getLastSharedPhone(telegramUserId) {
    const { data, error } = await supabaseAdmin
      .from(LINKS_TABLE)
      .select('phone')
      .eq('telegram_user_id', telegramUserId)
      .not('phone', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
    check(error)
    return (data?.[0]?.phone as string | undefined) ?? null
  },

  async createLink(input: NewLinkInput) {
    const { data, error } = await supabaseAdmin.from(LINKS_TABLE).insert(input).select('*').single()
    check(error)
    return data as TelegramLink
  },

  updateLink,
}
