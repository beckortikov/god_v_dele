import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseAction, type OpGoal } from '@/lib/op-plan'
import { ACTIONS, GOALS, check, ensurePlan, nextPosition, ownedRow, participantIdOf, planError, readJson, requireUuid } from '../_lib'

export const dynamic = 'force-dynamic'

/**
 * POST ?participant_id=<uuid> { goal_id, title, indicator?, due_date?, owners?, priority?, price? } → { data: OpAction }
 */
export async function POST(req: Request) {
  try {
    const participantId = participantIdOf(req)
    const body = await readJson(req)
    const goalId = requireUuid(body.goal_id, 'goal_id')
    const fields = parseAction(body, false)
    const { plan } = await ensurePlan(participantId)
    await ownedRow<OpGoal>(GOALS, goalId, plan.id, 'Микро-цель')
    const position = await nextPosition(ACTIONS, plan.id, { col: 'goal_id', id: goalId })
    const { data, error } = await db.from(ACTIONS).insert({ plan_id: plan.id, goal_id: goalId, ...fields, status: 'open', position }).select('*').single()
    check(error)
    return NextResponse.json({ data })
  } catch (e) {
    return planError(e, 'add action')
  }
}
