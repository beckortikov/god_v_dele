import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseTitle } from '@/lib/op-plan'
import { DIRECTIONS, check, ensurePlan, nextPosition, participantIdOf, planError, readJson } from '../_lib'

export const dynamic = 'force-dynamic'

/** POST ?participant_id=<uuid> { title } → { data: OpDirection }: a new direction at the end of the plan. */
export async function POST(req: Request) {
  try {
    const participantId = participantIdOf(req)
    const title = parseTitle((await readJson(req)).title, 'Направление')
    const { plan } = await ensurePlan(participantId)
    const position = await nextPosition(DIRECTIONS, plan.id)
    const { data, error } = await db.from(DIRECTIONS).insert({ plan_id: plan.id, title, position }).select('*').single()
    check(error)
    return NextResponse.json({ data })
  } catch (e) {
    return planError(e, 'add direction')
  }
}
