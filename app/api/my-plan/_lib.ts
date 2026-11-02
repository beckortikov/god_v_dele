/**
 * Server-only helpers for the operational plan routes (/api/my-plan/…). Every route takes ?participant_id=…;
 * the auth policy pins a participant to their own id, and items are always looked up inside that participant's plan.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PlanInputError, type MyPlanData, type OpAction, type OpPlan } from '@/lib/op-plan'

export const PLANS = 'op_plans'
export const DIRECTIONS = 'op_directions'
export const GOALS = 'op_goals'
export const ACTIONS = 'op_actions'
export const EXCUSES = 'op_action_excuses'

export class PlanMigrationError extends Error {}
export class PlanBadRequest extends Error {}
export class PlanNotFound extends Error {}

type PgError = { code?: string; message?: string } | null

/** Throws a typed error for a failed query; a missing op_* table means migration 024 is not applied. */
export function check(error: PgError) {
  if (!error) return
  const msg = (error.message || '').toLowerCase()
  if (error.code === '42P01' || error.code === 'PGRST205' || (msg.includes('op_') && (msg.includes('does not exist') || msg.includes('could not find the table')))) {
    throw new PlanMigrationError()
  }
  throw new Error(error.message || 'Database error')
}

/** 503 for a missing migration (the client shows a hint), 400 for bad input, 404 for a foreign or deleted item. */
export function planError(e: unknown, context: string) {
  if (e instanceof PlanMigrationError) {
    return NextResponse.json(
      { error: 'migration_required', message: 'Операционный план ещё не подключён. Примените миграцию migrations/024_operational_plan.sql в Supabase (SQL Editor).' },
      { status: 503 }
    )
  }
  if (e instanceof PlanInputError || e instanceof PlanBadRequest) return NextResponse.json({ error: e.message }, { status: 400 })
  if (e instanceof PlanNotFound) return NextResponse.json({ error: e.message }, { status: 404 })
  console.error(`[my-plan] ${context}:`, e)
  return NextResponse.json({ error: (e as Error)?.message || 'Internal Server Error' }, { status: 500 })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function requireUuid(v: unknown, field: string): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new PlanBadRequest(`${field}: нужен UUID`)
  return v
}

export function participantIdOf(req: Request) {
  return requireUuid(new URL(req.url).searchParams.get('participant_id'), 'participant_id')
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PlanBadRequest('Нужен JSON-объект')
  return body as Record<string, unknown>
}

export async function findPlan(participantId: string): Promise<OpPlan | null> {
  const { data, error } = await db.from(PLANS).select('*').eq('participant_id', participantId).maybeSingle()
  check(error)
  return (data as OpPlan | null) ?? null
}

/** The participant's plan; it is created on the first write so «+ Действие» works on an empty plan too. */
export async function ensurePlan(participantId: string): Promise<{ plan: OpPlan; created: boolean }> {
  const found = await findPlan(participantId)
  if (found) return { plan: found, created: false }
  const { data: person, error: pErr } = await db.from('participants').select('id').eq('id', participantId).maybeSingle()
  if (pErr) throw new Error(pErr.message)
  if (!person) throw new PlanBadRequest('Участник не найден')
  const { data, error } = await db.from(PLANS).insert({ participant_id: participantId }).select('*').single()
  check(error)
  return { plan: data as OpPlan, created: true }
}

/** A row of `table` that belongs to this plan, or 404. */
export async function ownedRow<T>(table: string, id: string, planId: string, what: string): Promise<T> {
  const { data, error } = await db.from(table).select('*').eq('id', id).eq('plan_id', planId).maybeSingle()
  check(error)
  if (!data) throw new PlanNotFound(`${what} не найдено в вашем плане`)
  return data as T
}

/** Next position at the end of a list (rows of the plan, optionally of one parent). */
export async function nextPosition(table: string, planId: string, parent?: { col: string; id: string }) {
  let q = db.from(table).select('position').eq('plan_id', planId)
  if (parent) q = q.eq(parent.col, parent.id)
  const { data, error } = await q
  check(error)
  return ((data ?? []) as { position: number }[]).reduce((m, r) => Math.max(m, (r.position ?? 0) + 1), 0)
}

export async function loadPlan(participantId: string): Promise<MyPlanData> {
  const plan = await findPlan(participantId)
  if (!plan) return { plan: null, directions: [], goals: [], actions: [], excuses: [] }
  const rows = async (table: string, orderBy = 'position') => {
    const { data, error } = await db.from(table).select('*').eq('plan_id', plan.id).order(orderBy, { ascending: true })
    check(error)
    return data ?? []
  }
  const [directions, goals, actions, excuses] = await Promise.all([rows(DIRECTIONS), rows(GOALS), rows(ACTIONS), rows(EXCUSES, 'created_at')])
  return {
    plan,
    directions: directions as MyPlanData['directions'],
    goals: goals as MyPlanData['goals'],
    actions: (actions as MyPlanData['actions']).map(a => ({ ...a, owners: a.owners ?? [], price: Number(a.price) || 0 })),
    excuses: (excuses as MyPlanData['excuses']).map(e => ({ ...e, price: Number(e.price) || 0 })),
  }
}

/** The action `ctx.params.id` of the participant's plan (route context of /actions/[id]/…). */
export async function ownedAction(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = requireUuid((await ctx.params).id, 'id')
  const plan = await findPlan(participantIdOf(req))
  if (!plan) throw new PlanNotFound('План не найден')
  return { plan, row: await ownedRow<OpAction>(ACTIONS, id, plan.id, 'Действие') }
}
