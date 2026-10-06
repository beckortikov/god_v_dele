import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, getActor, logAudit } from '@/lib/audit'
import { roundMoney, roundRate } from '@/lib/money'
import { todayISO } from '@/lib/format'
import { byNewest, LEDGER_TABLE, ledgerEnabled, ledgerMock, ledgerUnavailable, loadTransactions } from '@/lib/payments-ledger'
import { findOrCreateMonth, loadParticipants, receiptSummary } from '../_server'

export const dynamic = 'force-dynamic'

const fail = (error: string, status: number, extra?: Record<string, unknown>) => NextResponse.json({ error, ...extra }, { status })
const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/payments/transactions
 *   ?participant_id= &monthly_payment_id= &account_id= &from=YYYY-MM-DD &to=YYYY-MM-DD
 *
 * Receipts (поступления) with the participant name, program and account,
 * newest first. While migration 014 is not applied: `{ ledger: false, data: [] }`.
 */
export async function GET(req: Request) {
  try {
    if (!(await ledgerEnabled(req))) return NextResponse.json({ ledger: false, data: [] })
    const sp = new URL(req.url).searchParams
    const from = sp.get('from')
    const to = sp.get('to')
    if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return fail('Даты в формате ГГГГ-ММ-ДД', 400)
    const rows = await loadTransactions(req, {
      participantId: sp.get('participant_id'),
      monthlyPaymentId: sp.get('monthly_payment_id'),
      accountId: sp.get('account_id'),
      from,
      to,
      details: true,
    })
    return NextResponse.json({ ledger: true, preview: ledgerMock(req) || undefined, data: rows.sort(byNewest) })
  } catch (error: any) {
    console.error('Error fetching payment transactions:', error)
    return fail(error.message || 'Не удалось загрузить поступления', 500)
  }
}

/**
 * POST /api/payments/transactions
 * { participant_id, month_number, year, amount, currency, exchange_rate, paid_date, account_id, notes }
 *
 * Adds one receipt for the participant's month. `amount` is in `currency`
 * (USD or TJS); `exchange_rate` is units of that currency per 1 USD. The
 * monthly row is created when missing (plan = tariff or program price; an
 * existing plan is never changed); the database trigger then updates its
 * fact and status.
 */
export async function POST(req: Request) {
  try {
    const mock = ledgerMock(req)
    if (mock || !(await ledgerEnabled(req))) return NextResponse.json(ledgerUnavailable(mock), { status: 409 })

    const body = await req.json().catch(() => ({}))
    const month = Number(body?.month_number)
    const year = Number(body?.year)
    const currency = String(body?.currency || 'USD').toUpperCase()
    const original = roundMoney(body?.amount)
    const rate = currency === 'USD' ? 1 : roundRate(body?.exchange_rate)
    const paidDate = body?.paid_date ? String(body.paid_date).slice(0, 10) : todayISO()

    if (!body?.participant_id) return fail('Выберите участника', 400)
    if (!(month >= 1 && month <= 12) || !(year >= 2000 && year <= 2100)) return fail('Укажите месяц и год оплаты', 400)
    if (!(original > 0)) return fail('Сумма должна быть больше нуля', 400)
    if (!(rate > 0)) return fail('Укажите курс обмена', 400)
    if (!DATE.test(paidDate)) return fail('Дата оплаты в формате ГГГГ-ММ-ДД', 400)

    const [participant] = await loadParticipants([String(body.participant_id)])
    if (!participant) return fail('Участник не найден', 404)

    const { row: monthly } = await findOrCreateMonth(req, participant, month, year)

    const actor = getActor(req)
    const { data: tx, error } = await supabaseAdmin
      .from(LEDGER_TABLE)
      .insert([
        {
          monthly_payment_id: monthly.id,
          participant_id: participant.id,
          program_id: participant.program_id,
          amount_usd: roundMoney(original / rate),
          original_amount: original,
          currency,
          exchange_rate: rate,
          paid_date: paidDate,
          account_id: body?.account_id || null,
          notes: body?.notes ? String(body.notes).slice(0, 500) : null,
          created_by: actor.name || actor.id || null,
        },
      ])
      .select('*')
      .single()
    if (error) throw error

    await logAudit(req, {
      table: LEDGER_TABLE,
      recordId: tx.id,
      action: 'create',
      summary: receiptSummary(participant.name, tx, month, year),
      after: tx,
    })

    // The month after the trigger: fact, status, remainder
    const after = await fetchRow('monthly_payments', monthly.id)
    return NextResponse.json({ data: tx, month: after ?? monthly }, { status: 201 })
  } catch (error: any) {
    console.error('Error adding payment transaction:', error)
    return fail(error.message || 'Не удалось сохранить поступление', 500)
  }
}

/** DELETE /api/payments/transactions?id= — removes one receipt; the month is recalculated. */
export async function DELETE(req: Request) {
  try {
    const mock = ledgerMock(req)
    if (mock || !(await ledgerEnabled(req))) return NextResponse.json(ledgerUnavailable(mock), { status: 409 })

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return fail('Не указано поступление', 400)

    const before = await fetchRow(LEDGER_TABLE, id)
    if (!before) return fail('Поступление не найдено — возможно, его уже удалили', 404)
    const monthly = await fetchRow('monthly_payments', before.monthly_payment_id)
    const { data: person } = await supabaseAdmin.from('participants').select('name').eq('id', before.participant_id).maybeSingle()

    const { error } = await supabaseAdmin.from(LEDGER_TABLE).delete().eq('id', id)
    if (error) throw error

    await logAudit(req, {
      table: LEDGER_TABLE,
      recordId: id,
      action: 'delete',
      summary: receiptSummary(person?.name ?? '', before, Number(monthly?.month_number), Number(monthly?.year)),
      before,
    })

    const after = monthly ? await fetchRow('monthly_payments', monthly.id) : null
    return NextResponse.json({ success: true, month: after })
  } catch (error: any) {
    console.error('Error deleting payment transaction:', error)
    return fail(error.message || 'Не удалось удалить поступление', 500)
  }
}
