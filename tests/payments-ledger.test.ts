import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildSchedule,
  monthIndex,
  monthOfDate,
  monthRangeLabel,
  monthStatus,
  programDuration,
  receiptDate,
  remainder,
  scheduleMonths,
  tariffOf,
} from '@/lib/payment-schedule'
import { overdueMonths, type MonthlyPayment, type Participant } from '@/components/participants/types'
import { MONTHS_SHORT_RU } from '@/lib/format'

describe('monthStatus (cents)', () => {
  it('is pending when nothing was received', () => {
    expect(monthStatus(0, 1000)).toBe('pending')
    expect(monthStatus(null, 1000)).toBe('pending')
    expect(monthStatus(0.004, 1000)).toBe('pending') // rounds to 0 cents
  })

  it('is partial below the plan and paid from the plan up', () => {
    expect(monthStatus(300, 1000)).toBe('partial')
    expect(monthStatus(999.99, 1000)).toBe('partial')
    expect(monthStatus(1000, 1000)).toBe('paid')
    expect(monthStatus(1200, 1000)).toBe('paid')
  })

  it('absorbs TJS→USD conversion noise', () => {
    expect(monthStatus(999.9999999999999, 1000)).toBe('paid')
    expect(monthStatus(0.1 + 0.2, 0.3)).toBe('paid')
    expect(monthStatus('500.00', '500')).toBe('paid')
  })

  it('treats any receipt on a zero plan as paid', () => {
    expect(monthStatus(10, 0)).toBe('paid')
    expect(monthStatus(0, 0)).toBe('pending')
  })
})

describe('remainder', () => {
  it('is plan minus fact in cents, never negative', () => {
    expect(remainder(1000, 300)).toBe(700)
    expect(remainder(1000, 999.9999999999999)).toBe(0)
    expect(remainder(1000, 1200)).toBe(0)
    expect(remainder(100, 33.33)).toBe(66.67)
    expect(remainder(0.3, 0.1)).toBe(0.2)
    expect(remainder(null, null)).toBe(0)
  })
})

describe('scheduleMonths', () => {
  it('generates consecutive months across a year boundary', () => {
    expect(scheduleMonths(11, 2025, 4)).toEqual([
      { month: 11, year: 2025 },
      { month: 12, year: 2025 },
      { month: 1, year: 2026 },
      { month: 2, year: 2026 },
    ])
  })

  it('covers a full 12-month program from September', () => {
    const months = scheduleMonths(9, 2025, 12)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ month: 9, year: 2025 })
    expect(months[3]).toEqual({ month: 12, year: 2025 })
    expect(months[4]).toEqual({ month: 1, year: 2026 })
    expect(months[11]).toEqual({ month: 8, year: 2026 })
  })

  it('spans several years and handles empty or invalid counts', () => {
    const months = scheduleMonths(12, 2024, 25)
    expect(months[24]).toEqual({ month: 12, year: 2026 })
    expect(scheduleMonths(1, 2026, 0)).toEqual([])
    expect(scheduleMonths(1, 2026, -3)).toEqual([])
    expect(scheduleMonths(1, 2026, Number.NaN)).toEqual([])
  })
})

