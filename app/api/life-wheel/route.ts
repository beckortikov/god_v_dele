import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { logAudit, fetchRow } from '@/lib/audit'
import { participantName } from '@/app/api/audit/_server'

// High-volume: the журнал keeps a compact summary and only the saved row
const wheelSummary = async (row: any) =>
    `Колесо жизни: ${(await participantName(row?.participant_id)) || 'участник'}, ${row?.period_label === 'template' ? 'шаблон' : row?.period_label ?? ''}`

// GET - Fetch life wheel entry for a participant/period
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const participant_id = searchParams.get('participant_id')
        const period_type = searchParams.get('period_type')
        const period_label = searchParams.get('period_label')

        let query = supabaseAdmin
            .from('life_wheel_entries')
            .select('*')
            .order('period_label', { ascending: false })

        if (participant_id) query = query.eq('participant_id', participant_id)
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

        const { data: existing } = await supabaseAdmin
            .from('life_wheel_entries')
            .select('id')
            .eq('participant_id', participant_id).eq('period_type', period_type).eq('period_label', period_label)
            .maybeSingle()

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

        if (error) {
            console.error('Supabase error:', error)
            throw error
        }

        if (data?.[0]) {
            await logAudit(req, {
                table: 'life_wheel_entries',
                recordId: data[0].id,
                action: existing ? 'update' : 'create',
                summary: await wheelSummary(data[0]),
                after: data[0],
            })
        }

        return NextResponse.json({ data }, { status: 200 })
    } catch (error: any) {
        console.error('API Error saving life wheel:', error)
        return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
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

        // Keep the full row on delete so it can be restored from the корзина
        const before = await fetchRow('life_wheel_entries', id)

        const { error } = await supabaseAdmin
            .from('life_wheel_entries')
            .delete()
            .eq('id', id)

        if (error) throw error

        if (before) {
            await logAudit(req, { table: 'life_wheel_entries', recordId: id, action: 'delete', summary: await wheelSummary(before), before })
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting life wheel entry:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
