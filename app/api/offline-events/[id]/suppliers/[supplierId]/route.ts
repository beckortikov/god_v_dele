import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { eventName } from '@/app/api/audit/_server'
import { supplierFields } from '../_lib'

type Ctx = { params: Promise<{ id: string; supplierId: string }> }

async function find(id: string, supplierId: string) {
    const { data, error } = await db.from('event_suppliers').select('*').eq('id', supplierId).eq('event_id', id).maybeSingle()
    if (error) throw error
    return data as Record<string, any> | null
}

export async function PUT(req: Request, { params }: Ctx) {
    try {
        const { id, supplierId } = await params
        const before = await find(id, supplierId)
        if (!before) return NextResponse.json({ error: 'Поставщик не найден' }, { status: 404 })
        const parsed = supplierFields(await req.json().catch(() => ({})), true)
        if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
        const { data, error } = await db.from('event_suppliers').update({ ...parsed.fields, updated_at: new Date().toISOString() }).eq('id', supplierId).select().single()
        if (error) throw error
        await logAudit(req, { table: 'event_suppliers', recordId: supplierId, action: 'update', summary: `Поставщик «${data.name}» — мероприятие «${(await eventName(id)) || '—'}»`, before, after: data })
        return NextResponse.json({ data })
    } catch (error: any) {
        console.error('Error updating supplier:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/** Payments to the supplier stay as event expenses, just without «кому». */
export async function DELETE(req: Request, { params }: Ctx) {
    try {
        const { id, supplierId } = await params
        const before = await find(id, supplierId)
        if (!before) return NextResponse.json({ error: 'Поставщик не найден' }, { status: 404 })
        const { error } = await db.from('event_suppliers').delete().eq('id', supplierId)
        if (error) throw error
        await logAudit(req, { table: 'event_suppliers', recordId: supplierId, action: 'delete', summary: `Поставщик «${before.name}» — мероприятие «${(await eventName(id)) || '—'}»`, before })
        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error deleting supplier:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
