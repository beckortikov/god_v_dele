/**
 * Pure helpers for partial payments and payment schedules (графики оплат).
 * Safe to import from API routes, client components and tests: no DB access.
 *
 * Model: one `monthly_payments` row per participant and month is the plan
 * (schedule line); each real receipt is a `payment_transactions` row
 * (migration 014). The database trigger keeps the monthly `fact_amount` and
 * `status` equal to what `monthStatus()` computes here.
 */

/** Money in whole cents, so 999.9999999999999 (TJS→USD conversion) counts as 1000. */
export const toCents = (v: unknown) => Math.round((Number(v) || 0) * 100)

export type StoredPaymentStatus = 'paid' | 'partial' | 'pending'

/**
 * Status stored on a monthly row from its receipts, compared in cents
 * (the same rule as the SQL trigger in migrations/014_payment_transactions.sql):
 * nothing received → `pending`; fact ≥ plan → `paid`; otherwise `partial`.
 */
export function monthStatus(fact: unknown, plan: unknown): StoredPaymentStatus {
  const f = toCents(fact)
  if (f <= 0) return 'pending'
  return f >= toCents(plan) ? 'paid' : 'partial'
}

/** What is still due for a month, never negative, rounded to cents. */
export function remainder(plan: unknown, fact: unknown): number {
  const r = toCents(plan) - toCents(fact)
  return r > 0 ? r / 100 : 0
}

/** Absolute month index: year × 12 + (month − 1). Month is 1–12. */
export const monthIndex = (year: number, month: number) => year * 12 + (month - 1)
export const fromMonthIndex = (idx: number) => ({ year: Math.floor(idx / 12), month: (idx % 12) + 1 })

/** `count` consecutive months starting at month/year, crossing year boundaries. */
export function scheduleMonths(fromMonth: number, fromYear: number, count: number): { month: number; year: number }[] {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  const start = monthIndex(fromYear, fromMonth)
  return Array.from({ length: n }, (_, i) => fromMonthIndex(start + i))
}

/** Program duration in months, or 0 when unknown / invalid. */
export function programDuration(program?: { duration_months?: number | string | null } | null): number {
  const d = Math.floor(Number(program?.duration_months) || 0)
  return d > 0 ? d : 0
}

/** Month/year of a `YYYY-MM-DD` date string (no timezone shifts), or null. */
export function monthOfDate(date: string | null | undefined): { month: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(date || '')
  if (!m) return null
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return { month, year: Number(m[1]) }
}

/** The participant's monthly tariff: individual, otherwise the program price. */
export function tariffOf(p: { tariff?: number | string | null; program?: { price_per_month?: number | string | null } | null }) {
  return Number(p.tariff) || Number(p.program?.price_per_month) || 0
}

/**
 * Date a receipt counts in cash reports: its own date, otherwise the first day
 * of the billed month (the same fallback the reports used before the ledger).
 */
export function receiptDate(paidDate: string | null | undefined, month: number, year: number) {
  return paidDate || `${year}-${String(month).padStart(2, '0')}-01`
}

// ---------------------------------------------------------------------------
// Full schedule of one participant

export interface ScheduleParticipant {
  id?: string
  status?: string | null
  start_date?: string | null
  tariff?: number | string | null
  program?: { price_per_month?: number | string | null; duration_months?: number | string | null } | null
}

export interface ScheduleRow {
  id?: string
  month_number: number
  year: number
  plan_amount?: number | string | null
  fact_amount?: number | string | null
  status?: string | null
}

/**
 * - `paid`: covered to the cent;
 * - `partial`: something received, less than the plan;
 * - `overdue`: a past month with nothing received (row or no row);
 * - `current` / `future`: nothing received yet, this month / later;
 * - `unpaid`: a past month with nothing received for a participant who is no
 *   longer active (not chased, shown neutrally);
 * - `free`: a month with a zero plan and nothing received.
 */
export type ScheduleStatus = 'paid' | 'partial' | 'overdue' | 'current' | 'future' | 'unpaid' | 'free'

export const SCHEDULE_STATUS: Record<
  ScheduleStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'info' | 'secondary' }
> = {
  paid: { label: 'Оплачено', variant: 'success' },
  partial: { label: 'Частично', variant: 'warning' },
  overdue: { label: 'Просрочено', variant: 'destructive' },
  current: { label: 'Текущий', variant: 'info' },
  future: { label: 'Будущий', variant: 'secondary' },
  unpaid: { label: 'Не оплачено', variant: 'secondary' },
  free: { label: 'Без оплаты', variant: 'secondary' },
}

