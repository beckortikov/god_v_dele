import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { rowMoney, roundMoneyFields } from '@/lib/audit-labels'
import { eventName, participantNames } from '@/app/api/audit/_server'
import { isFunnelStage, parseContactDate, stageAfterPayment, type FunnelStage } from '@/lib/event-funnel'
import { guarded, loadFunnel, recordHistory } from '@/lib/event-funnel-server'

/** Planned price of participation (migration 034), not money received. */
function priceFields(a: any) {
    const currency = a.price_currency === 'TJS' ? 'TJS' : 'USD'
    const original = Math.max(0, Number(a.price_original ?? a.price) || 0)
    const rate = currency === 'TJS' ? Number(a.exchange_rate) || 0 : 1
    const usd = currency === 'TJS' ? (rate > 0 ? original / rate : 0) : original
    return { price: Math.round(usd * 100) / 100, price_currency: currency, price_original: Math.round(original * 100) / 100 }
}

/** Stage for a new row: the one sent, or «Оплатил» when it comes with a payment. */
function initialStage(a: any): FunnelStage {
    return stageAfterPayment(isFunnelStage(a.funnel_stage) ? a.funnel_stage : 'new', Number(a.payment_received) || 0)
}

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    return guarded('fetching attendees', async () => {
        const { rows, team, staff } = await loadFunnel(req, id, { withMoney: true })
        return NextResponse.json({ data: rows, team, staff }, { status: 200 })
    })
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await req.json()

        let data, error

        // Check if this is a batch insert (array of attendees)
        if (body.attendees && Array.isArray(body.attendees)) {
            const attendeesData = body.attendees.map((attendee: any) => ({
                event_id: id,
                attendee_type: attendee.attendee_type,
                participant_id: attendee.participant_id || null,
                guest_name: attendee.guest_name || null,
                guest_email: attendee.guest_email || null,
                guest_phone: attendee.guest_phone || null,
                payment_received: attendee.payment_received || 0,
                currency: attendee.currency || 'USD',
                original_amount: attendee.original_amount,
                exchange_rate: attendee.exchange_rate || 1,
                attendance_status: attendee.attendance_status || 'registered',
                payment_notes: attendee.payment_notes || null,
                ...('price' in attendee || 'price_original' in attendee ? priceFields(attendee) : {}),
                funnel_stage: initialStage(attendee),
            }))

            const res = await db
                .from('event_attendees')
                .insert(roundMoneyFields(attendeesData))
                .select()
            
            data = res.data
            error = res.error
        } else {
            // Single attendee insert
            const attendeeData = {
                event_id: id,
                attendee_type: body.attendee_type,
                participant_id: body.participant_id || null,
                guest_name: body.guest_name || null,
                guest_email: body.guest_email || null,
                guest_phone: body.guest_phone || null,
                payment_received: body.payment_received || 0,
                currency: body.currency || 'USD',
                original_amount: body.original_amount,
                exchange_rate: body.exchange_rate || 1,
                attendance_status: body.attendance_status || 'registered',
                payment_notes: body.payment_notes || null,
                ...('price' in body || 'price_original' in body ? priceFields(body) : {}),
                funnel_stage: initialStage(body),
                ...(parseContactDate(body.next_contact_on) ? { next_contact_on: parseContactDate(body.next_contact_on) } : {}),
            }

            const res = await db
                .from('event_attendees')
                .insert([roundMoneyFields(attendeeData)])
                .select()
            
            data = res.data
            error = res.error
        }

        if (error) throw error

        if (data?.length) {
            await recordHistory(req, data.map((a: any) => ({ attendee_id: a.id, kind: 'added' as const, body: a.funnel_stage || 'new' })))
            const [evName, names] = await Promise.all([
                eventName(id),
                participantNames(data.map((a: any) => a.participant_id)),
            ])
            await Promise.all(
                data.map((a: any) =>
                    logAudit(req, {
                        table: 'event_attendees',
                        recordId: a.id,
                        action: 'create',
                        summary: `Гость «${names[a.participant_id] || a.guest_name || 'без имени'}» на «${evName || 'мероприятие'}» ${rowMoney(a, 'payment_received')}`,
                        after: a,
                    })
                )
            )
        }

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error adding attendee:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
