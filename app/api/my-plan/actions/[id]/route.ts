import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { parseAction, type OpGoal } from '@/lib/op-plan'
import { ACTIONS, GOALS, check, ownedAction, ownedRow, planError, readJson, requireUuid } from '../../_lib'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** PATCH ?participant_id=<uuid> { any of: goal_id, title, indicator, due_date, owners, priority, price } → { data } */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { plan, row } = await ownedAction(req, ctx)
    const body = await readJson(req)
    const patch: Record<string, unknown> = { ...parseAction(body, true), updated_at: new Date().toISOString() }
    if ('goal_id' in body) {
      const goalId = requireUuid(body.goal_id, 'goal_id')
      await ownedRow<OpGoal>(GOALS, goalId, plan.id, 'Микро-цель')
      patch.goal_id = goalId
    }
    const { data, error } = await db.from(ACTIONS).update(patch).eq('id', row.id).select('*').single()
    check(error)
    return NextResponse.json({ data })
  } catch (e) {
    return planError(e, 'edit action')
  }
}

/** DELETE ?participant_id=<uuid>: the action and its excuses. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { row } = await ownedAction(req, ctx)
    const { error } = await db.from(ACTIONS).delete().eq('id', row.id)
    check(error)
    await logAudit(req, { table: ACTIONS, recordId: row.id, action: 'delete', summary: `Операционный план: удалено действие «${row.title}»`, before: row })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return planError(e, 'delete action')
  }
}
