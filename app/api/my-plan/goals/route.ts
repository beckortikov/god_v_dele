import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseTitle, type OpDirection } from '@/lib/op-plan'
import { DIRECTIONS, GOALS, check, ensurePlan, nextPosition, ownedRow, participantIdOf, planError, readJson, requireUuid } from '../_lib'

export const dynamic = 'force-dynamic'

/** POST ?participant_id=<uuid> { direction_id, title } → { data: OpGoal }: a new micro-goal at the end of the direction. */
export async function POST(req: Request) {
  try {
    const participantId = participantIdOf(req)
    const body = await readJson(req)
    const directionId = requireUuid(body.direction_id, 'direction_id')
    const title = parseTitle(body.title, 'Микро-цель')
    const { plan } = await ensurePlan(participantId)
    await ownedRow<OpDirection>(DIRECTIONS, directionId, plan.id, 'Направление')
    const position = await nextPosition(GOALS, plan.id, { col: 'direction_id', id: directionId })
    const { data, error } = await db.from(GOALS).insert({ plan_id: plan.id, direction_id: directionId, title, position }).select('*').single()
    check(error)
    return NextResponse.json({ data })
  } catch (e) {
    return planError(e, 'add goal')
  }
}