describe('durations and dates', () => {
  it('reads the program duration', () => {
    expect(programDuration({ duration_months: 12 })).toBe(12)
    expect(programDuration({ duration_months: '6' })).toBe(6)
    expect(programDuration({ duration_months: 0 })).toBe(0)
    expect(programDuration({ duration_months: null })).toBe(0)
    expect(programDuration(null)).toBe(0)
  })

  it('reads month and year from a date string without timezone shifts', () => {
    expect(monthOfDate('2025-09-01')).toEqual({ month: 9, year: 2025 })
    expect(monthOfDate('2026-01-31T23:00:00Z')).toEqual({ month: 1, year: 2026 })
    expect(monthOfDate('')).toBeNull()
    expect(monthOfDate(null)).toBeNull()
    expect(monthOfDate('2026-13-01')).toBeNull()
  })

  it('dates an undated receipt on the 1st of its billed month', () => {
    expect(receiptDate('2026-03-15', 2, 2026)).toBe('2026-03-15')
    expect(receiptDate(null, 2, 2026)).toBe('2026-02-01')
  })

  it('uses the individual tariff before the program price', () => {
    expect(tariffOf({ tariff: 800, program: { price_per_month: 1000 } })).toBe(800)
    expect(tariffOf({ tariff: null, program: { price_per_month: 1000 } })).toBe(1000)
    expect(tariffOf({})).toBe(0)
  })

  it('labels a run of months', () => {
    expect(monthRangeLabel(scheduleMonths(9, 2025, 6), MONTHS_SHORT_RU)).toBe('сен 2025 – фев 2026')
    expect(monthRangeLabel([{ month: 3, year: 2026 }], MONTHS_SHORT_RU)).toBe('мар 2026')
    expect(monthRangeLabel([], MONTHS_SHORT_RU)).toBe('')
  })
})

describe('buildSchedule', () => {
  const now = new Date(2026, 2, 10) // 10 March 2026
  const participant = {
    id: 'p1',
    status: 'active',
    start_date: '2025-09-01',
    tariff: 1000,
    program: { price_per_month: 1200, duration_months: 12 },
  }
  const row = (month: number, year: number, fact: number, plan: number | null = 1000) => ({
    id: `${year}-${month}`,
    participant_id: 'p1',
    month_number: month,
    year,
    plan_amount: plan,
    fact_amount: fact,
    status: 'pending',
  })

  it('lists the full program with no rows and marks past months overdue', () => {
    const s = buildSchedule(participant, [], now)
    expect(s.months).toHaveLength(12)
    expect(s.scheduledCount).toBe(12)
    expect(s.paidCount).toBe(0)
    expect(s.overdueMonths.map(m => `${m.month}.${m.year}`)).toEqual(['9.2025', '10.2025', '11.2025', '12.2025', '1.2026', '2.2026'])
    expect(s.overdueDebt).toBe(6000)
    expect(s.months[6]).toMatchObject({ month: 3, year: 2026, status: 'current', isCurrent: true })
    expect(s.months[7].status).toBe('future')
    expect(s.months.every(m => m.row === null)).toBe(true)
    expect(s.next).toMatchObject({ month: 3, year: 2026 })
  })

  it('merges rows, partial payments and months outside the program', () => {
    const rows = [row(9, 2025, 1000), row(10, 2025, 400), row(3, 2026, 250), row(12, 2026, 50, 50)]
    const s = buildSchedule(participant, rows, now)
    expect(s.months).toHaveLength(13) // 12 program months + December 2026
    const byKey = new Map(s.months.map(m => [`${m.month}.${m.year}`, m]))
    expect(byKey.get('9.2025')!.status).toBe('paid')
    expect(byKey.get('10.2025')).toMatchObject({ status: 'partial', remaining: 600, overdue: true })
    expect(byKey.get('3.2026')).toMatchObject({ status: 'partial', remaining: 750, overdue: false })
    expect(byKey.get('12.2026')).toMatchObject({ inProgram: false, status: 'paid' })
    expect(s.paidCount).toBe(1)
    expect(s.scheduledCount).toBe(12)
    expect(s.overdueDebt).toBe(600 + 4 * 1000)
  })

  it('uses a stored plan over the tariff, including zero', () => {
    const s = buildSchedule(participant, [row(11, 2025, 0, 0), row(12, 2025, 500, 500)], now)
    const byKey = new Map(s.months.map(m => [`${m.month}.${m.year}`, m]))
    expect(byKey.get('11.2025')).toMatchObject({ plan: 0, status: 'free', overdue: false })
    expect(byKey.get('12.2025')).toMatchObject({ plan: 500, status: 'paid' })
  })

  it('does not chase participants who are no longer active', () => {
    const s = buildSchedule({ ...participant, status: 'archived' }, [], now)
    expect(s.overdueMonths).toEqual([])
    expect(s.months[0].status).toBe('unpaid')
  })

  it('runs up to the current month when the duration is unknown', () => {
    const s = buildSchedule({ ...participant, program: { price_per_month: 1200, duration_months: null } }, [], now)
    expect(s.months).toHaveLength(7) // Sep 2025 … Mar 2026
    expect(s.months[0].plan).toBe(1000)
  })

  it('agrees with overdueMonths() used by the participants page and the dashboard', () => {
    const cases: { p: typeof participant; rows: ReturnType<typeof row>[] }[] = [
      { p: participant, rows: [] },
      { p: participant, rows: [row(9, 2025, 1000), row(10, 2025, 400), row(1, 2026, 999.9999999999999)] },
      { p: { ...participant, start_date: '2025-11-15' }, rows: [row(6, 2025, 0)] },
      { p: { ...participant, program: { price_per_month: 1200, duration_months: 3 } }, rows: [row(2, 2026, 100)] },
      { p: { ...participant, status: 'completed' }, rows: [row(10, 2025, 0)] },
      { p: { ...participant, start_date: '' }, rows: [row(10, 2025, 0)] },
    ]
    for (const c of cases) {
      const ours = buildSchedule(c.p, c.rows, now).overdueMonths.map(m => ({ year: m.year, month: m.month, plan: m.plan, fact: m.fact }))
      const theirs = overdueMonths(c.p as unknown as Participant, c.rows as unknown as MonthlyPayment[], now).map(m => ({
        year: m.year,
        month: m.month,
        plan: m.plan,
        fact: m.fact,
      }))
      expect(ours).toEqual(theirs)
    }
  })

  it('keeps month indexes monotonic across years', () => {
    expect(monthIndex(2026, 1) - monthIndex(2025, 12)).toBe(1)
  })
})

