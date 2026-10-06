/**
 * Server-only helpers for writing the журнал from API routes: name lookups for
 * human summaries and logging of rows removed by ON DELETE CASCADE.
 */
import { supabaseAdmin } from '@/lib/supabase-client'
import { logAudit } from '@/lib/audit'
import { personName } from '@/lib/audit-labels'

/** Participant name, or '' if unknown. Never throws. */
export async function participantName(id: unknown): Promise<string> {
  if (!id) return ''
  try {
    const { data } = await supabaseAdmin.from('participants').select('name').eq('id', id).maybeSingle()
    return data?.name ?? ''
  } catch {
    return ''
  }
}

/** Map of participant id → name for a batch. Never throws. */
export async function participantNames(ids: unknown[]): Promise<Record<string, string>> {
  const list = [...new Set(ids.filter(Boolean).map(String))]
  if (!list.length) return {}
  try {
    const { data } = await supabaseAdmin.from('participants').select('id, name').in('id', list)
    return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.name]))
  } catch {
    return {}
  }
}

/** «Имя Фамилия» of an employee, or '' if unknown. Never throws. */
export async function employeeName(id: unknown): Promise<string> {
  if (!id) return ''
  try {
    const { data } = await supabaseAdmin.from('employees').select('first_name, last_name').eq('id', id).maybeSingle()
    return personName(data)
  } catch {
    return ''
  }
}

/** Event name, or '' if unknown. Never throws. */
export async function eventName(id: unknown): Promise<string> {
  if (!id) return ''
  try {
    const { data } = await supabaseAdmin.from('offline_events').select('name').eq('id', id).maybeSingle()
    return data?.name ?? ''
  } catch {
    return ''
  }
}

/** All rows of `table` where `column` = value. Used before a delete that cascades. Never throws. */
export async function fetchRowsWhere(table: string, column: string, value: unknown): Promise<any[]> {
  if (value == null || value === '') return []
  try {
    const { data } = await supabaseAdmin.from(table).select('*').eq(column, value)
    return data ?? []
  } catch {
    return []
  }
}

/** Logs every row as deleted (e.g. rows removed by ON DELETE CASCADE). */
export async function logDeletedRows(req: Request, table: string, rows: any[], summary: (row: any) => string) {
  if (!rows.length) return
  await Promise.all(
    rows.map(row => logAudit(req, { table, recordId: row.id, action: 'delete', summary: summary(row), before: row }))
  )
}

/** True when the error means the audit_log table does not exist yet (migration 011 not applied). */
export function isMissingTableError(error: any): boolean {
  if (!error) return false
  const code = String(error.code ?? '')
  const msg = String(error.message ?? '')
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (/audit_log/.test(msg) && /does not exist|schema cache|not find/i.test(msg))
  )
}
