import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { rowMoney } from '@/lib/audit-labels'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; loanId: string; repaymentId: string }> }) {
    try {
        const { id, loanId, repaymentId } = await params
        const { data: loan, error: loanError } = await db.from('event_loans').select('id').eq('id', loanId).eq('event_id', id).maybeSingle()
        if (loanError) throw loanError
        if (!loan) return NextResponse.json({ error: 'Займ не найден' }, { status: 404 })
        const { data: before, error: findError } = await db.from('event_loan_repayments').select('*').eq('id', repaymentId).eq('loan_id', loanId).maybeSingle()
        if (findError) throw findError
        if (!before) return NextResponse.json({ error: 'Возврат не найден' }, { status: 404 })
        const { error } = await db.from('event_loan_repayments').delete().eq('id', repaymentId)
        if (error) throw error
        await logAudit(req, { table: 'event_loan_repayments', recordId: repaymentId, action: 'delete', summary: `Возврат займа ${rowMoney(before)}`, before })
        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error deleting repayment:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
