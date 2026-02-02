import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

// GET - Fetch all participants with their program details
export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('participants')
            .select(`
        *,
        program:programs(*)
      `)
            .order('created_at', { ascending: false })

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching participants:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST - Create new participant
export async function POST(req: Request) {
    try {
        const body = await req.json()

        const { data, error } = await supabaseAdmin
            .from('participants')
            .insert([body])
            .select(`
        *,
        program:programs(*)
      `)

        if (error) throw error

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating participant:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// PUT - Update participant
export async function PUT(req: Request) {
    try {
        const body = await req.json()
        const { id, ...updateData } = body

        if (!id) {
            return NextResponse.json({ error: 'Participant ID is required' }, { status: 400 })
        }

        const { data, error } = await supabaseAdmin
            .from('participants')
            .update(updateData)
            .eq('id', id)
            .select(`
        *,
        program:programs(*)
      `)

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error updating participant:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// DELETE - Delete participant
export async function DELETE(req: Request) {
    try {
        const body = await req.json()
        const { id } = body

        if (!id) {
            return NextResponse.json({ error: 'Participant ID is required' }, { status: 400 })
        }

        const { error } = await supabaseAdmin
            .from('participants')
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting participant:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
