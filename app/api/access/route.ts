import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchRow, logAudit } from '@/lib/audit'
import { stripSecrets } from '@/lib/audit-labels'
import { hashPassword } from '@/lib/password'
import { isEmployeeAccountRole } from '@/lib/access'
import { sessionOf } from '@/lib/api-auth'
import { isUuid } from '@/app/api/sprints/_lib/store'
import { AccountError, accountOf, assertLoginFree, insertAccount, validateCredentials } from '@/app/api/_lib/accounts'
import { passwordProblem } from '@/lib/access'

export const dynamic = 'force-dynamic'

/**
 * Sign-in of one person who already exists: ?employee_id=<uuid> or ?participant_id=<uuid>.
 * Participants' sign-ins may be managed by admin, finance and wheels_manager (the roles that
 * run the participants page); employees' only by admin, who also picks their role.
 */
function target(req: Request, body?: Record<string, unknown>) {
  const q = new URL(req.url).searchParams
  const employeeId = q.get('employee_id') ?? (body?.employee_id as string | undefined) ?? null
  const participantId = q.get('participant_id') ?? (body?.participant_id as string | undefined) ?? null
  if (employeeId && participantId) throw new AccountError('Укажите одного человека')
  if (employeeId) {
    if (!isUuid(employeeId)) throw new AccountError('employee_id: нужен UUID')
    if (sessionOf(req)?.role !== 'admin') throw new AccountError('Доступ сотрудникам выдаёт только администратор', 403)
    return { kind: 'employee' as const, id: employeeId }
  }
  if (participantId) {
    if (!isUuid(participantId)) throw new AccountError('participant_id: нужен UUID')
    return { kind: 'participant' as const, id: participantId }
  }
  throw new AccountError('Укажите сотрудника или участника')
}

async function personName(kind: 'employee' | 'participant', id: string): Promise<string> {
  if (kind === 'participant') {
    const { data } = await db.from('participants').select('name').eq('id', id).maybeSingle()
    if (!data) throw new AccountError('Участник не найден', 404)
    return data.name
  }
  const { data } = await db.from('employees').select('first_name, last_name').eq('id', id).maybeSingle()
  if (!data) throw new AccountError('Сотрудник не найден', 404)
  return `${data.first_name} ${data.last_name}`.trim()
}

function fail(e: unknown) {
  if (e instanceof AccountError) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error('[access]', e)
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
}

/** GET → { data: { id, username, role, last_login_at } | null } */
export async function GET(req: Request) {
  try {
    const t = target(req)
    return NextResponse.json({ data: await accountOf(t.kind, t.id) })
  } catch (e) {
    return fail(e)
  }
}

/** POST { employee_id | participant_id, username, password, role? } → creates the sign-in. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const t = target(req, body)
    if (await accountOf(t.kind, t.id)) throw new AccountError('У этого человека уже есть вход. Пароль можно сменить', 409)
    const creds = validateCredentials(body)
    let role = 'participant'
    if (t.kind === 'employee') {
      if (!isEmployeeAccountRole(body.role)) throw new AccountError('Выберите, какой доступ получит сотрудник')
      role = body.role
    }
    await assertLoginFree(creds.username)
    const user = await insertAccount(req, {
      ...creds,
      role,
      full_name: await personName(t.kind, t.id),
      employee_id: t.kind === 'employee' ? t.id : null,
      participant_id: t.kind === 'participant' ? t.id : null,
    })
    return NextResponse.json({ data: { id: user.id, username: user.username, role: user.role } }, { status: 201 })
  } catch (e) {
    return fail(e)
  }
}

/** PUT { employee_id | participant_id, password } → a new password for the existing sign-in. */
export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const t = target(req, body)
    const issue = passwordProblem(body.password)
    if (issue) throw new AccountError(issue)
    const account = await accountOf(t.kind, t.id)
    if (!account) throw new AccountError('У этого человека ещё нет входа', 404)
    const before = await fetchRow('app_users', account.id)
    const { error } = await db.from('app_users').update({ password: await hashPassword(String(body.password)) }).eq('id', account.id)
    if (error) throw new Error(error.message)
    await logAudit(req, {
      table: 'app_users',
      recordId: account.id,
      action: 'update',
      summary: `Пользователь «${account.username}»: пароль`,
      before: stripSecrets(before),
      after: stripSecrets(before),
    })
    return NextResponse.json({ data: { id: account.id, username: account.username } })
  } catch (e) {
    return fail(e)
  }
}
