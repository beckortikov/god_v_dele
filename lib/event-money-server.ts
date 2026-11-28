import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { todayISO } from '@/lib/format'
import {
  loanTotals,
  supplierTotals,
  type LoanRow,
  type PaymentRow,
  type RepaymentRow,
  type SupplierRow,
} from '@/lib/event-money'

/** Server side of event money (migration 033): link checks for payments and the event's money overview. */

type Row = Record<string, any>
type Err = { code?: string; message?: string } | null

export const MONEY_MIGRATION = {
  error: 'event_money_migration_required',
  message: 'Поставщики и займы ещё не подключены. Примените миграцию migrations/033_event_suppliers_loans.sql.',
}

/** A table or column of migration 033 is not there yet. */
export const moneyMissing = (e: Err) =>
  !!e && (e.code === '42P01' || e.code === '42703' || /event_suppliers|event_loans|event_loan_repayments|supplier_id|loan_id/.test(e.message ?? ''))

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function accountById(id: string) {
  const { data, error } = await db.from('accounts').select('id, name, currency').eq('id', id).maybeSingle()
  if (error) throw error
  return data as { id: string; name: string; currency: string } | null
}

async function ofEvent(table: 'event_suppliers' | 'event_loans', id: string, eventId: string) {
  const { data, error } = await db.from(table).select('*').eq('id', id).eq('event_id', eventId).maybeSingle()
  if (error) throw error
  return data as Row | null
}

/**
 * Checks who a payment goes to and where its money comes from, within this event.
 * A payment comes either from a «Год в деле» account (its currency must match) or from a loan,
 * not both. Returns the columns to store, or an error text.
 */
export async function paymentLinks(eventId: string, body: Row, currency: string): Promise<{ fields: Row } | { error: string }> {
  const fields: Row = {}
  if ('supplier_id' in body) {
    if (body.supplier_id) {
      if (!(await ofEvent('event_suppliers', String(body.supplier_id), eventId))) return { error: 'Поставщик не из этого мероприятия' }
      fields.supplier_id = body.supplier_id
    } else fields.supplier_id = null
  }
  const accountId = body.account_id || null
  const loanId = body.loan_id || null
  if (accountId && loanId) return { error: 'Выберите что-то одно: счёт или займ' }
  if ('account_id' in body) {
    if (accountId) {
      const acc = await accountById(String(accountId))
      if (!acc) return { error: 'Счёт не найден' }
      if ((acc.currency === 'TJS' ? 'TJS' : 'USD') !== currency) return { error: `Счёт «${acc.name}» в ${acc.currency}: оплата должна быть в той же валюте` }
    }
    fields.account_id = accountId
  }
  if ('loan_id' in body) {
    if (loanId && !(await ofEvent('event_loans', String(loanId), eventId))) return { error: 'Займ не из этого мероприятия' }
    fields.loan_id = loanId
  }
  return { fields }
}

/** Suppliers with paid / left, loans with repayments and what is still owed, and the totals. */
export async function loadEventMoney(eventId: string) {
  const [suppliersRes, loansRes, paymentsRes, accountsRes] = await Promise.all([
    db.from('event_suppliers').select('*').eq('event_id', eventId).order('created_at', { ascending: true }),
    db.from('event_loans').select('*').eq('event_id', eventId).order('received_on', { ascending: true }),
    db.from('expenses').select('id, name, amount, original_amount, currency, expense_date, supplier_id, loan_id, account_id').eq('event_id', eventId),
    db.from('accounts').select('id, name, currency').order('created_at', { ascending: true }),
  ])
  for (const r of [suppliersRes, loansRes, paymentsRes]) if (r.error) return { missing: moneyMissing(r.error), error: r.error }
  if (accountsRes.error) throw accountsRes.error

  const loans = (loansRes.data ?? []) as Row[]
  let repayments: Row[] = []
  if (loans.length) {
    const r = await db.from('event_loan_repayments').select('*').in('loan_id', loans.map(l => l.id)).order('repaid_on', { ascending: true })
    if (r.error) return { missing: moneyMissing(r.error), error: r.error }
    repayments = r.data as Row[]
  }
  const payments = (paymentsRes.data ?? []) as PaymentRow[]
  const today = todayISO()

  const suppliers = ((suppliersRes.data ?? []) as Row[]).map(s => ({ ...s, totals: supplierTotals(s as SupplierRow, payments) }) as Row & { totals: ReturnType<typeof supplierTotals> })
  const loansOut = loans.map(l => ({
    ...l,
    repayments: repayments.filter(r => r.loan_id === l.id),
    totals: loanTotals(l as LoanRow, repayments as RepaymentRow[], payments, today),
  }))

  const sum = (xs: number[]) => Math.round(xs.reduce((t, x) => t + x, 0) * 100) / 100
  return {
    data: {
      suppliers,
      loans: loansOut,
      accounts: accountsRes.data ?? [],
      totals: {
        contracts_usd: sum(suppliers.map(s => Number(s.contract_amount) || 0)),
        suppliers_paid_usd: sum(suppliers.map(s => s.totals.paid_usd)),
        suppliers_left_usd: sum(suppliers.map(s => s.totals.left_usd)),
        loans_taken_usd: sum(loans.map(l => Number(l.amount) || 0)),
        loans_owed_usd: sum(loansOut.map(l => l.totals.owed_usd)),
        loans_overdue: loansOut.filter(l => l.totals.overdue).length,
      },
    },
  }
}
