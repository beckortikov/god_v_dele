export interface Program {
  id: string
  name: string
  price_per_month: number
  duration_months: number
}

export interface Participant {
  id: string
  name: string
  email?: string
  phone?: string
  program_id: string
  start_date: string
  status: 'active' | 'completed' | 'archived'
  tariff?: number
  program?: Program
}

export interface MonthlyPayment {
  id: string
  month_number: number
  year: number
  /** Plan for this month as stored by the API (`monthly_payments.plan_amount`). */
  plan_amount?: number | null
  /** @deprecated Not returned by the API; use `paymentPlan()`. Kept so old callers compile. */
  amount?: number
  fact_amount: number
  status: string
  participant_id: string
  payment_month?: string
  paid_date?: string | null
  notes?: string
}

export const PARTICIPANT_STATUS: Record<Participant['status'], { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  active: { label: 'Активный', variant: 'default' },
  completed: { label: 'Завершено', variant: 'secondary' },
  archived: { label: 'Архив', variant: 'outline' },
}

/** Monthly plan for a participant: individual tariff, otherwise the program price. */
export const monthlyTariff = (p: Participant) => p.tariff || p.program?.price_per_month || 0

/**
 * Plan of one monthly payment row: the row's own `plan_amount`; the participant's
 * tariff (then program price) only when the row has no plan stored.
 */
export function paymentPlan(payment: MonthlyPayment | undefined, participant: Participant) {
  const stored = payment?.plan_amount
  return stored != null ? Number(stored) || 0 : monthlyTariff(participant)
}

/** Money compared in whole cents, so 999.9999999999999 (TJS→USD conversion) counts as 1000. */
const toCents = (v: number | null | undefined) => Math.round((Number(v) || 0) * 100)

/** Fact covers the plan (to the cent). A zero plan is covered by definition. */
export const isFullyPaid = (fact: number | null | undefined, plan: number) => toCents(fact) >= toCents(plan)

/**
 * Only active participants are chased for money. Archived and completed ones are
 * shown neutrally: no «Просрочено» / «Частично» flags and not in those counts.
 */
export const isBillable = (p: Participant) => p.status === 'active'

const ym = (year: number, month: number) => year * 12 + (month - 1) // month 1–12 → absolute month index

export interface OverdueMonth {
  year: number
  month: number
  plan: number
  fact: number
  /** `missing`: no payment row for a month that should have been billed; `underpaid`: fact < plan. */
  reason: 'missing' | 'underpaid'
}

/**
 * Past months (strictly before the current month) that are not fully paid.
 *
 * A month is considered billed when either
 *  - it has a payment row (whatever the program duration), or
 *  - it falls inside the program: from the start month for `duration_months`
 *    months (no limit when the duration is unknown).
 * A billed month is overdue when it has no row (plan = tariff) or fact < plan
 * (compared in cents). Months with a zero plan are never overdue.
 * Non-active participants have no overdue months.
 *
 * `payments` may be all payments or only this participant's.
 */
export function overdueMonths(participant: Participant, payments: MonthlyPayment[], now = new Date()): OverdueMonth[] {
  if (!isBillable(participant) || !participant.start_date) return []
  const start = new Date(participant.start_date)
  if (Number.isNaN(start.getTime())) return []

  const current = ym(now.getFullYear(), now.getMonth() + 1)
  const first = ym(start.getFullYear(), start.getMonth() + 1)
  const duration = participant.program?.duration_months || 0
  const programEnd = duration > 0 ? first + duration : Infinity // exclusive

  const byMonth = new Map<number, MonthlyPayment>()
  for (const p of payments) {
    if (p.participant_id !== participant.id) continue
    const k = ym(p.year, p.month_number)
    if (!byMonth.has(k)) byMonth.set(k, p)
  }

  const months = new Set<number>()
  for (let k = first; k < Math.min(current, programEnd); k++) months.add(k)
  for (const k of byMonth.keys()) if (k < current) months.add(k)

  const out: OverdueMonth[] = []
  for (const k of Array.from(months).sort((a, b) => a - b)) {
    const row = byMonth.get(k)
    const plan = paymentPlan(row, participant)
    const fact = Number(row?.fact_amount) || 0
    if (toCents(plan) <= 0 || isFullyPaid(fact, plan)) continue
    out.push({ year: Math.floor(k / 12), month: (k % 12) + 1, plan, fact, reason: row ? 'underpaid' : 'missing' })
  }
  return out
}

/** Has at least one unpaid or underpaid past month (see `overdueMonths`). */
export function checkOverdue(participant: Participant, payments: MonthlyPayment[]) {
  return overdueMonths(participant, payments).length > 0
}

/** Active participant who paid something, but less than the plan, in any month. */
export function checkPartial(participant: Participant, payments: MonthlyPayment[]) {
  if (!isBillable(participant)) return false
  return payments.some(p => {
    if (p.participant_id !== participant.id) return false
    const fact = Number(p.fact_amount) || 0
    return fact > 0 && !isFullyPaid(fact, paymentPlan(p, participant))
  })
}

/** The current month's row is covered in full (by amount; `status` is not reliable). */
export function checkPaidThisMonth(participant: Participant, payments: MonthlyPayment[], now = new Date()) {
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const payment = payments.find(
    pay => pay.participant_id === participant.id && pay.month_number === currentMonth && pay.year === currentYear
  )
  if (!payment) return false
  const fact = Number(payment.fact_amount) || 0
  return fact > 0 && isFullyPaid(fact, paymentPlan(payment, participant))
}

/** Status of one monthly payment row, as shown in the history. */
export function paymentRowStatus(payment: MonthlyPayment, participant: Participant) {
  const plan = paymentPlan(payment, participant)
  const fact = Number(payment.fact_amount) || 0
  if (fact > 0 && isFullyPaid(fact, plan)) return { label: 'Оплачен', variant: 'success' as const }
  if (fact > 0) return { label: 'Частично', variant: 'warning' as const }
  // Past unpaid months are overdue only while the participant is active
  const now = new Date()
  const isPast = ym(payment.year, payment.month_number) < ym(now.getFullYear(), now.getMonth() + 1)
  if (isBillable(participant) && toCents(plan) > 0 && (isPast || payment.status === 'overdue'))
    return { label: 'Просрочен', variant: 'destructive' as const }
  return { label: 'Ожидается', variant: 'secondary' as const }
}

export interface ParticipantSummary {
  overdue: boolean
  partial: boolean
  paidThisMonth: boolean
  /** Rows paid in full / all rows. */
  paidCount: number
  totalCount: number
  collected: number
  /** Overdue past months: no row at all vs a row with fact < plan. */
  overdueMissing: number
  overdueUnderpaid: number
  /** Sum of plan − fact over the overdue months. */
  overdueDebt: number
}

export function summarize(participant: Participant, own: MonthlyPayment[]): ParticipantSummary {
  const months = overdueMonths(participant, own)
  return {
    overdue: months.length > 0,
    partial: checkPartial(participant, own),
    paidThisMonth: checkPaidThisMonth(participant, own),
    paidCount: own.filter(p => {
      const fact = Number(p.fact_amount) || 0
      return fact > 0 && isFullyPaid(fact, paymentPlan(p, participant))
    }).length,
    totalCount: own.length,
    collected: own.reduce((acc, cur) => acc + (Number(cur.fact_amount) || 0), 0),
    overdueMissing: months.filter(m => m.reason === 'missing').length,
    overdueUnderpaid: months.filter(m => m.reason === 'underpaid').length,
    overdueDebt: months.reduce((s, m) => s + (m.plan - m.fact), 0),
  }
}

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}
