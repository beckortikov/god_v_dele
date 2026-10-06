/**
 * Аналитика: pure aggregation over GET data (participants, monthly payments,
 * programs, expenses). Used by app/api/analytics/route.ts; no I/O here.
 *
 * Conventions
 * - Money is USD: `fact_amount` / `plan_amount` / `expenses.amount` are stored in
 *   USD (TJS originals live in `original_amount`).
 * - A month is identified by year + month (never the month number alone). Internally
 *   it is an absolute index `year * 12 + (month - 1)`.
 * - Plan of a payment row = `plan_amount`; the participant's tariff (then program
 *   price) only when `plan_amount` is null (see `paymentPlan`).
 * - Money is compared in whole cents, so 999.9999999999999 counts as 1000.
 * - The program filter selects participants by their current `program_id`; their
 *   payments follow them. Expenses are filtered by their own `program_id`.
 */

import {
  overdueMonths,
  paymentPlan,
  type MonthlyPayment,
  type Participant,
} from '@/components/participants/types'

// ── Input rows (only the columns the API selects) ─────────────────────────────

export interface AnalyticsParticipant extends Participant {
  updated_at?: string | null
}

export interface AnalyticsPayment {
  participant_id: string
  year: number
  month_number: number
  plan_amount: number | null
  fact_amount: number | null
}

export interface AnalyticsExpense {
  amount: number
  expense_date: string
  program_id: string | null
}

export interface AnalyticsInput {
  participants: AnalyticsParticipant[]
  payments: AnalyticsPayment[]
  programs: { id: string; name: string }[]
  expenses: AnalyticsExpense[]
  programId: string // 'all' or a program id
  now: Date
}

// ── Output ────────────────────────────────────────────────────────────────────

export const AGING_BUCKETS = [
  { key: 'd0_30', label: '0–30 дней', max: 30 },
  { key: 'd31_60', label: '31–60 дней', max: 60 },
  { key: 'd61_90', label: '61–90 дней', max: 90 },
  { key: 'd90', label: 'Больше 90 дней', max: Infinity },
] as const

export interface AgingRow {
  id: string
  name: string
  program: string
  /** Debt per bucket, same order as AGING_BUCKETS. */
  buckets: number[]
  total: number
  /** Overdue months: without a payment row / with fact < plan. */
  missing: number
  underpaid: number
  /** Age in days of the oldest overdue month. */
  oldestDays: number
}

export interface AgingProgramRow {
  id: string
  name: string
  participants: number
  buckets: number[]
  total: number
  months: number
}

export interface CohortRow {
  key: string // 'YYYY-MM'
  year: number
  month: number
  size: number
  /** Still active N months after the start month (N = COHORT_OFFSETS[i]); null = not observable yet. */
  cells: (number | null)[]
}

export const COHORT_OFFSETS = [1, 2, 3, 6, 9, 12] as const

export interface ChurnMonth {
  key: string
  year: number
  month: number
  /** Active at the start of the month (joined earlier, not yet left). */
  activeAtStart: number
  joined: number
  /** Moved to archive during the month (churn). */
  archived: number
  /** Moved to «completed» during the month (finished, not churn). */
  completed: number
  /** archived / activeAtStart, null when nobody was active. */
  churnRate: number | null
}

export interface RevenueRow {
  id: string
  name: string
  program: string
  status: Participant['status']
  ltv: number
  /** Payment rows (billed months) of this participant. */
  months: number
  /** ltv / months; null without rows. */
  avgMonthly: number | null
}

export interface CollectionMonth {
  key: string
  year: number
  month: number
  billed: number
  paid: number
  /** paid / billed, null when nothing was billed. Can exceed 1 (overpayment). */
  rate: number | null
  rows: number
  /** Active participants expected to be billed this month but without a payment row. */
  missing: number
}

