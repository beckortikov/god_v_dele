/**
 * Server helpers shared by /api/payments/* and /api/monthly-payments.
 */
import { supabaseAdmin } from '@/lib/supabase-client'
import { logAudit } from '@/lib/audit'
import { monthLabel, rowMoney } from '@/lib/audit-labels'
import { MONTHS_RU } from '@/lib/format'
import { roundMoney } from '@/lib/money'
import { monthStatus, tariffOf } from '@/lib/payment-schedule'
import { LEDGER_TABLE } from '@/lib/payments-ledger'

export interface ParticipantForPlan {
  id: string
  name: string
  status: string | null
  start_date: string | null
  tariff: number | null
  program_id: string
  program: { id: string; name: string | null; price_per_month: number | null; duration_months: number | null } | null
}

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

const PARTICIPANT_COLS = 'id, name, status, start_date, tariff, program_id, program:programs(id, name, price_per_month, duration_months)'

export async function loadParticipants(ids?: string[] | null): Promise<ParticipantForPlan[]> {
  let q = supabaseAdmin.from('participants').select(PARTICIPANT_COLS)
  if (ids) q = q.in('id', ids)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map((p: any) => ({ ...p, program: one(p.program) }))
}

/** Monthly plan for a new schedule line: participant tariff, else the program price. */
export const defaultPlan = (p: ParticipantForPlan) => roundMoney(tariffOf(p))

/** «Оплата: Имя, сентябрь 2026 — $500» (or «5 000 TJS»). */
export const receiptSummary = (name: string, tx: any, month: number, year: number) =>
  `Оплата: ${name || 'участник'}, ${monthLabel(month, year)} — ${rowMoney(tx, 'amount_usd')}`

/** «График: Имя, сентябрь 2026 — план $1 000» */
export const planSummary = (name: string, row: any) =>
  `График: ${name || 'участник'}, ${monthLabel(row?.month_number, row?.year)} — план ${rowMoney({ amount: row?.plan_amount }, 'amount')}`

/** A new schedule line: nothing received yet. */
export function scheduleRow(p: ParticipantForPlan, month: number, year: number, plan: number) {
  return {
    participant_id: p.id,
    program_id: p.program_id,
    month_number: month,
    payment_month: MONTHS_RU[month - 1],
    year,
    plan_amount: roundMoney(plan),
    fact_amount: 0,
    status: 'pending',
  }
}

/**
 * The monthly row for participant + month, created when missing (plan = the
 * participant's tariff or the program price). An existing plan is never
 * overwritten. Safe against two requests creating the same month at once.
 */
export async function findOrCreateMonth(
  req: Request,
  p: ParticipantForPlan,
  month: number,
  year: number
): Promise<{ row: any; created: boolean }> {
  const find = () =>
    supabaseAdmin
      .from('monthly_payments')
      .select('*')
      .eq('participant_id', p.id)
      .eq('month_number', month)
      .eq('year', year)
      .maybeSingle()

  const existing = await find()
  if (existing.error) throw existing.error
  if (existing.data) return { row: existing.data, created: false }

  const { data: inserted, error } = await supabaseAdmin
    .from('monthly_payments')
    .upsert([scheduleRow(p, month, year, defaultPlan(p))], { onConflict: 'participant_id,month_number,year', ignoreDuplicates: true })
    .select('*')
  if (error) throw error
  if (inserted?.[0]) {
    await logAudit(req, { table: 'monthly_payments', recordId: inserted[0].id, action: 'create', summary: planSummary(p.name, inserted[0]), after: inserted[0] })
    return { row: inserted[0], created: true }
  }
  // Someone else created it a moment ago
  const again = await find()
  if (again.error) throw again.error
  if (!again.data) throw new Error('Не удалось создать месяц графика')
  return { row: again.data, created: false }
}

/** Receipts of the given monthly rows (raw DB rows, for the корзина). Never throws. */
export async function receiptsOfMonths(monthlyIds: string[]): Promise<any[]> {
  if (!monthlyIds.length) return []
  try {
    const { data } = await supabaseAdmin.from(LEDGER_TABLE).select('*').in('monthly_payment_id', monthlyIds)
    return data ?? []
  } catch {
    return []
  }
}

/** Plan change of an existing row: new plan and the status that follows from it. */
export function planUpdate(row: any, plan: number) {
  const fact = Number(row?.fact_amount) || 0
  // Keep the stored status of an untouched month (e.g. a legacy «paid» on a zero fact)
  const status = fact > 0 || row?.status === 'partial' || row?.status === 'paid' ? monthStatus(fact, plan) : row?.status || 'pending'
  return { plan_amount: roundMoney(plan), status }
}
