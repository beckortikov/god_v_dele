import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

// GET - Fetch business wheel entries
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const participant_id = searchParams.get('participant_id')
        const yearStr = searchParams.get('year')
        const month = searchParams.get('month')

        let query = supabaseAdmin
            .from('business_wheel_entries')
            .select('*')
            .order('year', { ascending: false })

        if (participant_id) {
            query = query.eq('participant_id', participant_id)
        }
        if (yearStr) {
            const year = parseInt(yearStr, 10)
            if (!isNaN(year)) {
                query = query.eq('year', year)
            }
        }
        if (month) {
            query = query.eq('month', month)
        }

        const { data, error } = await query

        if (error) throw error

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching business wheel:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST - Upsert business wheel entry
export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { participant_id, year, month, checked_items } = body

        if (!participant_id || year === undefined || !month || !checked_items) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const parsedYear = parseInt(year, 10)
        if (isNaN(parsedYear)) {
            return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
        }

        const { data, error } = await supabaseAdmin
            .from('business_wheel_entries')
            .upsert(
                {
                    participant_id,
                    year: parsedYear,
                    month,
                    checked_items,
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: 'participant_id,year,month',
                }
            )
            .select()

        if (error) {
            console.error('Supabase error:', error)
            throw error
        }

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('API Error saving business wheel:', error)
        return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
    }
}

// DELETE - Delete business wheel entry
export async function DELETE(req: Request) {
    try {
        const body = await req.json()
        const { id } = body

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 })
        }

        const { error } = await supabaseAdmin
            .from('business_wheel_entries')
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting business wheel entry:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