export interface AnalyticsData {
  asOf: string
  programId: string
  programs: { id: string; name: string }[]
  participantsTotal: number
  aging: {
    buckets: { key: string; label: string; amount: number; months: number; participants: number }[]
    total: number
    months: number
    missingMonths: number
    underpaidMonths: number
    participants: AgingRow[]
    programs: AgingProgramRow[]
  }
  retention: {
    programs: { id: string; name: string; active: number; completed: number; archived: number; total: number }[]
    totals: { active: number; completed: number; archived: number; total: number }
    cohorts: CohortRow[]
    churn: ChurnMonth[]
  }
  revenue: {
    totalPaid: number
    rows: number
    /** Σ fact / Σ payment rows: average paid per billed participant-month. */
    avgMonthly: number | null
    /** Mean and median LTV over participants with at least one payment > 0. */
    avgLtv: number | null
    medianLtv: number | null
    paying: number
    withoutPayments: number
    /** Expenses (no event) in months that have payment rows / Σ payment rows. */
    costPerMonth: number | null
    distribution: { from: number; to: number; count: number }[]
    participants: RevenueRow[]
  }
  collection: {
    months: CollectionMonth[]
    billed: number
    paid: number
    rate: number | null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const idx = (year: number, month: number) => year * 12 + (month - 1)
const fromIdx = (k: number) => ({ year: Math.floor(k / 12), month: (k % 12) + 1 })
const keyOf = (k: number) => {
  const { year, month } = fromIdx(k)
  return `${year}-${String(month).padStart(2, '0')}`
}
/** Month index of an ISO date/timestamp string, read from its text (no timezone shift). */
const idxOfIso = (iso: string | null | undefined) => {
  if (!iso || iso.length < 7) return null
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  return Number.isFinite(y) && m >= 1 && m <= 12 ? idx(y, m) : null
}
const num = (v: unknown) => Number(v) || 0
const DAY = 86_400_000

/**
 * Days a month is overdue: from the end of the billed month (the first day of the
 * next month, local midnight) to `now`.
 */
export const daysPastMonthEnd = (year: number, month: number, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - new Date(year, month, 1).getTime()) / DAY))

const bucketOf = (days: number) => AGING_BUCKETS.findIndex(b => days <= b.max)

/** Exit month of a participant who is no longer active; `updated_at` approximates it. */
const exitIdx = (p: AnalyticsParticipant) => (p.status === 'active' ? null : idxOfIso(p.updated_at))

