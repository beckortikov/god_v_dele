import { db } from '@/lib/db'
import { isMissingTelegramTable, type LoginStore, type TelegramLogin } from '@/lib/telegram'

export const LOGINS_TABLE = 'telegram_logins'

/** A row of telegram_logins as the routes need it. */
export interface LoginRow extends TelegramLogin {
  id: string
  secret_hash: string
  approved_participant_id: string | null
  created_at: string
  ip: string | null
}

type PgError = { code?: string; message?: string } | null

/** Thrown when migration 021 is not applied: the sign-in through Telegram is simply not offered then. */
export class LoginMigrationRequired extends Error {}

function check(error: PgError) {
  if (!error) return
  if (isMissingTelegramTable(error)) throw new LoginMigrationRequired('Apply migrations/021_telegram_login.sql')
  throw new Error(error.message || 'Database error')
}

export async function loginTableExists() {
  const { error } = await db.from(LOGINS_TABLE).select('id').limit(1)
  if (!error) return true
  if (isMissingTelegramTable(error)) return false
  throw new Error(error.message)
}

export async function createLogin(input: { token: string; secretHash: string; ip: string; device: string; expiresAt: Date }) {
  const { error } = await db.from(LOGINS_TABLE).insert({
    token: input.token,
    secret_hash: input.secretHash,
    status: 'pending',
    ip: input.ip,
    device: input.device,
    expires_at: input.expiresAt.toISOString(),
  })
  check(error)
}

export async function recentLoginsFrom(ip: string, since: Date) {
  const { data, error } = await db.from(LOGINS_TABLE).select('id').eq('ip', ip).gte('created_at', since.toISOString())
  check(error)
  return data?.length ?? 0
}

export async function getLoginRow(token: string): Promise<LoginRow | null> {
  const { data, error } = await db.from(LOGINS_TABLE).select('*').eq('token', token).maybeSingle()
  check(error)
  return (data as LoginRow) ?? null
}

/** approved -> used, only once: whoever gets true holds the session. */
export async function consumeLogin(token: string) {
  const { data, error } = await db
    .from(LOGINS_TABLE)
    .update({ status: 'used', used_at: new Date().toISOString() })
    .eq('token', token)
    .eq('status', 'approved')
    .select('token')
  check(error)
  return (data?.length ?? 0) > 0
}

async function moveFromPending(token: string, patch: Record<string, unknown>) {
  const { data, error } = await db.from(LOGINS_TABLE).update(patch).eq('token', token).eq('status', 'pending').select('token')
  check(error)
  return (data?.length ?? 0) > 0
}

/** The login the bot signs a participant in to: the account whose participant_id is theirs. */
export async function accountOfParticipant(participantId: string) {
  const { data, error } = await db.from('app_users').select('*').eq('participant_id', participantId).eq('role', 'participant')
  if (error) throw new Error(error.message)
  return data?.[0] ?? null
}

export const supabaseLoginStore: LoginStore = {
  getLogin: getLoginRow,
  approveLogin: (token, telegramUserId, participantId) =>
    moveFromPending(token, {
      status: 'approved',
      approved_participant_id: participantId,
      telegram_user_id: telegramUserId,
      approved_at: new Date().toISOString(),
    }),
  denyLogin: token => moveFromPending(token, { status: 'denied' }),
  async hasAccount(participantId) {
    return Boolean(await accountOfParticipant(participantId))
  },
}
