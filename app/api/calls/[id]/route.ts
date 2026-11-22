import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { callerId, guarded, loadFunnel } from '@/lib/event-funnel-server'

/** One event for calling: the people, their contacts, stage, callback date and notes. No money. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return guarded('loading call list', async () => {
        const { data: event, error } = await db.from('offline_events').select('id, name, event_date, location, status').eq('id', id).maybeSingle()
        if (error) throw error
        if (!event) return NextResponse.json({ error: 'Мероприятие не найдено' }, { status: 404 })
        const { rows, team, staff } = await loadFunnel(req, id, { withMoney: false })
        return NextResponse.json({ event, data: rows, team, staff, me: callerId(req) })
    })
}
