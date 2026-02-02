import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

// GET - Fetch all programs
export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('programs')
            .select('*')
            .order('name', { ascending: true })

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching programs:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST - Create a new program
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { name, price_per_month, duration_months } = body

        if (!name || !price_per_month || !duration_months) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const { data, error } = await supabaseAdmin
            .from('programs')
            .insert([{ name, price_per_month, duration_months }])
            .select()

        if (error) throw error

        return NextResponse.json({ data: data[0] }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating program:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
