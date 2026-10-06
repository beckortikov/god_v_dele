import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, logAudit } from '@/lib/audit'
import { changeSuffix, roundMoneyFields } from '@/lib/audit-labels'

// GET - Fetch all offline events
export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('offline_events')
            .select(`
                *,
                attendees_count:event_attendees(count)
            `)
            .order('event_date', { ascending: false })

        if (error) throw error

        // Transform data to include the count in the main object if needed, 
        // or just use the returned structure.
        // Supabase returns count as [{ count: N }] array for one-to-many.
        const formattedData = data.map((event: any) => ({
            ...event,
            attendees_attended: event.attendees_count?.[0]?.count || 0
        }))

        return NextResponse.json({ data: formattedData }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching offline events:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST - Create new event
export async function POST(req: Request) {
    try {
        const body = await req.json()

        // Filter only valid fields for new schema
        const eventData = {
            name: body.name,
            description: body.description,
            event_date: body.event_date,
            location: body.location,
            status: body.status || 'planned'
        }

        const { data, error } = await supabaseAdmin
            .from('offline_events')
            .insert([eventData])
            .select()

        if (error) throw error

        if (data?.[0]) {
            await logAudit(req, {
                table: 'offline_events',
                recordId: data[0].id,
                action: 'create',
                summary: `Мероприятие «${data[0].name}»`,
                after: data[0],
            })
        }

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating offline event:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// PUT - Update event
export async function PUT(req: Request) {
    try {
        const body = await req.json()
        const { id, ...rawUpdate } = body

        if (!id) {
            return NextResponse.json({ error: 'Event ID is required' }, { status: 400 })
        }

        const updateData = roundMoneyFields(rawUpdate)
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
