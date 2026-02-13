import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string; attendeeId: string }> }
) {
    try {
        const { attendeeId } = await params
        const body = await req.json()

        const { data, error } = await supabaseAdmin
            .from('event_attendees')
            .update(body)
            .eq('id', attendeeId)
            .select()

        if (error) throw error

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

        const { error } = await supabaseAdmin
            .from('event_attendees')
            .delete()
            .eq('id', attendeeId)

        if (error) throw error

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting attendee:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
