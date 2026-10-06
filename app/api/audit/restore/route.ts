import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { getActor, logAudit } from '@/lib/audit'
import { RESTORABLE_TABLES, fieldLabel, tableLabel } from '@/lib/audit-labels'
import { isMissingTableError } from '../_server'

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

/** Turns a Postgres insert error into a message an accountant can act on. */
function explainInsertError(error: any, table: string): { message: string; status: number } {
  const code = String(error?.code ?? '')
  const details = String(error?.details ?? '')
  const message = String(error?.message ?? '')

  if (code === '23505') {
    if (/_pkey/.test(message) || /\(id\)=/.test(details)) {
      return { message: 'Эта запись уже существует — её восстановили раньше или создали заново.', status: 409 }
    }
    const key = details.match(/Key \(([^)]+)\)=/)?.[1]
    const fields = key ? key.split(',').map(f => `«${fieldLabel(f.trim())}»`).join(', ') : ''
    return {
      message: `В разделе «${tableLabel(table)}» уже есть запись с теми же значениями${fields ? ` (${fields})` : ''}. Удалите или измените её, затем повторите.`,
      status: 409,
    }
  }

  if (code === '23503') {
    // Key (participant_id)=(…) is not present in table "participants".
    const column = details.match(/Key \(([^)]+)\)=/)?.[1]
    const parent = details.match(/table "([^"]+)"/)?.[1]
    const what = parent ? `«${tableLabel(parent)}»` : column ? `«${fieldLabel(column)}»` : 'связанная запись'
    return {
      message: `Связанная запись в разделе ${what} удалена. Сначала восстановите её из корзины, затем повторите.`,
      status: 409,
    }
  }

  if (code === '42703' || code === 'PGRST204') {
    return { message: 'Структура таблицы изменилась с момента удаления — восстановить автоматически не получится.', status: 409 }
  }

  if (code === '23502' || code === '23514') {
    return { message: `Запись не проходит текущие проверки базы: ${message}`, status: 409 }
  }

  return { message: message || 'Не удалось восстановить запись', status: 500 }
}

/**
 * POST /api/audit/restore { id } — re-inserts the row saved in a `delete`
 * entry of the журнал, marks the entry as restored and logs a `restore` entry.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const id = body?.id
    if (!id) return fail('Не указана запись журнала', 400)

    const { data: entry, error: readError } = await supabaseAdmin.from('audit_log').select('*').eq('id', id).maybeSingle()
    if (readError) {
      if (isMissingTableError(readError)) return NextResponse.json({ error: 'migration_required' }, { status: 503 })
      throw readError
    }
    if (!entry) return fail('Запись журнала не найдена', 404)
    if (entry.action !== 'delete') return fail('Восстановить можно только удалённую запись', 400)
    if (entry.restored_at) {
      return fail(`Уже восстановлено${entry.restored_by ? ` (${entry.restored_by})` : ''}`, 409)
    }
    if (!RESTORABLE_TABLES.has(entry.table_name)) {
      return fail(`Записи раздела «${tableLabel(entry.table_name)}» нельзя восстановить из корзины`, 400)
    }
    const row = entry.before
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return fail('В журнале нет сохранённой копии записи', 400)
    }

    const { data: restored, error: insertError } = await supabaseAdmin
      .from(entry.table_name)
      .insert([row])
      .select()
      .maybeSingle()

    if (insertError) {
      const { message, status } = explainInsertError(insertError, entry.table_name)
      return fail(message, status)
    }

    const actor = getActor(req)
    const restoredBy = actor.name || actor.id || null
    // Guard against a double click: only the first restore marks the entry
    await supabaseAdmin
      .from('audit_log')
      .update({ restored_at: new Date().toISOString(), restored_by: restoredBy })
      .eq('id', id)
      .is('restored_at', null)

    await logAudit(req, {
      table: entry.table_name,
      recordId: entry.record_id ?? (row as any).id,
      action: 'restore',
      summary: `Восстановлено: ${entry.summary || tableLabel(entry.table_name)}`,
      after: restored ?? row,
    })

    return NextResponse.json({ data: restored ?? row })
  } catch (error: any) {
    console.error('Error restoring from audit log:', error)
    return fail(error.message || 'Не удалось восстановить запись', 500)
  }
}
