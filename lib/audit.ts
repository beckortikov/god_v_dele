import { supabaseAdmin } from '@/lib/supabase-client'
import { getSession } from '@/lib/session'

export type AuditAction = 'create' | 'update' | 'delete' | 'restore'

export interface Actor {
  id: string | null
  name: string | null
}

/**
 * Who made the request, from the signed session cookie. The browser can send
 * any x-actor-* header it likes, so those are not trusted.
 */
export function getActor(req: Request): Actor {
  try {
    const s = getSession(req)
    return { id: s?.uid ?? null, name: s?.name ?? null }
  } catch {
    return { id: null, name: null }
  }
}

let tableMissingWarned = false

/**
 * Records a change in audit_log. Never throws: if the table does not exist yet
 * (migration 011 not applied) or the insert fails, the main operation still
 * succeeds.
 */
export async function logAudit(
  req: Request,
  entry: {
    table: string
    recordId?: string | number | null
    action: AuditAction
    summary?: string
    before?: unknown
    after?: unknown
  }
) {
  try {
    const actor = getActor(req)
    const { error } = await supabaseAdmin.from('audit_log').insert({
      table_name: entry.table,
      record_id: entry.recordId != null ? String(entry.recordId) : null,
      action: entry.action,
      actor_id: actor.id,
      actor_name: actor.name,
      summary: entry.summary ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    })
    if (error && !tableMissingWarned) {
      tableMissingWarned = true
      console.warn('[audit] not recorded:', error.message)
    }
  } catch (e) {
    if (!tableMissingWarned) {
      tableMissingWarned = true
      console.warn('[audit] not recorded:', (e as Error).message)
    }
  }
}

/** Reads a row before changing it, so the log can keep the previous version. */
export async function fetchRow(table: string, id: string | number | null | undefined) {
  if (id == null || id === '') return null
  const { data } = await supabaseAdmin.from(table).select('*').eq('id', id).maybeSingle()
  return data ?? null
}
