import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkOverdue,
  checkPaidThisMonth,
  checkPartial,
  isBillable,
  isFullyPaid,
  monthlyTariff,
  overdueMonths,
  paymentPlan,
  paymentRowStatus,
  summarize,
  type MonthlyPayment,
  type Participant,
} from '@/components/participants/types'

// "Now" is 15 May 2026: February–April are past months, May is the current one.
const NOW = new Date(2026, 4, 15, 12, 0, 0)

const program = { id: 'prog', name: 'Год в деле', price_per_month: 300, duration_months: 12 }

const person = (over: Partial<Participant> = {}): Participant => ({
  id: 'p1',
  name: 'Иван',
  program_id: 'prog',
  start_date: '2026-02-01',
  status: 'active',
  program,
  ...over,
})

let seq = 0
const pay = (month: number, fact: number, over: Partial<MonthlyPayment> = {}): MonthlyPayment => ({
  id: `pay-${++seq}`,
  month_number: month,
  year: 2026,
  plan_amount: 300,
  amount: 300,
  fact_amount: fact,
  status: fact >= 300 ? 'paid' : 'pending',
  participant_id: 'p1',
  ...over,
})

const fullyPaidPast = () => [pay(2, 300), pay(3, 300), pay(4, 300)]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('monthlyTariff', () => {
  it('prefers the individual tariff, then the program price, then 0', () => {
    expect(monthlyTariff(person({ tariff: 250 }))).toBe(250)
    expect(monthlyTariff(person())).toBe(300)
    expect(monthlyTariff(person({ program: undefined }))).toBe(0)
  })
})

describe('checkOverdue', () => {
  it('is false when every past month is fully paid', () => {
    expect(checkOverdue(person(), fullyPaidPast())).toBe(false)
  })

  it('ignores the current month', () => {
    expect(checkOverdue(person(), [...fullyPaidPast(), pay(5, 0)])).toBe(false)
  })

  it('is true when a past month has no payment record', () => {
    expect(checkOverdue(person(), [pay(2, 300), pay(4, 300)])).toBe(true)
  })

  it('is true when a past month is paid only partially', () => {
    expect(checkOverdue(person(), [pay(2, 300), pay(3, 100), pay(4, 300)])).toBe(true)
  })

  it('compares against the individual tariff when the record has no plan', () => {
    const p = person({ tariff: 200 })
    const noPlan = { plan_amount: null, amount: 0 }
    const rows = [pay(2, 200, noPlan), pay(3, 200, noPlan), pay(4, 200, noPlan)]
    expect(checkOverdue(p, rows)).toBe(false)
  })

  it('only looks at this participant’s payments', () => {
    const others = fullyPaidPast().map(r => ({ ...r, participant_id: 'someone-else' }))
    expect(checkOverdue(person(), others)).toBe(true)
    expect(checkOverdue(person(), [...others, ...fullyPaidPast()])).toBe(false)
  })

  it('is false for a participant who starts this month or later', () => {
    expect(checkOverdue(person({ start_date: '2026-05-10' }), [])).toBe(false)
    expect(checkOverdue(person({ start_date: '2026-09-01' }), [])).toBe(false)
  })

  it('is false without a start date', () => {
    expect(checkOverdue(person({ start_date: '' }), [])).toBe(false)
  })

  it('spans year boundaries', () => {
    const p = person({ start_date: '2025-12-01' })
    const rows = [pay(12, 300, { year: 2025 }), pay(1, 300), ...fullyPaidPast()]
    expect(checkOverdue(p, rows)).toBe(false)
    expect(checkOverdue(p, rows.slice(1))).toBe(true)
  })

  it('never reports a fully paid archived or completed participant as overdue', () => {
    expect(checkOverdue(person({ status: 'archived' }), fullyPaidPast())).toBe(false)
    expect(checkOverdue(person({ status: 'completed' }), fullyPaidPast())).toBe(false)
  })

  it('never reports archived or completed participants as overdue, even with debts', () => {
    for (const status of ['archived', 'completed'] as const) {
      const p = person({ status })
      expect(checkOverdue(p, [])).toBe(false)
      expect(checkOverdue(p, [pay(2, 0), pay(3, 100)])).toBe(false)
      expect(summarize(p, []).overdue).toBe(false)
    }
  })

  it('compares in cents, so conversion noise does not create a debt', () => {
    const rows = [pay(2, 299.9999999999999), pay(3, 300), pay(4, 300)]
    expect(checkOverdue(person(), rows)).toBe(false)
  })

  it('stops at the end of the program duration when no rows exist', () => {
    // Started Feb 2025 on a 3-month program: Feb–Apr 2025 are billed, nothing after.
    const p = person({ start_date: '2025-02-01', program: { ...program, duration_months: 3 } })
    const rows = [2, 3, 4].map(m => pay(m, 300, { year: 2025 }))
    expect(checkOverdue(p, rows)).toBe(false)
    expect(checkOverdue(p, rows.slice(0, 2))).toBe(true)
  })
})

