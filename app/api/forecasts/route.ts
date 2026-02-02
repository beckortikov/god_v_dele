import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

// GET - Fetch monthly forecasts
export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('monthly_forecasts')
            .select('*')
            .order('year', { ascending: false })
            .order('month_number', { ascending: false })

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching forecasts:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST - Create or update forecast
export async function POST(req: Request) {
    try {
        const body = await req.json()

        const { data, error } = await supabaseAdmin
            .from('monthly_forecasts')
            .upsert([body], { onConflict: 'month_number,year' })
            .select()

        if (error) throw error

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating/updating forecast:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
