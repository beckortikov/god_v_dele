import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => ({ db: (await import('./helpers/fake-db')).fakeAdmin }))
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-key-for-tests'

import { POST as addSupplier } from '@/app/api/offline-events/[id]/suppliers/route'
import { POST as addLoan } from '@/app/api/offline-events/[id]/loans/route'
import { POST as addRepayment } from '@/app/api/offline-events/[id]/loans/[loanId]/repayments/route'
import { POST as addExpense } from '@/app/api/offline-events/[id]/expenses/route'
import { PUT as editExpense } from '@/app/api/offline-events/[id]/expenses/[expenseId]/route'
import { GET as getMoney } from '@/app/api/offline-events/[id]/money/route'
import { GET as getAccounts } from '@/app/api/accounts/route'
import { inCurrency, loanAccountEffects, loanTotals, parseMoney, sourceLabel, supplierTotals } from '@/lib/event-money'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'
import { fake } from './helpers/fake-db'

const EV = 'e1111111-1111-4111-8111-111111111111'
const OTHER = 'e2222222-2222-4222-8222-222222222222'
const USD_ACC = 'a1111111-1111-4111-8111-111111111111'
const TJS_ACC = 'a2222222-2222-4222-8222-222222222222'

const cookie = `${SESSION_COOKIE}=${createSessionToken({ id: 'u-fin', role: 'finance', full_name: 'Финансист' })}`
const req = (method: string, body?: unknown) =>
  new Request('http://test/x', { method, headers: { 'Content-Type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })
const json = async (res: Response) => ({ status: res.status, body: await res.json() })

describe('money helpers', () => {
  it('reads money in USD or in somoni with a rate', () => {
    expect(parseMoney({ original_amount: 1000, currency: 'TJS', exchange_rate: 10 })).toEqual({ amount: 100, currency: 'TJS', original_amount: 1000, exchange_rate: 10 })
    expect(parseMoney({ amount: 250 })).toEqual({ amount: 250, currency: 'USD', original_amount: 250, exchange_rate: 1 })
    expect(parseMoney({ amount: 0 })).toEqual({ error: 'Укажите сумму' })
    expect(parseMoney({ original_amount: 100, currency: 'TJS', exchange_rate: 0 })).toEqual({ error: 'Укажите курс сомони к доллару' })
    expect(inCurrency({ amount: 100, original_amount: 1000, currency: 'TJS' }, 'TJS', 11)).toBe(1000)
    expect(inCurrency({ amount: 100, original_amount: 1000, currency: 'TJS' }, 'USD', 11)).toBe(100)
    expect(inCurrency({ amount: 100, currency: 'USD' }, 'TJS', 11)).toBe(1100)
  })

  it('counts what was paid to a supplier in the contract currency', () => {
    const hotel = { id: 's1', name: 'Отель', kind: 'hotel', contract_amount: 20000, contract_currency: 'USD', contract_original: 20000, contract_rate: 1 }
    const t = supplierTotals(hotel, [
      { supplier_id: 's1', amount: 5000, original_amount: 5000, currency: 'USD' },
      { supplier_id: 's1', amount: 1000, original_amount: 10900, currency: 'TJS' },
      { supplier_id: 'other', amount: 999, currency: 'USD' },
    ])
    expect(t).toMatchObject({ contract: 20000, paid: 6000, left: 14000, paid_usd: 6000, payments: 2, overpaid: 0 })
  })

  it('tracks a loan: repaid, owed, overdue, spent on payments', () => {
    const loan = { id: 'l1', source: 'person', lender_name: 'Иванов', amount: 1000, currency: 'TJS', original_amount: 10000, exchange_rate: 10, due_on: '2026-11-01' }
    const t = loanTotals(loan, [{ loan_id: 'l1', amount: 300, original_amount: 3000, currency: 'TJS' }], [{ loan_id: 'l1', amount: 800 }], '2026-11-28')
    expect(t).toMatchObject({ taken: 10000, repaid: 3000, owed: 7000, owed_usd: 700, spent_usd: 800, unspent_usd: 200, overdue: true, closed: false })
  })

  it('moves accounts: a loan from an account out, its repayment back; repaying a person from an account out', () => {
    const loans = [
      { id: 'l1', source: 'account', account_id: 'acc1', amount: 1000, original_amount: 1000, currency: 'USD', exchange_rate: 1 },
      { id: 'l2', source: 'person', lender_name: 'Иванов', amount: 500, original_amount: 500, currency: 'USD', exchange_rate: 1 },
    ]
    const d = loanAccountEffects(loans, [
      { loan_id: 'l1', amount: 400, original_amount: 400 },
      { loan_id: 'l2', amount: 100, original_amount: 100, account_id: 'acc2' },
      { loan_id: 'l2', amount: 50, original_amount: 50 },
    ])
    expect(d.get('acc1')).toEqual({ usd: -600, original: -600 })
    expect(d.get('acc2')).toEqual({ usd: -100, original: -100 })
    expect(sourceLabel({ amount: 1, loan_id: 'l2' }, [], loans)).toBe('Займ: Иванов')
    expect(sourceLabel({ amount: 1, account_id: 'acc1' }, [{ id: 'acc1', name: 'ГвД 2 доллар' }], loans)).toBe('Со счёта ГвД 2 доллар')
  })
})

describe('event suppliers, loans and payments', () => {
  beforeEach(() => {
    fake.reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.rows('offline_events').push({ id: EV, name: 'Мастермайнд' }, { id: OTHER, name: 'Другое' })
    fake.rows('accounts').push(
      { id: USD_ACC, name: 'ГвД 2 доллар', currency: 'USD', initial_balance: 10000, created_at: '2026-01-01' },
      { id: TJS_ACC, name: 'ГвД 2 сомони', currency: 'TJS', initial_balance: 50000, created_at: '2026-01-02' }
    )
  })

  it('pays a hotel from an account and from a loan, and shows what is left and owed', async () => {
    const hotel = (await json(await addSupplier(req('POST', { name: 'Borneo Resort', kind: 'hotel', contract_original: 20000, currency: 'USD' }), ctx({ id: EV })))).body.data
    expect(hotel).toMatchObject({ contract_amount: 20000, contract_currency: 'USD' })

    const loan = (await json(await addLoan(req('POST', { source: 'person', lender_name: 'Иванов', original_amount: 8000, currency: 'USD', due_on: '2027-01-15' }), ctx({ id: EV })))).body.data

    const pay = (body: Record<string, unknown>) => addExpense(req('POST', { name: 'Оплата отеля', amount: body.amount, original_amount: body.amount, currency: 'USD', exchange_rate: 1, category: 'Hotel', expense_date: '2026-11-28', status: 'approved', supplier_id: hotel.id, ...body }), ctx({ id: EV }))
    expect((await pay({ amount: 5000, account_id: USD_ACC })).status).toBe(201)
    expect((await pay({ amount: 7000, loan_id: loan.id })).status).toBe(201)

    const money = (await json(await getMoney(req('GET'), ctx({ id: EV })))).body.data
    expect(money.suppliers[0].totals).toMatchObject({ paid: 12000, left: 8000 })
    expect(money.loans[0].totals).toMatchObject({ owed: 8000, spent_usd: 7000 })
    expect(money.totals).toMatchObject({ suppliers_left_usd: 8000, loans_owed_usd: 8000 })
  })

  it('refuses a payment from an account in another currency, from both sources, or to another event’s supplier', async () => {
    const other = (await json(await addSupplier(req('POST', { name: 'Чужой', kind: 'tour' }), ctx({ id: OTHER })))).body.data
    const base = { name: 'x', amount: 100, original_amount: 100, currency: 'USD', category: 'Other', expense_date: '2026-11-28' }
    expect((await json(await addExpense(req('POST', { ...base, account_id: TJS_ACC }), ctx({ id: EV })))).body.error).toContain('той же валюте')
    expect((await addExpense(req('POST', { ...base, account_id: USD_ACC, loan_id: 'x' }), ctx({ id: EV }))).status).toBe(400)
    expect((await addExpense(req('POST', { ...base, supplier_id: other.id }), ctx({ id: EV }))).status).toBe(400)
    expect(fake.rows('expenses')).toHaveLength(0)
  })

  it('edits only known expense fields and keeps it within the event', async () => {
    const made = (await json(await addExpense(req('POST', { name: 'Еда', amount: 50, currency: 'USD', category: 'Food', expense_date: '2026-11-28' }), ctx({ id: EV })))).body.data[0]
    expect((await editExpense(req('PUT', { name: 'Ужин', event_id: OTHER, account_id: USD_ACC }), ctx({ id: EV, expenseId: made.id }))).status).toBe(200)
    expect(fake.rows('expenses')[0]).toMatchObject({ name: 'Ужин', event_id: EV, account_id: USD_ACC })
    expect((await editExpense(req('PUT', { name: 'Чужое' }), ctx({ id: OTHER, expenseId: made.id }))).status).toBe(404)
  })

  it('a loan from an account must be in its currency; account balances follow loans and repayments', async () => {
    expect((await addLoan(req('POST', { source: 'account', account_id: TJS_ACC, original_amount: 100, currency: 'USD' }), ctx({ id: EV }))).status).toBe(400)
    expect((await addLoan(req('POST', { source: 'person', original_amount: 100 }), ctx({ id: EV }))).status).toBe(400)
    const fromGvd = (await json(await addLoan(req('POST', { source: 'account', account_id: USD_ACC, original_amount: 3000, currency: 'USD' }), ctx({ id: EV })))).body.data
    const fromPerson = (await json(await addLoan(req('POST', { source: 'person', lender_name: 'Каримов', original_amount: 20000, currency: 'TJS', exchange_rate: 10 }), ctx({ id: EV })))).body.data

    expect((await addRepayment(req('POST', { original_amount: 1000 }), ctx({ id: EV, loanId: fromGvd.id }))).status).toBe(201)
    // repaid from the somoni account: the repayment is in the loan's currency
    const rep = await json(await addRepayment(req('POST', { original_amount: 5000, currency: 'USD', exchange_rate: 10, account_id: TJS_ACC }), ctx({ id: EV, loanId: fromPerson.id })))
    expect(rep.status).toBe(201)
    expect(rep.body.data).toMatchObject({ currency: 'TJS', original_amount: 5000, amount: 500, account_id: TJS_ACC })
    expect((await addRepayment(req('POST', { original_amount: 10, account_id: USD_ACC }), ctx({ id: EV, loanId: fromPerson.id }))).status).toBe(400)
    expect((await addRepayment(req('POST', { original_amount: 10 }), ctx({ id: OTHER, loanId: fromGvd.id }))).status).toBe(404)

    const accRes = await json(await getAccounts(req('GET')))
    expect(Array.isArray(accRes.body)).toBe(true)
    const accounts = accRes.body
    const bal = Object.fromEntries(accounts.map((a: { id: string; balance: number }) => [a.id, a.balance]))
    expect(bal[USD_ACC]).toBe(10000 - 3000 + 1000)
    expect(bal[TJS_ACC]).toBe(50000 - 5000)
  })
})
