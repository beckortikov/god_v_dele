import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

// GET - Fetch expenses with optional filters
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const category = searchParams.get('category')
        const eventId = searchParams.get('event_id')

        let query = supabaseAdmin
            .from('expenses')
            .select('*')

        if (category) {
            query = query.eq('category', category)
        }
        if (eventId) {
            query = query.eq('event_id', eventId)
        }

        const { data, error } = await query.order('expense_date', { ascending: false })

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching expenses:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST - Create new expense
export async function POST(req: Request) {
    try {
        const body = await req.json()

        const { data, error } = await supabaseAdmin
            .from('expenses')
            .insert([body])
            .select()

        if (error) throw error

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating expense:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