describe('ledgerEnabled (feature detection)', () => {
  const select = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    select.mockReset()
    vi.doMock('@/lib/supabase-client', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ limit: () => select() }) }) },
    }))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock('@/lib/supabase-client')
  })

  it('caches "enabled" for the process lifetime', async () => {
    const { ledgerEnabled } = await import('@/lib/payments-ledger')
    select.mockResolvedValue({ error: null })
    expect(await ledgerEnabled()).toBe(true)
    select.mockResolvedValue({ error: { code: '42P01', message: 'relation "payment_transactions" does not exist' } })
    expect(await ledgerEnabled()).toBe(true)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('re-checks "disabled" after 60 seconds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0))
    const { ledgerEnabled } = await import('@/lib/payments-ledger')
    select.mockResolvedValue({ error: { code: 'PGRST205', message: "Could not find the table 'public.payment_transactions'" } })
    expect(await ledgerEnabled()).toBe(false)
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 30))
    expect(await ledgerEnabled()).toBe(false)
    expect(select).toHaveBeenCalledTimes(1)
    select.mockResolvedValue({ error: null })
    vi.setSystemTime(new Date(2026, 0, 1, 12, 1, 1))
    expect(await ledgerEnabled()).toBe(true)
    expect(select).toHaveBeenCalledTimes(2)
  })

  it('throws on unexpected errors instead of silently falling back', async () => {
    const { ledgerEnabled } = await import('@/lib/payments-ledger')
    select.mockResolvedValue({ error: { code: '08006', message: 'connection failure' } })
    await expect(ledgerEnabled()).rejects.toMatchObject({ code: '08006' })
  })

  it('never uses the dev preview in production', async () => {
    const { ledgerMock } = await import('@/lib/payments-ledger')
    const req = new Request('http://x/api', { headers: { cookie: 'a=b; pp-ledger-mock=1' } })
    expect(ledgerMock(req)).toBe(process.env.NODE_ENV !== 'production')
    vi.stubEnv('NODE_ENV', 'production')
    expect(ledgerMock(req)).toBe(false)
    vi.unstubAllEnvs()
  })
})
