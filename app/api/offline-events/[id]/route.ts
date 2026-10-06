import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, logAudit } from '@/lib/audit'
import { changeSuffix, rowMoney } from '@/lib/audit-labels'
import { fetchRowsWhere, logDeletedRows, participantNames } from '@/app/api/audit/_server'

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        const { data, error } = await supabaseAdmin
            .from('offline_events')
            .select('*')
            .eq('id', id)
            .single()

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching offline event:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await req.json()

        // Safety check: remove read-only fields if they are sent?
        // The trigger will overwrite totals anyway if someone tries to set them,
        // but better to strip them to avoid confusion.
        // actually, let's just update allowed fields.

        const updateData: any = {}
        if (body.name !== undefined) updateData.name = body.name
        if (body.description !== undefined) updateData.description = body.description
        if (body.event_date !== undefined) updateData.event_date = body.event_date
        if (body.location !== undefined) updateData.location = body.location
        if (body.status !== undefined) updateData.status = body.status

        const before = await fetchRow('offline_events', id)

        const { data, error } = await supabaseAdmin
            .from('offline_events')
            .update(updateData)
            .eq('id', id)
            .select()

        if (error) throw error

        if (data?.[0]) {
            await logAudit(req, {
                table: 'offline_events',
                recordId: id,
                action: 'update',
                summary: `Мероприятие «${data[0].name}»${changeSuffix(before, data[0])}`,
                before,
                after: data[0],
            })
        }

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error updating offline event:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        const before = await fetchRow('offline_events', id)
        // Attendees and event expenses are removed by ON DELETE CASCADE — keep them in the корзина too
        const attendees = before ? await fetchRowsWhere('event_attendees', 'event_id', id) : []
        const expenses = before ? await fetchRowsWhere('expenses', 'event_id', id) : []

        const { error } = await supabaseAdmin
            .from('offline_events')
            .delete()
            .eq('id', id)

        if (error) throw error

        if (before) {
            await logAudit(req, {
                table: 'offline_events',
                recordId: id,
                action: 'delete',
                summary: `Мероприятие «${before.name}»`,
                before,
            })
            const names = await participantNames(attendees.map(a => a.participant_id))
            const suffix = ` (вместе с мероприятием «${before.name}»)`
            await logDeletedRows(req, 'event_attendees', attendees, a =>
                `Гость «${names[a.participant_id] || a.guest_name || 'без имени'}» ${rowMoney(a, 'payment_received')}${suffix}`
            )
            await logDeletedRows(req, 'expenses', expenses, e => `Расход «${e.name}» ${rowMoney(e)}${suffix}`)
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting offline event:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
