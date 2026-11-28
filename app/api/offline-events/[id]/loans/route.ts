import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { rowMoney } from '@/lib/audit-labels'
import { eventName } from '@/app/api/audit/_server'
import { MONEY_MIGRATION, moneyMissing } from '@/lib/event-money-server'
import { loanFields } from './_lib'

/** Money borrowed for the event: from a «Год в деле» account or from a person. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const parsed = await loanFields(await req.json().catch(() => ({})))
        if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
        const { data, error } = await db.from('event_loans').insert({ event_id: id, ...parsed.fields }).select().single()
        if (moneyMissing(error)) return NextResponse.json(MONEY_MIGRATION, { status: 503 })
        if (error) throw error
        await logAudit(req, {
            table: 'event_loans',
            recordId: data.id,
            action: 'create',
            summary: `Займ ${data.source === 'account' ? 'со счёта' : `у «${data.lender_name}»`} ${rowMoney(data)} — мероприятие «${(await eventName(id)) || '—'}»`,
            after: data,
        })
        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error adding loan:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
