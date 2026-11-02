import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { todayISO } from '@/lib/format'
import { parseResult } from '@/lib/op-plan'
import { ACTIONS, EXCUSES, check, ownedAction, planError, readJson } from '../../../_lib'

export const dynamic = 'force-dynamic'

/**
 * POST ?participant_id=<uuid>
 *   { type: 'done', note?, link? }        → сделано
 *   { type: 'excuse', reason, new_due? }  → отмазка: цена слова отдана, срок переносится (или снимается)
 *   { type: 'reopen' }                    → вернуть в работу
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { plan, row } = await ownedAction(req, ctx)
    const input = parseResult(await readJson(req), todayISO())
    const now = new Date().toISOString()

    if (input.type === 'done') {
      const { error } = await db.from(ACTIONS).update({ status: 'done', result_note: input.note, result_link: input.link, done_at: now, updated_at: now }).eq('id', row.id)
      check(error)
      await logAudit(req, { table: ACTIONS, recordId: row.id, action: 'update', summary: `Операционный план: «${row.title}» — сделано` })
    } else if (input.type === 'excuse') {
      const { error } = await db.from(EXCUSES).insert({ plan_id: plan.id, action_id: row.id, reason: input.reason, price: Number(row.price) || 0, missed_due: row.due_date, new_due: input.new_due })
      check(error)
      const { error: upErr } = await db.from(ACTIONS).update({ status: 'open', due_date: input.new_due, done_at: null, updated_at: now }).eq('id', row.id)
      check(upErr)
      await logAudit(req, { table: EXCUSES, recordId: row.id, action: 'create', summary: `Операционный план: отмазка по «${row.title}»` })
    } else {
      const { error } = await db.from(ACTIONS).update({ status: 'open', done_at: null, updated_at: now }).eq('id', row.id)
      check(error)
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return planError(e, 'result')
  }
}
