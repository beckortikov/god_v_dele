import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { rowMoney } from '@/lib/audit-labels'
import { eventName } from '@/app/api/audit/_server'
import { parseMoney } from '@/lib/event-money'
import { accountById } from '@/lib/event-money-server'

/**
 * A repayment of the loan, in the loan's currency. For a loan from a «Год в деле» account the money
 * goes back to that account; for a person's loan it may be paid from an account (account_id).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; loanId: string }> }) {
    try {
        const { id, loanId } = await params
        const { data: loan, error: loanError } = await db.from('event_loans').select('*').eq('id', loanId).eq('event_id', id).maybeSingle()
        if (loanError) throw loanError
        if (!loan) return NextResponse.json({ error: 'Займ не найден' }, { status: 404 })
        const body = await req.json().catch(() => ({}))
        const m = parseMoney({ ...body, currency: loan.currency, exchange_rate: loan.currency === 'TJS' ? body.exchange_rate ?? loan.exchange_rate : 1 })
        if ('error' in m) return NextResponse.json({ error: m.error }, { status: 400 })
        let accountId: string | null = null
        if (loan.source === 'person' && body.account_id) {
            const acc = await accountById(String(body.account_id))
            if (!acc) return NextResponse.json({ error: 'Счёт не найден' }, { status: 400 })
            if ((acc.currency === 'TJS' ? 'TJS' : 'USD') !== m.currency) return NextResponse.json({ error: `Счёт «${acc.name}» в ${acc.currency}, а займ в ${m.currency}` }, { status: 400 })
            accountId = acc.id
        }
        const repaidOn = typeof body.repaid_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.repaid_on) ? body.repaid_on : new Date().toISOString().slice(0, 10)
        const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 1000) : null
        const { data, error } = await db.from('event_loan_repayments').insert({ loan_id: loanId, ...m, account_id: accountId, repaid_on: repaidOn, note }).select().single()
        if (error) throw error
        await logAudit(req, {
            table: 'event_loan_repayments',
            recordId: data.id,
            action: 'create',
            summary: `Возврат займа ${rowMoney(data)} ${loan.source === 'person' ? `«${loan.lender_name}»` : 'на счёт'} — мероприятие «${(await eventName(id)) || '—'}»`,
            after: data,
        })
        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error adding repayment:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
