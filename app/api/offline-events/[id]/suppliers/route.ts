import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { eventName } from '@/app/api/audit/_server'
import { MONEY_MIGRATION, moneyMissing } from '@/lib/event-money-server'
import { supplierFields } from './_lib'

/** New supplier of the event: tour company, hotel, transport, venue. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const parsed = supplierFields(await req.json().catch(() => ({})), false)
        if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
        const { data, error } = await db.from('event_suppliers').insert({ event_id: id, ...parsed.fields }).select().single()
        if (moneyMissing(error)) return NextResponse.json(MONEY_MIGRATION, { status: 503 })
        if (error) throw error
        await logAudit(req, { table: 'event_suppliers', recordId: data.id, action: 'create', summary: `Поставщик «${data.name}» — мероприятие «${(await eventName(id)) || '—'}»`, after: data })
        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error adding supplier:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
