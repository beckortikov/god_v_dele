import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchRow, logAudit } from '@/lib/audit'
import { rowMoney } from '@/lib/audit-labels'
import { eventName, participantName } from '@/app/api/audit/_server'
import { guarded, updateAttendee } from '@/lib/event-funnel-server'

/** Fields the client may change; anything else in the body is ignored. */
const EDITABLE = [
    'payment_received', 'original_amount', 'currency', 'exchange_rate', 'payment_date', 'payment_method',
    'payment_notes', 'attendance_status', 'notes', 'guest_name', 'guest_email', 'guest_phone',
    'funnel_stage', 'next_contact_on',
] as const

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
    const { id, attendeeId } = await params
    return guarded('updating attendee', async () => updateAttendee(req, id, attendeeId, await req.json(), EDITABLE))
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string; attendeeId: string }> }
) {
    try {
        const { attendeeId } = await params
        const before = await fetchRow('event_attendees', attendeeId)
        const label = before ? await attendeeLabel(before) : ''

        const { error } = await db
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
