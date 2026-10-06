import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { logAudit } from '@/lib/audit'
import { changeSuffix, monthLabel, roundMoneyFields } from '@/lib/audit-labels'
import { formatMoney } from '@/lib/format'

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
        const body = roundMoneyFields(await req.json())

        // Upsert: read the current row first so the журнал records update vs create
        let before: any = null
        if (body && !Array.isArray(body) && body.month_number != null && body.year != null) {
            const { data: existing } = await supabaseAdmin
                .from('monthly_forecasts')
                .select('*')
                .eq('month_number', body.month_number)
                .eq('year', body.year)
                .maybeSingle()
            before = existing ?? null
        }

        const { data, error } = await supabaseAdmin
            .from('monthly_forecasts')
            .upsert([body], { onConflict: 'month_number,year' })
            .select()

        if (error) throw error

        const after = data?.[0]
        if (after) {
            const summary = `Прогноз на ${monthLabel(after.month_number, after.year)}: доход ${formatMoney(after.planned_income)}, расходы ${formatMoney(after.planned_expenses)}`
            await logAudit(req, {
                table: 'monthly_forecasts',
                recordId: after.id,
                action: before ? 'update' : 'create',
                summary: before ? `${summary}${changeSuffix(before, after)}` : summary,
                before,
                after,
            })
        }

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating/updating forecast:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
