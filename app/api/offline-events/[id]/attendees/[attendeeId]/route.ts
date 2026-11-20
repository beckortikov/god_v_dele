import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchRow, logAudit } from '@/lib/audit'
import { changeSuffix, rowMoney, roundMoneyFields } from '@/lib/audit-labels'
import { eventName, participantName } from '@/app/api/audit/_server'
import { isFunnelStage, parseContactDate } from '@/lib/event-funnel'

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
    try {
        const { id, attendeeId } = await params
        const raw = await req.json()
        const body: Record<string, unknown> = {}
        for (const k of EDITABLE) if (k in raw) body[k] = raw[k]
        if ('funnel_stage' in body && !isFunnelStage(body.funnel_stage)) {
            return NextResponse.json({ error: 'Неизвестный этап воронки' }, { status: 400 })
        }
        if ('next_contact_on' in body) {
            const d = parseContactDate(body.next_contact_on)
            if (d === undefined) return NextResponse.json({ error: 'Дата «перезвонить» в формате ГГГГ-ММ-ДД' }, { status: 400 })
            body.next_contact_on = d
        }
        if (!Object.keys(body).length) return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 })
        const before = await fetchRow('event_attendees', attendeeId)

        const { data, error } = await db
            .from('event_attendees')
            .update(roundMoneyFields(body))
            .eq('id', attendeeId)
            .eq('event_id', id)
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
