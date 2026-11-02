import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { parseTitle, type OpDirection, type OpGoal } from '@/lib/op-plan'
import { DIRECTIONS, GOALS, PlanNotFound, check, findPlan, ownedRow, participantIdOf, planError, readJson, requireUuid } from '../../_lib'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function owned(req: Request, ctx: Ctx) {
  const id = requireUuid((await ctx.params).id, 'id')
  const plan = await findPlan(participantIdOf(req))
  if (!plan) throw new PlanNotFound('План не найден')
  return { plan, row: await ownedRow<OpGoal>(GOALS, id, plan.id, 'Микро-цель') }
}

/** PATCH ?participant_id=<uuid> { title?, direction_id? } → { data }: rename or move to another direction. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { plan, row } = await owned(req, ctx)
    const body = await readJson(req)
    const patch: Partial<OpGoal> = {}
    if ('title' in body) patch.title = parseTitle(body.title, 'Микро-цель')
    if ('direction_id' in body) {
      const directionId = requireUuid(body.direction_id, 'direction_id')
      await ownedRow<OpDirection>(DIRECTIONS, directionId, plan.id, 'Направление')
      patch.direction_id = directionId
    }
    const { data, error } = await db.from(GOALS).update(patch).eq('id', row.id).select('*').single()
    check(error)
    return NextResponse.json({ data })
  } catch (e) {
    return planError(e, 'edit goal')
  }
}

/** DELETE ?participant_id=<uuid>: the micro-goal with its actions and excuses. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { row } = await owned(req, ctx)
    const { error } = await db.from(GOALS).delete().eq('id', row.id)
    check(error)
    await logAudit(req, { table: GOALS, recordId: row.id, action: 'delete', summary: `Операционный план: удалена микро-цель «${row.title}»`, before: row })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return planError(e, 'delete goal')
  }
}
