/**
 * Server-only: creates sign-in accounts (app_users) for people the app has just
 * created, or already has. The password is hashed here and never returned.
 */
import { supabaseAdmin } from '@/lib/supabase-client'
import { logAudit } from '@/lib/audit'
import { enumLabel, stripSecrets } from '@/lib/audit-labels'
import { hashPassword } from '@/lib/password'
import { loginProblem, passwordProblem } from '@/lib/access'

/** A mistake the user can fix: shown to them as is. */
export class AccountError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 = 400
  ) {
    super(message)
    this.name = 'AccountError'
  }
}

export interface AccountInput {
  username: unknown
  password: unknown
}

/** Throws AccountError for a bad login or password, without touching the database. */
export function validateCredentials(input: AccountInput): { username: string; password: string } {
  const loginIssue = loginProblem(input.username)
  if (loginIssue) throw new AccountError(loginIssue)
  const passwordIssue = passwordProblem(input.password)
  if (passwordIssue) throw new AccountError(passwordIssue)
  return { username: String(input.username).trim(), password: String(input.password) }
}

/** Logins compare case-insensitively, so «Ahmad» and «ahmad» cannot both exist. */
export async function loginTaken(username: string): Promise<boolean> {
  const escaped = username.replace(/[\\%_]/g, c => `\\${c}`)
  const { data, error } = await supabaseAdmin.from('app_users').select('id').ilike('username', escaped).limit(1)
  if (error) throw new Error(error.message)
  return !!data?.length
}

export async function assertLoginFree(username: string) {
  if (await loginTaken(username)) throw new AccountError(`Логин «${username}» уже занят, выберите другой`, 409)
}

export interface NewAccount {
  username: string
  password: string
  role: string
  full_name: string | null
  employee_id?: string | null
  participant_id?: string | null
}

/** Inserts the account (login must already be validated and checked free) and records it in the журнал. */
export async function insertAccount(req: Request, acc: NewAccount) {
  const row: Record<string, unknown> = {
    username: acc.username,
    password: await hashPassword(acc.password),
    role: acc.role,
    full_name: acc.full_name,
  }
  if (acc.employee_id) row.employee_id = acc.employee_id
  if (acc.participant_id) row.participant_id = acc.participant_id
  const { data, error } = await supabaseAdmin.from('app_users').insert([row]).select().single()
  if (error) {
    // Two people creating the same login at once: the unique index, if any, answers.
    if (error.code === '23505') throw new AccountError(`Логин «${acc.username}» уже занят, выберите другой`, 409)
    throw new Error(error.message)
  }
  await logAudit(req, {
    table: 'app_users',
    recordId: data.id,
    action: 'create',
    summary: `Пользователь «${data.username}» (${enumLabel('app_users', 'role', data.role) ?? data.role})`,
    after: stripSecrets(data),
  })
  return stripSecrets(data) as { id: string; username: string; role: string; full_name: string | null }
}

/** The account that belongs to a person, if any (never with the password). */
export async function accountOf(kind: 'employee' | 'participant', id: string) {
  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select('*')
    .eq(kind === 'employee' ? 'employee_id' : 'participant_id', id)
    .order('created_at')
    .limit(1)
  if (error) throw new Error(error.message)
  return data?.[0] ? (stripSecrets(data[0]) as { id: string; username: string; role: string; last_login_at?: string | null }) : null
}
