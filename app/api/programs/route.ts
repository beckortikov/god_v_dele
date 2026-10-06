import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { logAudit } from '@/lib/audit'
import { roundMoney } from '@/lib/money'
import { formatMoney } from '@/lib/format'

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
            .insert([{ name, price_per_month: roundMoney(price_per_month), duration_months }])
            .select()

        if (error) throw error

        if (data?.[0]) {
            await logAudit(request, {
                table: 'programs',
                recordId: data[0].id,
                action: 'create',
                summary: `Программа «${data[0].name}», ${formatMoney(data[0].price_per_month)} в месяц`,
                after: data[0],
            })
        }

        return NextResponse.json({ data: data[0] }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating program:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
