/**
 * Event money (migration 033): suppliers (tour company, hotel…) with a contract amount,
 * payments to them (event expenses with supplier_id, paid from a «Год в деле» account or a loan),
 * and loans taken for the event with partial repayments.
 *
 * Amounts follow the expenses convention: `amount` in USD, `original_amount` in the operation's
 * currency, `exchange_rate` TJS per USD (1 for USD).
 */

export type Cur = 'USD' | 'TJS'

export const SUPPLIER_KINDS = [
  { value: 'tour', label: 'Тур-компания', category: 'Tour' },
  { value: 'hotel', label: 'Отель', category: 'Hotel' },
  { value: 'transport', label: 'Транспорт', category: 'Transport' },
  { value: 'venue', label: 'Площадка', category: 'Venue' },
  { value: 'other', label: 'Другое', category: 'Other' },
] as const
export type SupplierKind = (typeof SUPPLIER_KINDS)[number]['value']

export const supplierKindOf = (v: string | null | undefined) => SUPPLIER_KINDS.find(k => k.value === v) ?? SUPPLIER_KINDS[SUPPLIER_KINDS.length - 1]
export const isSupplierKind = (v: unknown): v is SupplierKind => typeof v === 'string' && SUPPLIER_KINDS.some(k => k.value === v)

export interface Money {
  amount: number
  currency: Cur
  original_amount: number
  exchange_rate: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => Number(v) || 0

/**
 * Money from a request body: either { currency, original_amount, exchange_rate } or the USD
 * `amount` alone. Returns the stored shape, or an error text.
 */
export function parseMoney(body: Record<string, unknown>, opts: { allowZero?: boolean } = {}): Money | { error: string } {
  const currency: Cur = body.currency === 'TJS' ? 'TJS' : 'USD'
  const original = num(body.original_amount ?? body.amount)
  if (!Number.isFinite(original) || original < 0 || (!opts.allowZero && original <= 0)) return { error: 'Укажите сумму' }
  if (original > 1e11) return { error: 'Слишком большая сумма' }
  const rate = currency === 'TJS' ? num(body.exchange_rate) : 1
  if (!(rate > 0)) return { error: 'Укажите курс сомони к доллару' }
  return { amount: round2(original / rate), currency, original_amount: round2(original), exchange_rate: rate }
}

/** A sum in another currency: same currency → the original; USD → TJS at `rate`, TJS → USD via the stored USD. */
export function inCurrency(m: { amount: unknown; original_amount?: unknown; currency?: string | null }, target: Cur, rate: number) {
  const cur = m.currency === 'TJS' ? 'TJS' : 'USD'
  if (cur === target) return num(m.original_amount ?? m.amount)
  return target === 'USD' ? num(m.amount) : num(m.amount) * rate
}

export interface SupplierRow {
  id: string
  name: string
  kind: string
  contract_amount: unknown
  contract_currency: string
  contract_original: unknown
  contract_rate: unknown
}

export interface PaymentRow {
  id?: string
  supplier_id?: string | null
  loan_id?: string | null
  account_id?: string | null
  amount: unknown
  original_amount?: unknown
  currency?: string | null
  expense_date?: string
}

/** Paid and left to pay, in the contract's currency and in USD. */
export function supplierTotals(s: SupplierRow, payments: PaymentRow[]) {
  const cur: Cur = s.contract_currency === 'TJS' ? 'TJS' : 'USD'
  const rate = num(s.contract_rate) || 1
  const mine = payments.filter(p => p.supplier_id === s.id)
  const paid = round2(mine.reduce((t, p) => t + inCurrency(p, cur, rate), 0))
  const paidUsd = round2(mine.reduce((t, p) => t + num(p.amount), 0))
  const contract = num(s.contract_original)
  const left = round2(Math.max(0, contract - paid))
  return {
    currency: cur,
    contract,
    paid,
    left,
    overpaid: round2(Math.max(0, paid - contract)),
    paid_usd: paidUsd,
    left_usd: cur === 'USD' ? left : round2(left / rate),
    payments: mine.length,
  }
}

export interface LoanRow {
  id: string
  source: string
  account_id?: string | null
  lender_name?: string | null
  amount: unknown
  currency: string
  original_amount: unknown
  exchange_rate: unknown
  received_on?: string
  due_on?: string | null
}

export interface RepaymentRow {
  id?: string
  loan_id: string
  amount: unknown
  currency?: string | null
  original_amount: unknown
  account_id?: string | null
  repaid_on?: string
}

/** Taken, repaid, still owed (loan currency and USD), spent on payments, overdue. */
export function loanTotals(l: LoanRow, repayments: RepaymentRow[], payments: PaymentRow[], today: string) {
  const cur: Cur = l.currency === 'TJS' ? 'TJS' : 'USD'
  const rate = num(l.exchange_rate) || 1
  const reps = repayments.filter(r => r.loan_id === l.id)
  const taken = num(l.original_amount)
  const repaid = round2(reps.reduce((t, r) => t + inCurrency(r, cur, rate), 0))
  const owed = round2(Math.max(0, taken - repaid))
  const spentUsd = round2(payments.filter(p => p.loan_id === l.id).reduce((t, p) => t + num(p.amount), 0))
  return {
    currency: cur,
    taken,
    repaid,
    owed,
    owed_usd: cur === 'USD' ? owed : round2(owed / rate),
    spent_usd: spentUsd,
    unspent_usd: round2(Math.max(0, num(l.amount) - spentUsd)),
    overdue: owed > 0 && !!l.due_on && l.due_on.slice(0, 10) < today,
    closed: owed <= 0,
  }
}

/**
 * How loans move «Год в деле» accounts, in each operation's own currency (callers make sure
 * it is the account's currency): a loan from an account takes money out, its repayments bring it
 * back; repaying someone else's loan from an account takes money out.
 */
export function loanAccountEffects(loans: LoanRow[], repayments: RepaymentRow[]) {
  const delta = new Map<string, { usd: number; original: number }>()
  const add = (id: string | null | undefined, sign: 1 | -1, m: { amount: unknown; original_amount: unknown }) => {
    if (!id) return
    const d = delta.get(id) ?? { usd: 0, original: 0 }
    d.usd += sign * num(m.amount)
    d.original += sign * num(m.original_amount)
    delta.set(id, d)
  }
  const byId = new Map(loans.map(l => [l.id, l]))
  for (const l of loans) if (l.source === 'account') add(l.account_id, -1, l)
  for (const r of repayments) {
    const l = byId.get(r.loan_id)
    if (!l) continue
    if (l.source === 'account') add(l.account_id, 1, r)
    else add(r.account_id, -1, r)
  }
  return delta
}

/** «Со счёта ГвД 2 доллар» / «Займ: Иванов» / «Займ со счёта ГвД 1» — where a payment's money came from. */
export function sourceLabel(p: PaymentRow, accounts: { id: string; name: string }[], loans: LoanRow[]) {
  if (p.loan_id) {
    const l = loans.find(x => x.id === p.loan_id)
    if (!l) return 'Из займа'
    return l.source === 'account' ? `Займ со счёта ${accounts.find(a => a.id === l.account_id)?.name ?? ''}`.trim() : `Займ: ${l.lender_name ?? ''}`.trim()
  }
  if (p.account_id) return `Со счёта ${accounts.find(a => a.id === p.account_id)?.name ?? ''}`.trim()
  return null
}

export const lenderLabel = (l: LoanRow, accounts: { id: string; name: string }[]) =>
  l.source === 'account' ? accounts.find(a => a.id === l.account_id)?.name ?? 'Счёт «Год в деле»' : l.lender_name || 'Без имени'
