import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params // event_id

        // Fetch attendees with joined participant info
        // note: nested select needs proper relationship setup or multiple queries.
        // simpler: select * from event_attendees where event_id = id
        // then manually fetch participant names if needed, or use Supabase join syntax:
        // select(..., participant:participants(name))

        const { data, error } = await supabaseAdmin
            .from('event_attendees')
            .select('*, participant:participants(name)')
            .eq('event_id', id)
            .order('created_at', { ascending: false })

        if (error) throw error

        // Flatten participant name if present
        const formattedData = data.map((item: any) => ({
            ...item,
            participant_name: item.participant?.name || null
        }))

        return NextResponse.json({ data: formattedData }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching attendees:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await req.json()

        // Validate event exists? (Constraint will handle it)
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
            payment_notes: body.payment_notes || null
        }

        const { data, error } = await supabaseAdmin
            .from('event_attendees')
            .insert([attendeeData])
            .select()

        if (error) throw error

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error adding attendee:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
