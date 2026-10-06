import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, logAudit } from '@/lib/audit'
import { roundMoney, roundRate } from '@/lib/money'
import { TRANSFERS_TABLE, isMissingTable, migrationRequired } from './shared'

export const dynamic = 'force-dynamic'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

// GET /api/account-transfers?limit=50&account_id=…
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 500)
    const accountId = searchParams.get('account_id')

    let query = supabaseAdmin
      .from(TRANSFERS_TABLE)
      .select('*')
      .order('transfer_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
    if (accountId) query = query.or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`)

    const { data, error } = await query
    if (error) {
      if (isMissingTable(error)) return migrationRequired()
      throw error
    }
    return NextResponse.json({ data: data ?? [] })
  } catch (error: any) {
    console.error('Error fetching transfers:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

// POST /api/account-transfers
// { transfer_date, from_account_id, to_account_id, amount_from, amount_to?, exchange_rate?, note? }
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const fromId = String(body.from_account_id || '')
    const toId = String(body.to_account_id || '')
    const date = String(body.transfer_date || '')
    const amountFrom = roundMoney(body.amount_from)
    let amountTo = roundMoney(body.amount_to)
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null

    if (!fromId || !toId) return bad('Выберите счёт списания и счёт зачисления')
    if (fromId === toId) return bad('Счета списания и зачисления должны различаться')
    if (!ISO_DATE.test(date)) return bad('Укажите дату перевода')
    if (!(amountFrom > 0)) return bad('Укажите сумму перевода')

    const { data: accs, error: accError } = await supabaseAdmin.from('accounts').select('id, name, currency').in('id', [fromId, toId])
    if (accError) throw accError
    const from = accs?.find(a => a.id === fromId)
    const to = accs?.find(a => a.id === toId)
    if (!from || !to) return bad('Счёт не найден. Обновите страницу', 404)

    let rate = 1
    if (from.currency === to.currency) {
      amountTo = amountFrom
    } else {
      if (!(amountTo > 0)) return bad('Укажите сумму зачисления')
      const given = roundRate(body.exchange_rate)
      rate = given > 0 ? given : roundRate(Math.max(amountTo / amountFrom, amountFrom / amountTo))
    }

    const row = {
      transfer_date: date,
      from_account_id: fromId,
      to_account_id: toId,
      amount_from: amountFrom,
      amount_to: amountTo,
      exchange_rate: rate,
      note,
    }

    const { data, error } = await supabaseAdmin.from(TRANSFERS_TABLE).insert([row]).select().single()
    if (error) {
      if (isMissingTable(error)) return migrationRequired()
      throw error
    }

    await logAudit(req, {
      table: TRANSFERS_TABLE,
      recordId: data.id,
      action: 'create',
      summary: `Перевод ${from.name} → ${to.name}: ${amountFrom} ${from.currency} → ${amountTo} ${to.currency}`,
      after: data,
    })

    return NextResponse.json({ data }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating transfer:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/account-transfers?id=…
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return bad('ID is required')

    const before = await fetchRow(TRANSFERS_TABLE, id)
    const { data, error } = await supabaseAdmin.from(TRANSFERS_TABLE).delete().eq('id', id).select('id')
    if (error) {
      if (isMissingTable(error)) return migrationRequired()
      throw error
    }
    if (!data?.length) return bad('Перевод не найден', 404)

    await logAudit(req, {
      table: TRANSFERS_TABLE,
      recordId: id,
      action: 'delete',
      summary: before ? `Перевод на ${before.amount_from} от ${before.transfer_date}` : 'Перевод',
      before,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting transfer:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
