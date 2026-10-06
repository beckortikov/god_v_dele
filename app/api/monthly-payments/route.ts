import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, logAudit } from '@/lib/audit'
import { changeSuffix, monthLabel, rowMoney, roundMoneyFields } from '@/lib/audit-labels'
import { participantName } from '@/app/api/audit/_server'

const paymentSummary = (name: string, row: any) =>
    `Платёж: ${name || 'участник'}, ${monthLabel(row?.month_number, row?.year)} — ${rowMoney(row, 'fact_amount')}`

// GET - Fetch monthly payments with optional filters
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const participantId = searchParams.get('participant_id')
        const monthNumber = searchParams.get('month_number')
        const year = searchParams.get('year')
        const status = searchParams.get('status')

        let query = supabaseAdmin
            .from('monthly_payments')
            .select(`
        *,
        participant:participants(*),
        program:programs(*)
      `)

        if (participantId) {
            query = query.eq('participant_id', participantId)
        }
        if (monthNumber) {
            query = query.eq('month_number', monthNumber)
        }
        if (year) {
            query = query.eq('year', year)
        }
        if (status) {
            query = query.eq('status', status)
        }

        const { data, error } = await query.order('year', { ascending: false })
            .order('month_number', { ascending: false })

        if (error) throw error

        // Automatically detect overdue payments
        const currentDate = new Date()
        const currentMonth = currentDate.getMonth() + 1
        const currentYear = currentDate.getFullYear()

        const updatedData = data?.map(payment => {
            // Check if payment is from a past month
            const isPastMonth = payment.year < currentYear ||
                (payment.year === currentYear && payment.month_number < currentMonth)

            // If past month and not fully paid, mark as overdue
            if (isPastMonth && payment.status !== 'paid') {
                const planAmount = payment.plan_amount ?? payment.amount ?? 0
                const factAmount = payment.fact_amount || 0

                if (factAmount < planAmount) {
                    return { ...payment, status: 'overdue' }
                }
            }

            return payment
        })

        return NextResponse.json({ data: updatedData }, { status: 200 })
    } catch (error: any) {
        console.error('Error fetching monthly payments:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST - Create or update payment record
export async function POST(req: Request) {
    try {
        const body = roundMoneyFields(await req.json())

        // Upsert: read the current row first so the журнал records update vs create
        let before: any = null
        if (body?.participant_id && body?.month_number != null && body?.year != null) {
            const { data: existing } = await supabaseAdmin
                .from('monthly_payments')
                .select('*')
                .eq('participant_id', body.participant_id)
                .eq('month_number', body.month_number)
                .eq('year', body.year)
                .maybeSingle()
            before = existing ?? null
        }

        const { data, error } = await supabaseAdmin
            .from('monthly_payments')
            .upsert([body], { onConflict: 'participant_id,month_number,year' })
            .select(`
        *,
        participant:participants(*),
        program:programs(*)
      `)

        if (error) throw error

        const saved = data?.[0]
        if (saved) {
            const { participant, program, ...after } = saved as any
            const summary = paymentSummary(participant?.name ?? '', after)
            await logAudit(req, {
                table: 'monthly_payments',
                recordId: after.id,
                action: before ? 'update' : 'create',
                summary: before ? `${summary}${changeSuffix(before, after)}` : summary,
                before,
                after,
            })
        }

        return NextResponse.json({ data }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating/updating payment:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}


// DELETE - Remove payment record
export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')

        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

        const before = await fetchRow('monthly_payments', id)
        const name = before ? await participantName(before.participant_id) : ''

        const { error } = await supabaseAdmin
            .from('monthly_payments')
            .delete()
            .eq('id', id)

        if (error) throw error

        if (before) {
            await logAudit(req, {
                table: 'monthly_payments',
                recordId: id,
                action: 'delete',
                summary: paymentSummary(name, before),
                before,
            })
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting payment:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
