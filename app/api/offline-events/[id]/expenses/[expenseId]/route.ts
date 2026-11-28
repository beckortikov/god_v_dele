
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchRow, logAudit } from '@/lib/audit'
import { changeSuffix, rowMoney, roundMoneyFields } from '@/lib/audit-labels'
import { eventName } from '@/app/api/audit/_server'
import { MONEY_MIGRATION, moneyMissing, paymentLinks } from '@/lib/event-money-server'

/** Fields the client may change; anything else in the body is ignored. */
const EDITABLE = ['name', 'amount', 'category', 'expense_date', 'description', 'original_amount', 'currency', 'exchange_rate', 'status'] as const

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
    try {
        const { id, expenseId } = await params
        const raw = await req.json()
        const before = await fetchRow('expenses', expenseId)
        if (!before || before.event_id !== id) return NextResponse.json({ error: 'Расход не найден в этом мероприятии' }, { status: 404 })

        const body: Record<string, unknown> = {}
        for (const k of EDITABLE) if (k in raw) body[k] = raw[k]
        if ('supplier_id' in raw || 'account_id' in raw || 'loan_id' in raw) {
            const currency = (raw.currency ?? before.currency) === 'TJS' ? 'TJS' : 'USD'
            const links = await paymentLinks(id, raw, currency)
            if ('error' in links) return NextResponse.json({ error: links.error }, { status: 400 })
            Object.assign(body, links.fields)
        }

        const { data, error } = await db
            .from('expenses')
            .update(roundMoneyFields(body))
            .eq('id', expenseId)
            .select()

        if (moneyMissing(error)) return NextResponse.json(MONEY_MIGRATION, { status: 503 })
        if (error) throw error

        if (data?.[0]) {
            const ev = await eventName(data[0].event_id ?? id)
            await logAudit(req, {
                table: 'expenses',
                recordId: expenseId,
                action: 'update',
                summary: `Расход «${data[0].name}» ${rowMoney(data[0])} — мероприятие «${ev || '—'}»${changeSuffix(before, data[0])}`,
                before,
                after: data[0],
            })
        }

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error updating expense:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
    try {
        const { id, expenseId } = await params
        const before = await fetchRow('expenses', expenseId)
        const ev = before ? await eventName(before.event_id ?? id) : ''

        const { error } = await db
            .from('expenses')
            .delete()
            .eq('id', expenseId)

        if (error) throw error

        if (before) {
            await logAudit(req, {
                table: 'expenses',
                recordId: expenseId,
                action: 'delete',
                summary: `Расход «${before.name}» ${rowMoney(before)} — мероприятие «${ev || '—'}»`,
                before,
            })
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting expense:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