describe('overdueMonths', () => {
  it('lists missing and underpaid past months in order', () => {
    const rows = [pay(2, 300), pay(3, 100)]
    expect(overdueMonths(person(), rows)).toEqual([
      { year: 2026, month: 3, plan: 300, fact: 100, reason: 'underpaid' },
      { year: 2026, month: 4, plan: 300, fact: 0, reason: 'missing' },
    ])
  })

  it('accepts an explicit «now»', () => {
    expect(overdueMonths(person(), [], new Date(2026, 1, 20))).toEqual([])
    expect(overdueMonths(person(), [], new Date(2026, 2, 1)).map(m => m.month)).toEqual([2])
  })

  it('skips months with a zero plan', () => {
    const rows = [pay(2, 0, { plan_amount: 0, amount: 0 }), pay(3, 300), pay(4, 300)]
    expect(overdueMonths(person(), rows)).toEqual([])
  })
})

describe('plan helpers', () => {
  it('paymentPlan prefers the stored plan, then the tariff', () => {
    expect(paymentPlan(pay(2, 0, { plan_amount: 250 }), person())).toBe(250)
    expect(paymentPlan(pay(2, 0, { plan_amount: null }), person({ tariff: 180 }))).toBe(180)
    expect(paymentPlan(undefined, person())).toBe(300)
  })

  it('isFullyPaid compares to the cent', () => {
    expect(isFullyPaid(999.9999999999999, 1000)).toBe(true)
    expect(isFullyPaid(0.1 + 0.2, 0.3)).toBe(true)
    expect(isFullyPaid(999.99, 1000)).toBe(false)
    expect(isFullyPaid(null, 0)).toBe(true)
  })

  it('isBillable is true only for active participants', () => {
    expect(isBillable(person())).toBe(true)
    expect(isBillable(person({ status: 'archived' }))).toBe(false)
    expect(isBillable(person({ status: 'completed' }))).toBe(false)
  })
})

describe('checkPartial', () => {
  it('is true when any month has 0 < fact < plan', () => {
    expect(checkPartial(person(), [pay(2, 300), pay(3, 150)])).toBe(true)
  })

  it('is false for unpaid or fully paid months', () => {
    expect(checkPartial(person(), [pay(2, 300), pay(3, 0)])).toBe(false)
    expect(checkPartial(person(), [])).toBe(false)
  })

  it('ignores other participants', () => {
    expect(checkPartial(person(), [pay(3, 150, { participant_id: 'other' })])).toBe(false)
  })
})

describe('checkPaidThisMonth', () => {
  it('is true only when the current month is covered in full', () => {
    expect(checkPaidThisMonth(person(), [pay(5, 300)])).toBe(true)
    expect(checkPaidThisMonth(person(), [pay(5, 100)])).toBe(false)
    expect(checkPaidThisMonth(person(), [pay(4, 300)])).toBe(false)
    expect(checkPaidThisMonth(person(), [pay(5, 300, { year: 2025 })])).toBe(false)
    expect(checkPaidThisMonth(person(), [pay(5, 300, { participant_id: 'other' })])).toBe(false)
  })
})

describe('paymentRowStatus', () => {
  const p = person()
  it('maps rows to labels and badge variants', () => {
    expect(paymentRowStatus(pay(2, 300), p)).toEqual({ label: 'Оплачен', variant: 'success' })
    expect(paymentRowStatus(pay(2, 400), p)).toEqual({ label: 'Оплачен', variant: 'success' })
    expect(paymentRowStatus(pay(2, 120), p)).toEqual({ label: 'Частично', variant: 'warning' })
    expect(paymentRowStatus(pay(5, 0), p)).toEqual({ label: 'Ожидается', variant: 'secondary' })
    expect(paymentRowStatus(pay(7, 0), p)).toEqual({ label: 'Ожидается', variant: 'secondary' })
  })

  it('shows an unpaid past month as overdue only for active participants', () => {
    expect(paymentRowStatus(pay(2, 0), p)).toEqual({ label: 'Просрочен', variant: 'destructive' })
    expect(paymentRowStatus(pay(2, 0), person({ status: 'archived' })).label).toBe('Ожидается')
    expect(paymentRowStatus(pay(2, 0), person({ status: 'completed' })).label).toBe('Ожидается')
  })

  it('shows «Просрочен» for rows with status overdue', () => {
    expect(paymentRowStatus(pay(6, 0, { status: 'overdue' }), p)).toEqual({ label: 'Просрочен', variant: 'destructive' })
  })

  it('falls back to the tariff when the row has no plan', () => {
    const t = person({ tariff: 100 })
    expect(paymentRowStatus(pay(2, 100, { plan_amount: null, amount: 0 }), t).label).toBe('Оплачен')
    expect(paymentRowStatus(pay(2, 50, { plan_amount: null, amount: 0 }), t).label).toBe('Частично')
  })
})

describe('summarize', () => {
  it('aggregates counts and the collected sum', () => {
    const rows = [pay(2, 300), pay(3, 150), pay(4, 300), pay(5, 0)]
    const s = summarize(person(), rows)
    expect(s.overdue).toBe(true)
    expect(s.partial).toBe(true)
    expect(s.paidThisMonth).toBe(false)
    expect(s.paidCount).toBe(2)
    expect(s.totalCount).toBe(4)
    expect(s.collected).toBe(750)
  })

  it('reports a clean participant', () => {
    const s = summarize(person(), [...fullyPaidPast(), pay(5, 300)])
    expect(s).toMatchObject({ overdue: false, partial: false, paidThisMonth: true, paidCount: 4, totalCount: 4, collected: 1200 })
  })
})
