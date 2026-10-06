import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { logAudit, fetchRow } from '@/lib/audit'
import { participantName } from '@/app/api/audit/_server'

// High-volume: the журнал keeps a compact summary and only the saved row
const wheelSummary = async (row: any) =>
    `Колесо бизнеса: ${(await participantName(row?.participant_id)) || 'участник'}, ${String(row?.month ?? '').toLowerCase()} ${row?.year ?? ''}`

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

        const { data: existing } = await supabaseAdmin
            .from('business_wheel_entries')
            .select('id')
            .eq('participant_id', participant_id).eq('year', parsedYear).eq('month', month)
            .maybeSingle()

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

        if (data?.[0]) {
            await logAudit(req, {
                table: 'business_wheel_entries',
                recordId: data[0].id,
                action: existing ? 'update' : 'create',
                summary: await wheelSummary(data[0]),
                after: data[0],
            })
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

        // Keep the full row on delete so it can be restored from the корзина
        const before = await fetchRow('business_wheel_entries', id)

        const { error } = await supabaseAdmin
            .from('business_wheel_entries')
            .delete()
            .eq('id', id)

        if (error) throw error

        if (before) {
            await logAudit(req, { table: 'business_wheel_entries', recordId: id, action: 'delete', summary: await wheelSummary(before), before })
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting business wheel entry:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