function median(values: number[]) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** A "nice" bin width so that the distribution has at most ~8 bins. */
function binWidth(max: number) {
  for (const w of [50, 100, 250, 500, 1000, 2000, 2500, 5000, 10000, 25000]) if (max / w <= 8) return w
  return Math.ceil(max / 8 / 10000) * 10000
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function computeAnalytics(input: AnalyticsInput): AnalyticsData {
  const { programs, now } = input
  const byProgram = input.programId !== 'all'
  const programName = new Map(programs.map(p => [p.id, p.name]))
  const nameOfProgram = (p: Participant) => p.program?.name || programName.get(p.program_id) || 'Без программы'

  const participants = byProgram ? input.participants.filter(p => p.program_id === input.programId) : input.participants
  const ids = new Set(participants.map(p => p.id))
  const payments = input.payments.filter(p => ids.has(p.participant_id))
  const expenses = byProgram ? input.expenses.filter(e => e.program_id === input.programId) : input.expenses

  const paymentsBy = new Map<string, AnalyticsPayment[]>()
  for (const p of payments) {
    const list = paymentsBy.get(p.participant_id)
    if (list) list.push(p)
    else paymentsBy.set(p.participant_id, [p])
  }
  const asMonthly = (rows: AnalyticsPayment[]): MonthlyPayment[] =>
    rows.map(r => ({
      id: '',
      participant_id: r.participant_id,
      year: r.year,
      month_number: r.month_number,
      plan_amount: r.plan_amount,
      fact_amount: num(r.fact_amount),
      status: '',
    }))

  const currentIdx = idx(now.getFullYear(), now.getMonth() + 1)

  // ── 1. Debt aging ───────────────────────────────────────────────────────────
  // Overdue months come from the same rule as «Просрочено» on the participants
  // page (`overdueMonths`): active participants only; a past month is billed when
  // it has a row or lies inside the program duration; it is overdue when it has
  // no row (debt = tariff) or fact < plan (debt = plan − fact). Each month's debt
  // goes to the bucket of its age, counted from the end of that month.
  const agingRows: AgingRow[] = []
  const bucketTotals = AGING_BUCKETS.map(() => ({ amount: 0, months: 0, participants: new Set<string>() }))
  for (const p of participants) {
    const months = overdueMonths(p, asMonthly(paymentsBy.get(p.id) || []), now)
    if (!months.length) continue
    const row: AgingRow = {
      id: p.id,
      name: p.name,
      program: nameOfProgram(p),
      buckets: AGING_BUCKETS.map(() => 0),
      total: 0,
      missing: 0,
      underpaid: 0,
      oldestDays: 0,
    }
    for (const m of months) {
      const debt = m.plan - m.fact
      const days = daysPastMonthEnd(m.year, m.month, now)
      const b = bucketOf(days)
      row.buckets[b] += debt
      row.total += debt
      row.oldestDays = Math.max(row.oldestDays, days)
      if (m.reason === 'missing') row.missing++
      else row.underpaid++
      bucketTotals[b].amount += debt
      bucketTotals[b].months++
      bucketTotals[b].participants.add(p.id)
    }
    agingRows.push(row)
  }
  agingRows.sort((a, b) => b.total - a.total || b.oldestDays - a.oldestDays)

  const agingPrograms = new Map<string, AgingProgramRow>()
  for (const r of agingRows) {
    const p = participants.find(x => x.id === r.id)!
    const key = p.program_id || 'none'
    const g =
      agingPrograms.get(key) ??
      ({ id: key, name: r.program, participants: 0, buckets: AGING_BUCKETS.map(() => 0), total: 0, months: 0 } as AgingProgramRow)
    g.participants++
    r.buckets.forEach((v, i) => (g.buckets[i] += v))
    g.total += r.total
    g.months += r.missing + r.underpaid
    agingPrograms.set(key, g)
  }

  // ── 2. Retention / churn ────────────────────────────────────────────────────
  // Status counts per program come straight from `participants.status`.
  // The database keeps no status history, so the month a participant left
  // (archived or completed) is approximated by `updated_at` — the last edit of the
  // card, normally the status change.
  const retentionPrograms = new Map<string, { id: string; name: string; active: number; completed: number; archived: number; total: number }>()
  for (const p of participants) {
    const key = p.program_id || 'none'
    const g = retentionPrograms.get(key) ?? { id: key, name: nameOfProgram(p), active: 0, completed: 0, archived: 0, total: 0 }
    g[p.status === 'archived' ? 'archived' : p.status === 'completed' ? 'completed' : 'active']++
    g.total++
    retentionPrograms.set(key, g)
  }
  const retentionList = Array.from(retentionPrograms.values()).sort((a, b) => b.total - a.total)
  const totals = retentionList.reduce(
    (a, r) => ({ active: a.active + r.active, completed: a.completed + r.completed, archived: a.archived + r.archived, total: a.total + r.total }),
    { active: 0, completed: 0, archived: 0, total: 0 },
  )

  // Cohorts by start month. Cell N = members still with us at the end of month
  // (start + N): active now, or left (archived/completed) in a later month. A cell
  // is observable once month (start + N) has begun; the current month counts with
  // what is known so far.
  const cohorts = new Map<number, AnalyticsParticipant[]>()
  for (const p of participants) {
    const s = idxOfIso(p.start_date)
    if (s == null || s > currentIdx) continue
    const list = cohorts.get(s)
    if (list) list.push(p)
    else cohorts.set(s, [p])
  }
  const cohortRows: CohortRow[] = Array.from(cohorts.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([s, members]) => ({
      key: keyOf(s),
      ...fromIdx(s),
      size: members.length,
      cells: COHORT_OFFSETS.map(n => {
        const at = s + n
        if (at > currentIdx) return null
        return members.filter(m => {
          const e = exitIdx(m)
          return e == null || e > at
        }).length
      }),
    }))

  // Monthly churn for the last 12 months (including the current one).
  // activeAtStart = started before the month and had not left before it;
  // churn rate = archived during the month / activeAtStart. «Completed» is
  // reported separately: finishing the program is not churn.
  const churn: ChurnMonth[] = []
  for (let k = currentIdx - 11; k <= currentIdx; k++) {
    let activeAtStart = 0
    let joined = 0
    let archived = 0
    let completed = 0
    for (const p of participants) {
      const s = idxOfIso(p.start_date)
      if (s == null) continue
      const e = exitIdx(p)
      if (s < k && (e == null || e >= k)) activeAtStart++
      if (s === k) joined++
      if (e === k && s <= k) {
        if (p.status === 'archived') archived++
        else completed++
      }
    }
    churn.push({
      key: keyOf(k),
      ...fromIdx(k),
      activeAtStart,
      joined,
      archived,
      completed,
      churnRate: activeAtStart > 0 ? archived / activeAtStart : null,
    })
  }

  // ── 3. Revenue per participant ──────────────────────────────────────────────
  // LTV = Σ fact_amount over all of the participant's payment rows (lifetime paid).
  // Average monthly paid = LTV / number of payment rows (billed months), so months
  // that were never recorded do not dilute it. Overall average = Σ fact / Σ rows.
  const revenueRows: RevenueRow[] = participants.map(p => {
    const rows = paymentsBy.get(p.id) || []
    const ltv = rows.reduce((s, r) => s + num(r.fact_amount), 0)
    return {
      id: p.id,
      name: p.name,
      program: nameOfProgram(p),
      status: p.status,
      ltv,
      months: rows.length,
      avgMonthly: rows.length ? ltv / rows.length : null,
    }
  })
  const totalPaid = revenueRows.reduce((s, r) => s + r.ltv, 0)
  const payingLtv = revenueRows.filter(r => Math.round(r.ltv * 100) > 0).map(r => r.ltv)
  const maxLtv = Math.max(0, ...payingLtv)
  const width = binWidth(maxLtv || 1)
  const distribution = Array.from({ length: Math.max(1, Math.floor(maxLtv / width) + 1) }, (_, i) => ({
    from: i * width,
    to: (i + 1) * width,
    count: 0,
  }))
  for (const v of payingLtv) distribution[Math.min(distribution.length - 1, Math.floor(v / width))].count++

  // Cost per participant-month: expenses in the months that have payment rows,
  // divided by the number of rows in those months (same denominator as avgMonthly).
  const rowMonths = new Set(payments.map(p => idx(p.year, p.month_number)))
  const expenseInRowMonths = expenses.reduce((s, e) => {
    const k = idxOfIso(e.expense_date)
    return k != null && rowMonths.has(k) ? s + num(e.amount) : s
  }, 0)

  // ── 4. Collection rate trend ────────────────────────────────────────────────
  // Cohort billing by year + month: billed = Σ plan of the month's payment rows,
  // paid = Σ fact of those same rows (whenever it arrived). `missing` counts
  // active participants expected that month (start…start+duration) without a row;
  // those amounts are not in «billed» and show up in debt aging instead.
  const collection: CollectionMonth[] = []
  const participantById = new Map(participants.map(p => [p.id, p]))
  for (let k = currentIdx - 11; k <= currentIdx; k++) {
    const { year, month } = fromIdx(k)
    let billed = 0
    let paid = 0
    let rows = 0
    const hasRow = new Set<string>()
    for (const r of payments) {
      if (r.year !== year || r.month_number !== month) continue
      const p = participantById.get(r.participant_id)!
      billed += paymentPlan(asMonthly([r])[0], p)
      paid += num(r.fact_amount)
      rows++
      hasRow.add(r.participant_id)
    }
    let missing = 0
    for (const p of participants) {
      if (p.status !== 'active' || hasRow.has(p.id)) continue
      const s = idxOfIso(p.start_date)
      if (s == null) continue
      const duration = p.program?.duration_months || 0
      if (k >= s && (duration <= 0 || k < s + duration)) missing++
    }
    collection.push({ key: keyOf(k), year, month, billed, paid, rate: billed > 0 ? paid / billed : null, rows, missing })
  }
  const cBilled = collection.reduce((s, m) => s + m.billed, 0)
  const cPaid = collection.reduce((s, m) => s + m.paid, 0)

  return {
    asOf: now.toISOString(),
    programId: input.programId,
    programs,
    participantsTotal: participants.length,
    aging: {
      buckets: AGING_BUCKETS.map((b, i) => ({
        key: b.key,
        label: b.label,
        amount: bucketTotals[i].amount,
        months: bucketTotals[i].months,
        participants: bucketTotals[i].participants.size,
      })),
      total: agingRows.reduce((s, r) => s + r.total, 0),
      months: agingRows.reduce((s, r) => s + r.missing + r.underpaid, 0),
      missingMonths: agingRows.reduce((s, r) => s + r.missing, 0),
      underpaidMonths: agingRows.reduce((s, r) => s + r.underpaid, 0),
      participants: agingRows,
      programs: Array.from(agingPrograms.values()).sort((a, b) => b.total - a.total),
    },
    retention: { programs: retentionList, totals, cohorts: cohortRows, churn },
    revenue: {
      totalPaid,
      rows: payments.length,
      avgMonthly: payments.length ? totalPaid / payments.length : null,
      avgLtv: payingLtv.length ? payingLtv.reduce((s, v) => s + v, 0) / payingLtv.length : null,
      medianLtv: median(payingLtv),
      paying: payingLtv.length,
      withoutPayments: revenueRows.length - payingLtv.length,
      costPerMonth: payments.length ? expenseInRowMonths / payments.length : null,
      distribution: payingLtv.length ? distribution : [],
      participants: revenueRows.sort((a, b) => b.ltv - a.ltv),
    },
    collection: { months: collection, billed: cBilled, paid: cPaid, rate: cBilled > 0 ? cPaid / cBilled : null },
  }
}
