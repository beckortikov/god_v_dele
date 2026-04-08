import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

// GET - Fetch life wheel entry for a participant/period
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const participant_id = searchParams.get('participant_id')
        const period_type = searchParams.get('period_type')
        const period_label = searchParams.get('period_label')

        if (!participant_id) {
            return NextResponse.json({ error: 'participant_id is required' }, { status: 400 })
        }

        let query = supabaseAdmin
            .from('life_wheel_entries')
            .select('*')
            .eq('participant_id', participant_id)
            .order('period_label', { ascending: false })

        if (period_type) query = query.eq('period_type', period_type)
        if (period_label) query = query.eq('period_label', period_label)

        const { data, error } = await query

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching life wheel:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST - Upsert life wheel entry
export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { participant_id, period_type, period_label, categories } = body

        if (!participant_id || !period_type || !period_label || !categories) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const { data, error } = await supabaseAdmin
            .from('life_wheel_entries')
            .upsert(
                {
                    participant_id,
                    period_type,
                    period_label,
                    categories,
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: 'participant_id,period_type,period_label',
                }
            )
            .select()

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error saving life wheel:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// DELETE - Delete life wheel entry
export async function DELETE(req: Request) {
    try {
        const body = await req.json()
        const { id } = body

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 })
        }

        const { error } = await supabaseAdmin
            .from('life_wheel_entries')
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting life wheel entry:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
