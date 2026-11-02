import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { todayISO } from '@/lib/format'
import { byDeadline, planSummary, type OpAction, type OpExcuse, type OpPlan, type PlanSummary } from '@/lib/op-plan'
import { ACTIONS, EXCUSES, PLANS, check, planError, requireUuid } from '../my-plan/_lib'

export const dynamic = 'force-dynamic'

export interface PlanOverviewRow {
  participant: { id: string; name: string; group_id: string | null }
  plan: Pick<OpPlan, 'id' | 'vision' | 'vision_date' | 'updated_at'> | null
  summary: PlanSummary | null
  /** The nearest open deadline (an overdue one first). */
  next: { title: string; due_date: string } | null
}

export interface PlansOverview {
  rows: PlanOverviewRow[]
  groups: { id: string; name: string }[]
}

/**
 * GET ?program_id=<uuid> → { data: PlansOverview }: every active participant of the program (поток) with
 * a summary of their operational plan, for the curators (admin, wheels_manager, manager).
 */
export async function GET(req: Request) {
  try {
    const programId = requireUuid(new URL(req.url).searchParams.get('program_id'), 'program_id')
    const { data: people, error: pErr } = await db.from('participants').select('id, name, group_id, status').eq('program_id', programId)
    if (pErr) throw new Error(pErr.message)
    const active = ((people ?? []) as { id: string; name: string; group_id: string | null; status: string | null }[])
      .filter(p => p.status !== 'archived' && p.status !== 'completed')
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    // Groups come from migration 018; without them every participant is simply «без группы»
    const { data: groupRows } = await db.from('participant_groups').select('id, name').eq('program_id', programId)

    let plans: OpPlan[] = []
    let actions: OpAction[] = []
    let excuses: OpExcuse[] = []
    if (active.length) {
      const { data, error } = await db.from(PLANS).select('*').in('participant_id', active.map(p => p.id))
      check(error)
      plans = (data ?? []) as OpPlan[]
    }
    if (plans.length) {
      const ids = plans.map(p => p.id)
      const [a, e] = await Promise.all([db.from(ACTIONS).select('*').in('plan_id', ids), db.from(EXCUSES).select('*').in('plan_id', ids)])
      check(a.error)
      check(e.error)
      actions = ((a.data ?? []) as OpAction[]).map(x => ({ ...x, price: Number(x.price) || 0 }))
      excuses = ((e.data ?? []) as OpExcuse[]).map(x => ({ ...x, price: Number(x.price) || 0 }))
    }

    const today = todayISO()
    const rows: PlanOverviewRow[] = active.map(p => {
      const plan = plans.find(x => x.participant_id === p.id) ?? null
      const mine = plan ? actions.filter(a => a.plan_id === plan.id) : []
      const next = byDeadline(mine).find(a => a.due_date)
      return {
        participant: { id: p.id, name: p.name, group_id: p.group_id ?? null },
        plan: plan && { id: plan.id, vision: plan.vision, vision_date: plan.vision_date, updated_at: plan.updated_at },
        summary: plan ? planSummary({ actions: mine, excuses: excuses.filter(e => e.plan_id === plan.id) }, today) : null,
        next: next ? { title: next.title, due_date: next.due_date! } : null,
      }
    })
    return NextResponse.json({ data: { rows, groups: (groupRows ?? []) as PlansOverview['groups'] } satisfies PlansOverview })
  } catch (e) {
    return planError(e, 'overview')
  }
}
