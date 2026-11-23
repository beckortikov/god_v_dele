/**
 * Who may use the CRM (Обзвон, Воронка, Instagram). Admin always; participants never;
 * other staff when an administrator ticked «Доступ к CRM» on their sign-in (migration 028).
 * Read from the database on every request, so the tick works without signing in again.
 *
 * Server only.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, type Role } from '@/lib/session'

const STAFF: Role[] = ['finance', 'manager', 'employee', 'wheels_manager']

const columnMissing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42703' || /crm_access/.test(e.message ?? ''))

export async function crmAllowed(s: { uid: string; role: Role } | null): Promise<boolean> {
  if (!s) return false
  if (s.role === 'admin') return true
  if (!STAFF.includes(s.role)) return false
  const { data, error } = await db.from('app_users').select('crm_access').eq('id', s.uid).maybeSingle()
  // Before migration 028 everyone who had «Обзвон» keeps it
  if (columnMissing(error)) return true
  if (error) throw new Error(error.message)
  return !!(data as { crm_access?: boolean } | null)?.crm_access
}

/** null when the caller may use the CRM, otherwise the 403 answer to return. */
export async function crmGuard(req: Request): Promise<Response | null> {
  let session = null
  try {
    session = getSession(req)
  } catch {
    session = null
  }
  if (await crmAllowed(session)) return null
  return NextResponse.json({ error: 'Нет доступа к CRM. Его выдаёт администратор в карточке сотрудника' }, { status: 403 })
}

export { columnMissing as crmColumnMissing }