export interface ScheduleMonth<R extends ScheduleRow = ScheduleRow> {
  idx: number
  month: number
  year: number
  plan: number
  fact: number
  remaining: number
  status: ScheduleStatus
  /** The monthly row, when there is one. */
  row: R | null
  /** Inside start_date … start_date + duration. */
  inProgram: boolean
  isPast: boolean
  isCurrent: boolean
  /**
   * Counts as overdue by the same rule as `overdueMonths()` in
   * components/participants/types.ts: active participant, past month, plan > 0
   * and not covered to the cent. Includes past partial months.
   */
  overdue: boolean
}

export interface Schedule<R extends ScheduleRow = ScheduleRow> {
  months: ScheduleMonth<R>[]
  tariff: number
  duration: number
  /** First and last month index of the program (inclusive), when known. */
  startIdx: number | null
  endIdx: number | null
  totalPlan: number
  totalPaid: number
  /** Months in the program schedule (or all months when the duration is unknown). */
  scheduledCount: number
  paidCount: number
  overdueMonths: ScheduleMonth<R>[]
  overdueDebt: number
  /** First month from now on that still needs money. */
  next: ScheduleMonth<R> | null
}

/**
 * Every month the participant is expected to pay, merged with the stored rows:
 * the program months (start month for `duration_months`; up to the current
 * month when the duration is unknown) plus any row outside them. A row's own
 * `plan_amount` wins; months without a row are planned at the tariff.
 */
export function buildSchedule<R extends ScheduleRow>(participant: ScheduleParticipant, rows: R[], now = new Date()): Schedule<R> {
  const currentIdx = monthIndex(now.getFullYear(), now.getMonth() + 1)
  const tariff = tariffOf(participant)
  const duration = programDuration(participant.program)

  const byIdx = new Map<number, R>()
  for (const r of rows) {
    const k = monthIndex(Number(r.year), Number(r.month_number))
    if (!byIdx.has(k)) byIdx.set(k, r)
  }

  const start = monthOfDate(participant.start_date ?? null)
  // Same as overdueMonths(): only active participants with a start date are chased
  const billable = participant.status === 'active' && start != null
  const startIdx = start ? monthIndex(start.year, start.month) : null
  const endIdx = startIdx == null ? null : duration > 0 ? startIdx + duration - 1 : Math.max(currentIdx, startIdx)

  const indices = new Set<number>(byIdx.keys())
  if (startIdx != null && endIdx != null) for (let k = startIdx; k <= endIdx; k++) indices.add(k)

  const months = [...indices]
    .sort((a, b) => a - b)
    .map((idx): ScheduleMonth<R> => {
      const row = byIdx.get(idx) ?? null
      const stored = row?.plan_amount
      const plan = stored != null && stored !== '' ? Number(stored) || 0 : tariff
      const fact = Number(row?.fact_amount) || 0
      const isPast = idx < currentIdx
      const isCurrent = idx === currentIdx
      const inProgram = startIdx != null && endIdx != null && idx >= startIdx && idx <= endIdx
      const covered = toCents(fact) >= toCents(plan)
      let status: ScheduleStatus
      if (fact > 0 && covered) status = 'paid'
      else if (fact > 0) status = 'partial'
      else if (toCents(plan) <= 0) status = 'free'
      else if (isPast) status = billable ? 'overdue' : 'unpaid'
      else status = isCurrent ? 'current' : 'future'
      return {
        idx,
        ...fromMonthIndex(idx),
        plan,
        fact,
        remaining: remainder(plan, fact),
        status,
        row,
        inProgram,
        isPast,
        isCurrent,
        overdue: billable && isPast && toCents(plan) > 0 && !covered,
      }
    })

  const overdue = months.filter(m => m.overdue)
  const scheduled = startIdx != null ? months.filter(m => m.inProgram) : months
  return {
    months,
    tariff,
    duration,
    startIdx,
    endIdx,
    totalPlan: months.reduce((s, m) => s + m.plan, 0),
    totalPaid: months.reduce((s, m) => s + m.fact, 0),
    scheduledCount: scheduled.length,
    paidCount: scheduled.filter(m => m.status === 'paid').length,
    overdueMonths: overdue,
    overdueDebt: overdue.reduce((s, m) => s + m.remaining, 0),
    next: months.find(m => m.idx >= currentIdx && m.remaining > 0) ?? null,
  }
}

/** «сен 2025 – фев 2026» for a run of months (first and last). */
export function monthRangeLabel(months: { month: number; year: number }[], short: readonly string[]) {
  if (!months.length) return ''
  const label = (m: { month: number; year: number }) => `${short[m.month - 1]} ${m.year}`
  const first = months[0]
  const last = months[months.length - 1]
  return months.length === 1 ? label(first) : `${label(first)} – ${label(last)}`
}
