
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, logAudit } from '@/lib/audit'
import { changeSuffix, rowMoney, roundMoneyFields } from '@/lib/audit-labels'
import { eventName } from '@/app/api/audit/_server'

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
    try {
        const { id, expenseId } = await params
        const body = roundMoneyFields(await req.json())
        const before = await fetchRow('expenses', expenseId)

        const { data, error } = await supabaseAdmin
            .from('expenses')
            .update(body)
            .eq('id', expenseId)
            .select()

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

        const { error } = await supabaseAdmin
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
