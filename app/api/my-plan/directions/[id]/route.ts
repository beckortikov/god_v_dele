import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { parseTitle, type OpDirection } from '@/lib/op-plan'
import { DIRECTIONS, PlanNotFound, check, findPlan, ownedRow, participantIdOf, planError, readJson, requireUuid } from '../../_lib'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function owned(req: Request, ctx: Ctx) {
  const id = requireUuid((await ctx.params).id, 'id')
  const plan = await findPlan(participantIdOf(req))
  if (!plan) throw new PlanNotFound('План не найден')
  return ownedRow<OpDirection>(DIRECTIONS, id, plan.id, 'Направление')
}

/** PATCH ?participant_id=<uuid> { title } → { data }: rename. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const row = await owned(req, ctx)
    const title = parseTitle((await readJson(req)).title, 'Направление')
    const { data, error } = await db.from(DIRECTIONS).update({ title }).eq('id', row.id).select('*').single()
    check(error)
    return NextResponse.json({ data })
  } catch (e) {
    return planError(e, 'rename direction')
  }
}

/** DELETE ?participant_id=<uuid>: the direction with its micro-goals, actions and excuses. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const row = await owned(req, ctx)
    const { error } = await db.from(DIRECTIONS).delete().eq('id', row.id)
    check(error)
    await logAudit(req, { table: DIRECTIONS, recordId: row.id, action: 'delete', summary: `Операционный план: удалено направление «${row.title}»`, before: row })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return planError(e, 'delete direction')
  }
}
