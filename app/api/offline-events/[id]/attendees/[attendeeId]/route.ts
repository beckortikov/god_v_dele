import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, logAudit } from '@/lib/audit'
import { changeSuffix, rowMoney, roundMoneyFields } from '@/lib/audit-labels'
import { eventName, participantName } from '@/app/api/audit/_server'

async function attendeeLabel(row: any) {
    const [who, ev] = await Promise.all([
        row?.participant_id ? participantName(row.participant_id) : Promise.resolve(''),
        eventName(row?.event_id),
    ])
    return `Гость «${who || row?.guest_name || 'без имени'}» на «${ev || 'мероприятие'}» ${rowMoney(row, 'payment_received')}`
}

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string; attendeeId: string }> }
) {
    try {
        const { attendeeId } = await params
        const body = roundMoneyFields(await req.json())
        const before = await fetchRow('event_attendees', attendeeId)

        const { data, error } = await supabaseAdmin
            .from('event_attendees')
            .update(body)
            .eq('id', attendeeId)
            .select()

        if (error) throw error

        if (data?.[0]) {
            await logAudit(req, {
                table: 'event_attendees',
                recordId: attendeeId,
                action: 'update',
                summary: `${await attendeeLabel(data[0])}${changeSuffix(before, data[0])}`,
                before,
                after: data[0],
            })
        }

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error updating attendee:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string; attendeeId: string }> }
) {
    try {
        const { attendeeId } = await params
        const before = await fetchRow('event_attendees', attendeeId)
        const label = before ? await attendeeLabel(before) : ''

        const { error } = await supabaseAdmin
            .from('event_attendees')
            .delete()
            .eq('id', attendeeId)

        if (error) throw error

        if (before) {
            await logAudit(req, { table: 'event_attendees', recordId: attendeeId, action: 'delete', summary: label, before })
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting attendee:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
