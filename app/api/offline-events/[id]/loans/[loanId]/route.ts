import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { rowMoney } from '@/lib/audit-labels'
import { eventName } from '@/app/api/audit/_server'
import { loanFields } from '../_lib'

type Ctx = { params: Promise<{ id: string; loanId: string }> }

async function find(id: string, loanId: string) {
    const { data, error } = await db.from('event_loans').select('*').eq('id', loanId).eq('event_id', id).maybeSingle()
    if (error) throw error
    return data as Record<string, any> | null
}

export async function PUT(req: Request, { params }: Ctx) {
    try {
        const { id, loanId } = await params
        const before = await find(id, loanId)
        if (!before) return NextResponse.json({ error: 'Займ не найден' }, { status: 404 })
        const parsed = await loanFields(await req.json().catch(() => ({})))
        if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
        if (parsed.fields.currency !== before.currency) {
            const { data: reps, error: repError } = await db.from('event_loan_repayments').select('id').eq('loan_id', loanId).limit(1)
            if (repError) throw repError
            if (reps?.length) return NextResponse.json({ error: 'По займу уже есть возвраты: валюту менять нельзя' }, { status: 400 })
        }
        const { data, error } = await db.from('event_loans').update({ ...parsed.fields, updated_at: new Date().toISOString() }).eq('id', loanId).select().single()
        if (error) throw error
        await logAudit(req, { table: 'event_loans', recordId: loanId, action: 'update', summary: `Займ ${rowMoney(data)} — мероприятие «${(await eventName(id)) || '—'}»`, before, after: data })
        return NextResponse.json({ data })
    } catch (error: any) {
        console.error('Error updating loan:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/** Removes the loan with its repayments; payments made from it stay, without the source. */
export async function DELETE(req: Request, { params }: Ctx) {
    try {
        const { id, loanId } = await params
        const before = await find(id, loanId)
        if (!before) return NextResponse.json({ error: 'Займ не найден' }, { status: 404 })
        const { error } = await db.from('event_loans').delete().eq('id', loanId)
        if (error) throw error
        await logAudit(req, { table: 'event_loans', recordId: loanId, action: 'delete', summary: `Займ ${rowMoney(before)} — мероприятие «${(await eventName(id)) || '—'}»`, before })
        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error deleting loan:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
