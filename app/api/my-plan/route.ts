import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { parseTitle, parseVision } from '@/lib/op-plan'
import { DIRECTIONS, PLANS, PlanBadRequest, check, ensurePlan, loadPlan, nextPosition, participantIdOf, planError, readJson } from './_lib'

export const dynamic = 'force-dynamic'

/** GET ?participant_id=<uuid> → { data: MyPlanData } (plan null while the participant has not started one). */
export async function GET(req: Request) {
  try {
    return NextResponse.json({ data: await loadPlan(participantIdOf(req)) })
  } catch (e) {
    return planError(e, 'load')
  }
}

/**
 * PUT ?participant_id=<uuid> { vision?, vision_date?, directions?: string[] }
 * Saves the vision, creating the plan if needed. `directions` adds those that the plan does not have yet
 * (the first-run setup sends the ones picked from the template).
 */
export async function PUT(req: Request) {
  try {
    const participantId = participantIdOf(req)
    const body = await readJson(req)
    // Everything is checked before the plan is created, so bad input leaves nothing behind
    const vision = 'vision' in body || 'vision_date' in body ? parseVision(body) : null
    let titles: string[] = []
    if (body.directions !== undefined) {
      if (!Array.isArray(body.directions)) throw new PlanBadRequest('directions: нужен список названий')
      // «Стратегия» and «стратегия» are one direction
      const seen = new Set<string>()
      titles = body.directions
        .map(t => parseTitle(t, 'Направление'))
        .filter(t => !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()))
        .slice(0, 30)
    }

    const { plan, created } = await ensurePlan(participantId)
    if (vision) {
      const { error } = await db.from(PLANS).update({ ...vision, updated_at: new Date().toISOString() }).eq('id', plan.id)
      check(error)
    }
    if (titles.length) {
      const { data: have, error } = await db.from(DIRECTIONS).select('title').eq('plan_id', plan.id)
      check(error)
      const existing = new Set(((have ?? []) as { title: string }[]).map(d => d.title.toLowerCase()))
      const fresh = titles.filter(t => !existing.has(t.toLowerCase()))
      if (fresh.length) {
        const start = await nextPosition(DIRECTIONS, plan.id)
        const { error: insErr } = await db.from(DIRECTIONS).insert(fresh.map((title, i) => ({ plan_id: plan.id, title, position: start + i })))
        check(insErr)
      }
    }

    if (created) await logAudit(req, { table: PLANS, recordId: plan.id, action: 'create', summary: 'Создан операционный план' })
    return NextResponse.json({ data: await loadPlan(participantId) })
  } catch (e) {
    return planError(e, 'save')
  }
}
