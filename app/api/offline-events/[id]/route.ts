import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

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

        const { data, error } = await supabaseAdmin
            .from('offline_events')
            .update(updateData)
            .eq('id', id)
            .select()

        if (error) throw error

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

        const { error } = await supabaseAdmin
            .from('offline_events')
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting offline event:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
